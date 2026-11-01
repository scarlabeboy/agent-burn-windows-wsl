import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  backfillCodex,
  detectSources,
  getAutostart,
  loadLimitUsage,
  loadQuota,
  loadUsage,
  readPeriod,
  readSeen,
  readSettings,
  readTab,
  setAutostart,
  setCloseToTray,
  setTrayTooltip,
  setWslKeepalive,
  writePeriod,
  writeSeen,
  writeSettings,
  writeTab,
} from "./api";
import { HarnessSettings } from "./HarnessSettings";
import { SettingRow, SettingsCard, Switch } from "./SettingsUi";
import { EmptyState } from "./EmptyState";
import { EnvIcon } from "./EnvIcons";
import { StatusBar } from "./StatusBar";
import { useUpdater, type UpdateState } from "./updater";
import { LimitUsageChart } from "./LimitUsageChart";
import type { LimitUsageDay } from "./limitUsage";
import { SUPPORTED_HARNESSES, disabledHarnesses, groupHarnesses, scanAgents } from "./harnesses";
import { formatUsd, mergeReports } from "./aggregate";
import {
  backfilledAt,
  cacheReport,
  cachedReports,
  flush,
  loadArchive,
  mergeBackfill,
  recordReading,
} from "./archive";
import {
  PERIOD_LABELS,
  PERIODS,
  compactDate,
  defaultGranularity,
  filterReport,
  isoDate,
  rangeFor,
  type Period,
} from "./periods";
import { quotaCards, type QuotaCard } from "./quota";
import { pickClaudeAccount, pickSubscription } from "./subscription";
import type {
  Detected,
  QuotaReading,
  Settings,
  SourceId,
  SourceState,
  TabId,
  UsageReport,
  WslMode,
} from "./types";
import {
  BrandIcon,
  EnvironmentSplit,
  HarnessList,
  Models,
  OverviewIcon,
  Page,
  QuotaSection,
  SpendChart,
  SubscriptionCard,
  Stats,
  TokenBreakdownCard,
  agentLabel,
  asReport,
} from "./views";

const SUBSCRIPTIONS = ["codex", "claude", "cursor"];
const OVERVIEW = "overview";
/** The weekly Codex limit per day changes slowly: read again after this long. */
const LIMIT_USAGE_TTL_MS = 5 * 60_000;
const WSL_MODE_HINTS: Record<WslMode, string> = {
  off: "Windows uniquement : WSL n'est jamais interrogé et son onglet est caché.",
  auto: "WSL est lu quand il tourne déjà ; l'application ne le réveille jamais.",
  keep: "L'application garde WSL allumé tant qu'elle tourne (« Quitter » de l'icône l'arrête). Fermer la fenêtre ne change rien.",
};
/** Each source's Claude plan is read from its own sign-in file; there is no manual choice. */
const CLAUDE_PLAN = "auto";
/** Period scans are reused for this long before being fetched again. */
const DETAIL_TTL_MS = 10 * 60_000;

function reportOf(state: SourceState | undefined): UsageReport | undefined {
  if (!state) return undefined;
  if (state.status === "ready") return state.report;
  if (state.status === "loading" || state.status === "error") return state.previous;
  return undefined;
}

/** The weekly Codex limit per day, or the reason there is none to show. */
function LimitUsageSection({
  offline,
  best,
  attempted,
  label,
}: {
  offline: boolean;
  best?: { id: string; days: LimitUsageDay[] };
  attempted: boolean;
  label: (id: string) => string;
}) {
  if (offline) {
    return <div className="notice">Limite hebdomadaire par jour indisponible en mode hors ligne : elle vient du réseau.</div>;
  }
  if (best) return <LimitUsageChart days={best.days} where={label(best.id)} />;
  return (
    <div className="notice">
      {attempted
        ? "Limite hebdomadaire par jour non lue : connexion Codex introuvable dans cet environnement, ou tableau de bord injoignable."
        : "Lecture de la limite hebdomadaire par jour…"}
    </div>
  );
}

/** Why a harness page has no quota, in the words of the open tab. */
function quotaMissing(harness: string, tab: TabId, wslRunning: boolean): string {
  const name = agentLabel(harness);
  if (tab === "wsl" && !wslRunning) return `Quota ${name} non lu : WSL est éteint et l'application ne le démarre pas.`;
  const where = tab === "windows" ? "sous Windows" : tab === "wsl" ? "dans WSL" : "sur cet ordinateur";
  if (harness === "claude") {
    return (
      `Quota ${name} non lu ${where} : aucune connexion lisible (fichier ~/.claude/.credentials.json). ` +
      "Connectez Claude Code dans cet environnement (commande claude) pour lire le quota et le plan."
    );
  }
  return (
    `Quota ${name} non lu ${where} : aucune connexion lisible (fichier ~/.codex/auth.json), ou le service ne répond pas. ` +
    "Connectez Codex dans cet environnement (commande codex) pour lire le quota."
  );
}

/** What the settings say about updates, after the last check. */
function updateHint(state: UpdateState): string {
  switch (state.status) {
    case "checking":
      return "Recherche en cours…";
    case "none":
      return `À jour (vérifié à ${new Date(state.checkedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}).`;
    case "available":
      return `La version ${state.version} est disponible. L'application se ferme pendant l'installation puis redémarre.`;
    case "installing":
      return state.percent !== undefined ? `Téléchargement… ${state.percent} %` : "Installation…";
    case "error":
      return `Recherche impossible : ${state.message}`;
    default:
      return "Pas encore vérifié.";
  }
}

function pillClass(remaining: number): string {
  if (remaining < 20) return "pill bad";
  if (remaining < 50) return "pill mid";
  return "pill ok";
}

function Pending({ state, label }: { state: SourceState | undefined; label: string }) {
  if (state?.status === "error") {
    return (
      <div className="notice error">
        <strong>{label.charAt(0).toUpperCase() + label.slice(1)} : lecture impossible.</strong> {state.message}
      </div>
    );
  }
  return <div className="notice">Lecture de {label} en cours…</div>;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(readSettings);
  const [detected, setDetected] = useState<Detected | null>(null);
  const [states, setStates] = useState<Record<string, SourceState>>({});
  const [quotas, setQuotas] = useState<Record<string, Record<string, QuotaReading>>>({});
  const [storedTab, setStoredTab] = useState<TabId | null>(readTab);
  const [distro, setDistro] = useState<string | null>(null);
  const [page, setPage] = useState<string>(OVERVIEW);
  const [showSettings, setShowSettings] = useState(false);
  const [archiveReady, setArchiveReady] = useState(false);
  const [period, setPeriodState] = useState<Period>(readPeriod);
  const [details, setDetails] = useState<Record<string, { report: UsageReport; loadedAt: number }>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [autostart, setAutostartState] = useState<boolean | null>(null);
  const detailsRef = useRef(details);
  detailsRef.current = details;
  const setPeriod = (next: Period) => {
    setPeriodState(next);
    writePeriod(next);
  };

  const distros = useMemo(
    () => (settings.wslMode !== "off" ? (detected?.distros ?? []) : []),
    [settings.wslMode, detected],
  );
  const sourceIds = useMemo<SourceId[]>(
    () => ["windows", ...distros.map((entry) => `wsl:${entry.name}` as SourceId)],
    [distros],
  );
  // Sources that can be read now: a stopped WSL distribution keeps its last report instead.
  const readableIds = useMemo<SourceId[]>(
    () => ["windows", ...distros.filter((entry) => entry.running).map((entry) => `wsl:${entry.name}` as SourceId)],
    [distros],
  );
  const readableKey = readableIds.join(",");

  // Harnesses turned off are not scanned. `seen` remembers every harness that ever had data,
  // so a disabled one stays listed even though a scan no longer reports it.
  const [seen, setSeen] = useState<string[]>(readSeen);
  const disabled = useMemo(() => disabledHarnesses(settings.harnessStates), [settings.harnessStates]);
  const disabledKey = disabled.join(",");
  const scanKey = scanAgents(disabled, seen)?.join(",") ?? "";
  const agentsToScan = useMemo(() => (scanKey ? scanKey.split(",") : undefined), [scanKey]);
  const activeDistro = distros.find((entry) => entry.name === distro) ?? distros[0];
  const hasWsl = distros.length > 0;
  // Windows alone when WSL is off or absent; otherwise the last tab, Computer on first run.
  const tab: TabId = hasWsl ? (storedTab ?? "computer") : "windows";
  const setTab = (next: TabId) => {
    setStoredTab(next);
    writeTab(next);
  };

  // Saved quota history and the last reports load first, so the app opens with data to show.
  useEffect(() => {
    loadArchive()
      .catch(() => undefined)
      .finally(() => {
        setStates((current) => {
          const next = { ...current };
          for (const [id, cached] of Object.entries(cachedReports())) {
            next[id] ??= { status: "ready", report: cached.report, loadedAt: cached.loadedAt };
          }
          return next;
        });
        setArchiveReady(true);
      });
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  // The detection only lists WSL, it never starts it: this check is cheap, so it repeats to
  // notice a distribution starting or stopping. With WSL off, WSL is not queried at all.
  useEffect(() => {
    if (settings.wslMode === "off") {
      setDetected({ distros: [] });
      return;
    }
    let cancelled = false;
    const check = () =>
      detectSources()
        // A failed check says nothing new: the last known distributions stay.
        .catch(() => null)
        .then((next) => {
          if (!cancelled && next)
            setDetected((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
        });
    void check();
    const timer = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [settings.wslMode]);

  // "Maintenu allumé": the app keeps each distribution awake while it runs and renews that every
  // few seconds, so a distribution that was shut down comes back. Any other mode stops it.
  useEffect(() => {
    const keep = settings.wslMode === "keep";
    void setWslKeepalive(keep).catch(() => undefined);
    if (!keep) return;
    const timer = setInterval(() => void setWslKeepalive(true).catch(() => undefined), 15_000);
    return () => clearInterval(timer);
  }, [settings.wslMode]);

  const scanning = useRef(false);
  const rescan = useRef(false);
  const refreshRef = useRef<() => void>(() => undefined);
  const refresh = useCallback((queue = false) => {
    // One scan at a time: a slow WSL read must never overlap the next automatic one.
    // A change of sources (WSL started) waits for the running scan instead of being lost.
    if (scanning.current) {
      if (queue) rescan.current = true;
      return;
    }
    scanning.current = true;
    const scans = readableIds.map((id) => {
      setStates((current) => ({
        ...current,
        [id]: { status: "loading", previous: reportOf(current[id]) },
      }));
      return loadUsage(id === "windows" ? null : id.slice(4), settings.offline, CLAUDE_PLAN, {}, agentsToScan)
        .then((report) => {
          const loadedAt = Date.now();
          cacheReport(id, report, loadedAt);
          setStates((current) => ({ ...current, [id]: { status: "ready", report, loadedAt } }));
        })
        .catch((error) =>
          setStates((current) => ({
            ...current,
            [id]: { status: "error", message: String(error), previous: reportOf(current[id]) },
          })),
        );
    });
    void Promise.all(scans).finally(() => {
      scanning.current = false;
      if (rescan.current) {
        rescan.current = false;
        refreshRef.current();
      }
    });
  }, [readableIds, settings.offline, agentsToScan]);
  refreshRef.current = refresh;

  // Windows is scanned as soon as the archive is loaded. A WSL distribution joins the scan
  // once its detection answers: the sources change, which scans again (queued if one runs).
  // The time of the next automatic scan is kept for the status bar (0: none planned).
  const [nextScan, setNextScan] = useState(0);
  useEffect(() => {
    if (!archiveReady) return;
    refresh(true);
    if (settings.refreshMinutes <= 0) {
      setNextScan(0);
      return;
    }
    const every = settings.refreshMinutes * 60_000;
    setNextScan(Date.now() + every);
    const timer = setInterval(() => {
      refresh();
      setNextScan(Date.now() + every);
    }, every);
    return () => clearInterval(timer);
  }, [detected, archiveReady, refresh, settings.refreshMinutes]);

  // Rebuild Codex limit history from each source's logs: 30 days the first time, then only
  // what changed since the last scan. It starts after the first usage scan has had a head start.
  useEffect(() => {
    if (!archiveReady) return;
    let cancelled = false;
    if (disabled.includes("codex")) return;
    void (async () => {
      await new Promise((resolve) => setTimeout(resolve, 8000));
      for (const id of readableIds) {
        if (cancelled) return;
        const scannedAt = Date.now();
        const last = backfilledAt(id);
        const since = last ? last - 24 * 3600_000 : scannedAt - 30 * 24 * 3600_000;
        try {
          const series = await backfillCodex(id === "windows" ? null : id.slice(4), since);
          if (!cancelled) mergeBackfill("codex", id, series, scannedAt);
        } catch {
          // A source without Codex logs has no history to rebuild.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detected, archiveReady, readableIds, disabledKey]);

  // One quota read at a time per source and harness: a read can wait minutes on a frozen WSL,
  // and the next ones must not pile up behind it.
  const quotaReads = useRef(new Set<string>());
  const refreshQuotas = useCallback(
    (force: boolean) => {
      for (const id of readableIds) {
        const name = id === "windows" ? null : id.slice(4);
        for (const harness of ["claude", "codex"].filter((entry) => !disabled.includes(entry))) {
          const key = `${id}|${harness}`;
          if (quotaReads.current.has(key)) continue;
          quotaReads.current.add(key);
          loadQuota(harness, name, force)
            .then((reading) => {
              // Stored as measured; what is shown has an unconfirmed over-count held back.
              const shown = recordReading(reading);
              setQuotas((current) => {
                // A reading older than the one shown arrived late: it is not the latest state.
                const previous = current[id]?.[harness];
                if (previous && previous.observedAt > reading.observedAt) return current;
                return { ...current, [id]: { ...current[id], [harness]: shown } };
              });
            })
            // A source without a sign-in for this harness simply has no quota to show.
            .catch(() =>
              setQuotas((current) => {
                const { [harness]: _removed, ...rest } = current[id] ?? {};
                return { ...current, [id]: rest };
              }),
            )
            .finally(() => quotaReads.current.delete(key));
        }
      }
    },
    [readableIds, disabledKey],
  );

  // Background behaviour: the Windows startup entry and closing to the notification area.
  useEffect(() => {
    getAutostart()
      .then(setAutostartState)
      .catch(() => setAutostartState(null));
  }, []);
  useEffect(() => {
    void setCloseToTray(settings.closeToTray).catch(() => undefined);
  }, [settings.closeToTray]);
  // The box follows the click at once; writing the startup entry can take seconds on a machine
  // whose security software inspects it. The real state is read back when the write is over.
  const [autostartBusy, setAutostartBusy] = useState(false);
  const toggleAutostart = (enabled: boolean) => {
    setAutostartState(enabled);
    setAutostartBusy(true);
    setAutostart(enabled)
      .catch(() => undefined)
      .then(() => getAutostart())
      .then(setAutostartState)
      .catch(() => undefined)
      .finally(() => setAutostartBusy(false));
  };

  useEffect(() => {
    refreshQuotas(false);
    const timer = setInterval(() => refreshQuotas(false), 60_000);
    return () => clearInterval(timer);
  }, [detected, refreshQuotas]);

  // Tray menu actions, and a last save of the archive before the tray "Quit" ends the process.
  useEffect(() => {
    const unlisten = [
      listen("tray-refresh", () => refreshQuotas(true)),
      listen("quit-requested", () => flush()),
    ];
    return () => {
      unlisten.forEach((pending) => void pending.then((stop) => stop()));
    };
  }, [refreshQuotas]);

  const updater = useUpdater(settings.autoUpdate, settings.offline);
  const updateSettings = (next: Settings) => {
    setSettings(next);
    writeSettings(next);
  };

  const label = (id: string) => (id === "windows" ? "Windows" : `WSL · ${id.slice(4)}`);
  const activeIds: string[] =
    tab === "windows" ? ["windows"] : tab === "wsl" ? (activeDistro ? [`wsl:${activeDistro.name}`] : []) : sourceIds;
  const activeKey = activeIds.join(",");
  // Every source of this tab answered and none has any harness: a first launch, or a machine
  // where no supported agent was used yet.
  const hasNoData =
    activeIds.length > 0 &&
    activeIds.every((id) => {
      const state = states[id];
      return state?.status === "ready" && state.report.agents.length === 0;
    });
  const stoppedNames = distros
    .filter((entry) => !entry.running && activeIds.includes(`wsl:${entry.name}`))
    .map((entry) => entry.name);
  const pendingState = states[activeIds[0] ?? "windows"];
  const lastScan = Math.max(
    0,
    ...sourceIds.map((id) => {
      const state = states[id];
      return state?.status === "ready" ? state.loadedAt : 0;
    }),
  );

  // A quota is read in one environment: a tab shows only its own readings, and a source that
  // cannot be read now (WSL stopped) shows none rather than an old value. When several sources
  // are shown together (Computer), only the freshest reading of each harness is kept.
  const quotaCardsFor = (ids: string[]): QuotaCard[] => {
    const freshest = new Map<string, { source: string; reading: QuotaReading }>();
    for (const id of ids.filter((entry) => readableIds.includes(entry as SourceId))) {
      for (const reading of Object.values(quotas[id] ?? {})) {
        if (disabled.includes(reading.agent)) continue;
        const best = freshest.get(reading.agent);
        if (!best || reading.observedAt > best.reading.observedAt) {
          freshest.set(reading.agent, { source: label(id), reading });
        }
      }
    }
    return quotaCards([...freshest.values()]);
  };
  const cards: QuotaCard[] = useMemo(
    () => quotaCardsFor(activeIds),
    [quotas, activeKey, readableKey, disabledKey],
  );
  const accountCards: QuotaCard[] = useMemo(
    () => quotaCardsFor(sourceIds),
    [quotas, sourceIds, readableKey, disabledKey],
  );
  const pageCards = cards.filter((card) => card.harness === page);

  // Quota summary on the notification-area icon: the account, whatever tab is open.
  const tooltip = accountCards
    .map((card) => {
      const session = card.session ? `5 h ${card.session.remaining.toFixed(0)}% · ` : "";
      return `${agentLabel(card.harness)} : ${session}sem. ${card.weekly.remaining.toFixed(0)}%`;
    })
    .join("\n");
  useEffect(() => {
    // Without any quota the summary goes too, rather than keep percentages that no longer hold.
    void setTrayTooltip(tooltip ? `Agent Burn Windows\n${tooltip}` : "Agent Burn Windows").catch(() => undefined);
  }, [tooltip]);

  // "Since reset" needs a weekly quota cycle, so it only applies on Claude and Codex pages.
  const effectivePeriod: Period =
    period === "rtd" && (page === OVERVIEW || pageCards.length === 0) ? "all" : period;
  const resetStartMs = pageCards[0]?.weekly.startMs;
  const today = isoDate(new Date());
  const range = useMemo(
    () => rangeFor(effectivePeriod, new Date(), resetStartMs),
    [effectivePeriod, resetStartMs !== undefined ? isoDate(new Date(resetStartMs)) : undefined, today],
  );
  const rangeSince = range?.since;
  const rangeUntil = range?.until;
  const detailScope = page === OVERVIEW ? "*" : page;
  const detailKey = (id: string) => `${id}|${rangeSince}|${rangeUntil ?? ""}|${detailScope}`;

  // Totals and daily series of a period are filtered locally and are exact; per-model detail
  // comes from a period scan of the CLI, loaded on demand and reused for a few minutes.
  const localParts = useMemo(
    () =>
      activeKey
        .split(",")
        .filter(Boolean)
        .flatMap((id) => {
          const base = reportOf(states[id]);
          return base ? [{ id, label: label(id), report: range ? filterReport(base, range) : base }] : [];
        }),
    [activeKey, states, rangeSince, rangeUntil],
  );
  const localReport = useMemo(
    () => (localParts.length ? mergeReports(localParts.map((part) => part.report)) : undefined),
    [localParts],
  );
  const report = useMemo(() => {
    if (!localReport) return undefined;
    if (!range) return localReport;
    return mergeReports(localParts.map((part) => details[detailKey(part.id)]?.report ?? part.report));
  }, [localReport, localParts, details, rangeSince, rangeUntil, detailScope]);
  const detailError = activeKey
    .split(",")
    .map((id) => detailErrors[detailKey(id)])
    .find(Boolean);

  useEffect(() => {
    if (!rangeSince || !archiveReady) return;
    let cancelled = false;
    void (async () => {
      for (const id of activeKey.split(",").filter((entry) => entry && readableKey.split(",").includes(entry))) {
        if (cancelled) return;
        const key =`${id}|${rangeSince}|${rangeUntil ?? ""}|${detailScope}`;
        const cached = detailsRef.current[key];
        if (cached && Date.now() - cached.loadedAt < DETAIL_TTL_MS) continue;
        try {
          const detail = await loadUsage(
            id === "windows" ? null : id.slice(4),
            settings.offline,
            CLAUDE_PLAN,
            { since: compactDate(rangeSince), until: rangeUntil ? compactDate(rangeUntil) : undefined },
            detailScope === "*" ? agentsToScan : [detailScope],
          );
          setDetails((current) => ({ ...current, [key]: { report: detail, loadedAt: Date.now() } }));
          setDetailErrors(({ [key]: _cleared, ...rest }) => rest);
        } catch (error) {
          setDetailErrors((current) => ({ ...current, [key]: String(error) }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeSince, rangeUntil, detailScope, activeKey, readableKey, detected, archiveReady, lastScan, settings.offline, agentsToScan]);

  // The weekly Codex limit per day belongs to the account, so any source that can read it gives
  // the whole picture: the open tab shows the freshest answer among its own sources.
  const [limitUsage, setLimitUsage] = useState<Record<string, { days: LimitUsageDay[]; at: number }>>({});
  const limitUsageRef = useRef(limitUsage);
  limitUsageRef.current = limitUsage;
  useEffect(() => {
    if (page !== "codex" || settings.offline || !archiveReady || disabled.includes("codex")) return;
    for (const id of activeIds) {
      if (!readableIds.includes(id as SourceId)) continue;
      const known = limitUsageRef.current[id];
      if (known && Date.now() - known.at < LIMIT_USAGE_TTL_MS) continue;
      loadLimitUsage(id === "windows" ? null : id.slice(4))
        .catch(() => [] as LimitUsageDay[])
        .then((days) => setLimitUsage((current) => ({ ...current, [id]: { days, at: Date.now() } })));
    }
  }, [page, activeKey, readableKey, settings.offline, archiveReady, lastScan, disabledKey]);
  const limitEntries = activeIds.flatMap((id) => (limitUsage[id] ? [{ id, ...limitUsage[id] }] : []));
  const limitBest = limitEntries.filter((entry) => entry.days.length > 0).sort((a, b) => b.at - a.at)[0];
  const limitAttempted = limitEntries.length > 0;

  // Plan, price and account meters come from the sources of the open tab.
  const sourceReports = useMemo(
    () =>
      activeIds
        .map((id) => reportOf(states[id]))
        .filter((entry): entry is UsageReport => entry !== undefined),
    [activeKey, states],
  );

  // Only offered with WSL: with Windows alone there is nothing to choose.
  const tabs: { id: TabId; label: string }[] = hasWsl
    ? [
        { id: "computer", label: "Ordinateur" },
        { id: "windows", label: "Windows" },
        { id: "wsl", label: "WSL" },
      ]
    : [];

  const loading = sourceIds.some((id) => states[id]?.status === "loading");
  // The sidebar always uses the locally filtered report, which lists every harness.
  // A report scanned before a harness was turned off (or from a stopped WSL) may still list it.
  const visibleAgents = localReport?.agents.filter((agent) => !disabled.includes(agent.agent)) ?? [];
  const agentIds = visibleAgents.map((agent) => agent.agent);

  // Remember each harness that shows data, and leave the page of one that was just turned off.
  const detectedNow = useMemo(
    () => [
      ...new Set(
        sourceIds.flatMap((id) => reportOf(states[id])?.agents.map((agent) => agent.agent) ?? []),
      ),
    ],
    [states, sourceIds],
  );
  useEffect(() => {
    const fresh = detectedNow.filter((id) => !seen.includes(id) && !disabled.includes(id));
    if (fresh.length === 0) return;
    const next = [...seen, ...fresh].sort();
    setSeen(next);
    writeSeen(next);
  }, [detectedNow, seen, disabledKey]);
  useEffect(() => {
    if (disabled.includes(page)) setPage(OVERVIEW);
  }, [page, disabledKey]);
  const harnessGroups = groupHarnesses(detectedNow, seen, disabled);
  const toggleHarness = (id: string, off: boolean) => {
    const { [id]: _removed, ...rest } = settings.harnessStates;
    updateSettings({ ...settings, harnessStates: off ? { ...rest, [id]: "off" } : rest });
  };
  const subscriptionIds = SUBSCRIPTIONS.filter(
    (id) => agentIds.includes(id) || cards.some((card) => card.harness === id),
  );
  const otherAgents = visibleAgents.filter((agent) => !SUBSCRIPTIONS.includes(agent.agent));
  const weeklyLeft = (id: string) => cards.find((card) => card.harness === id)?.weekly.remaining;
  const selected =
    page === OVERVIEW
      ? null
      : (report?.agents.find((agent) => agent.agent === page) ??
        // A period without usage for this harness: show its exact zero totals.
        (range ? localReport?.agents.find((agent) => agent.agent === page) : undefined));
  const approx = report?.approxDetail ?? false;

  // The settings take the place of the page; choosing a page or an environment leaves them.
  const openPage = (id: string) => {
    setPage(id);
    setShowSettings(false);
  };
  const openTab = (id: TabId) => {
    setTab(id);
    setShowSettings(false);
  };

  const header = showSettings ? (
    <div className="page-head">
      <h1 className="page-title">Réglages</h1>
      <p className="muted page-sub">Démarrage, données, WSL et harness</p>
    </div>
  ) : (
    <div className="page-head">
      <h1 className="page-title">
        {page === OVERVIEW ? (
          <>
            <OverviewIcon size={22} /> Vue d'ensemble
          </>
        ) : (
          <>
            <BrandIcon agent={page} size={22} /> {agentLabel(page)}
          </>
        )}
      </h1>
      <p className="muted page-sub">
        {tab === "computer"
          ? "Windows + WSL additionnés"
          : tab === "wsl"
            ? `WSL · ${activeDistro?.name ?? ""}`
            : "Windows natif"}{" "}
        · {PERIOD_LABELS[effectivePeriod]}
        {period === "rtd" && effectivePeriod === "all" &&
          " (« Depuis le reset » s'applique aux pages Claude Code et Codex)"}
      </p>
    </div>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand-row">
          <span className="flame">🔥</span>
          <strong>Agent Burn Windows</strong>
        </div>

        {tabs.length > 0 && (
          <>
            <div className="nav-group">Environnement</div>
            {tabs.map((entry) => (
              <button
                key={entry.id}
                className={`nav env${tab === entry.id ? " on" : ""}`}
                onClick={() => openTab(entry.id)}
              >
                <span className="nav-icon">
                  <EnvIcon env={entry.id} />
                </span>
                <span className="nav-label">{entry.label}</span>
              </button>
            ))}
            {tab === "wsl" && distros.length > 1 && (
              <select
                className="nav-select"
                value={activeDistro?.name}
                onChange={(event) => setDistro(event.target.value)}
                title="Distribution WSL"
              >
                {distros.map((entry) => (
                  <option key={entry.name}>{entry.name}</option>
                ))}
              </select>
            )}
          </>
        )}

        <div className="nav-group">Vue</div>
        <button className={`nav${page === OVERVIEW && !showSettings ? " on" : ""}`} onClick={() => openPage(OVERVIEW)}>
          <OverviewIcon />
          <span className="nav-label">Vue d'ensemble</span>
          <span className="nav-value">{localReport ? formatUsd(localReport.totals.totalCost) : ""}</span>
        </button>

        {subscriptionIds.length > 0 && <div className="nav-group">Abonnements</div>}
        {subscriptionIds.map((id) => {
          const left = weeklyLeft(id);
          const agent = localReport?.agents.find((entry) => entry.agent === id);
          return (
            <button key={id} className={`nav${page === id && !showSettings ? " on" : ""}`} onClick={() => openPage(id)}>
              <BrandIcon agent={id} />
              <span className="nav-label">{agentLabel(id)}</span>
              {left !== undefined ? (
                <span className={pillClass(left)}>{left.toFixed(0)}%</span>
              ) : (
                <span className="nav-value">{agent ? formatUsd(agent.totalCost) : ""}</span>
              )}
            </button>
          );
        })}

        {otherAgents.length > 0 && <div className="nav-group">Harness</div>}
        {otherAgents.map((agent) => (
          <button
            key={agent.agent}
            className={`nav${page === agent.agent && !showSettings ? " on" : ""}`}
            onClick={() => openPage(agent.agent)}
          >
            <BrandIcon agent={agent.agent} />
            <span className="nav-label">{agentLabel(agent.agent)}</span>
            <span className="nav-value">{formatUsd(agent.totalCost)}</span>
          </button>
        ))}
      </aside>

      <div className="content">
        <header className="topbar">
          {header}
          <div className="spacer" />
          {!showSettings && (
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value as Period)}
              title="Période affichée"
            >
              {PERIODS.map((value) => (
                <option key={value} value={value}>
                  {PERIOD_LABELS[value]}
                </option>
              ))}
            </select>
          )}
          <button
            className="icon"
            onClick={() => {
              refresh();
              refreshQuotas(true);
            }}
            disabled={loading}
            title="Actualiser"
          >
            {loading ? "…" : "⟳"}
          </button>
          <button
            className={`icon${showSettings ? " on" : ""}`}
            onClick={() => setShowSettings((value) => !value)}
            title={showSettings ? "Fermer les réglages" : "Réglages"}
          >
            ⚙
          </button>
        </header>

        <main>
          {showSettings ? (
            <div className="settings">
              <SettingsCard title="Général">
                <SettingRow
                  title="Lancer au démarrage de Windows"
                  description="L'application s'ouvre réduite dans la zone de notification."
                >
                  <Switch
                    checked={autostart ?? false}
                    disabled={autostart === null || autostartBusy}
                    title={autostartBusy ? "Enregistrement dans Windows…" : undefined}
                    label="Lancer au démarrage de Windows"
                    onChange={toggleAutostart}
                  />
                </SettingRow>
                <SettingRow
                  title="Rester dans la zone de notification"
                  description="Fermer la fenêtre garde l'application active en arrière-plan ; « Quitter » de l'icône l'arrête."
                >
                  <Switch
                    checked={settings.closeToTray}
                    label="Rester dans la zone de notification"
                    onChange={(next) => updateSettings({ ...settings, closeToTray: next })}
                  />
                </SettingRow>
              </SettingsCard>

              <SettingsCard title="Données">
                <SettingRow
                  title="Rafraîchir l'usage automatiquement"
                  description="Relit les journaux des harness. Les quotas se relisent chaque minute."
                >
                  <select
                    value={settings.refreshMinutes}
                    onChange={(event) => updateSettings({ ...settings, refreshMinutes: Number(event.target.value) })}
                  >
                    <option value={0}>Jamais</option>
                    <option value={1}>Chaque minute</option>
                    <option value={5}>Toutes les 5 minutes</option>
                    <option value={10}>Toutes les 10 minutes</option>
                    <option value={30}>Toutes les 30 minutes</option>
                  </select>
                </SettingRow>
                <SettingRow
                  title="Mode hors ligne"
                  description="Aucun appel réseau, mais les modèles récents peuvent afficher 0 $."
                >
                  <Switch
                    checked={settings.offline}
                    label="Mode hors ligne"
                    onChange={(next) => updateSettings({ ...settings, offline: next })}
                  />
                </SettingRow>
              </SettingsCard>

              {/* Hidden when there is no WSL to turn off; kept while off so it can be turned back on. */}
              {(settings.wslMode !== "auto" || distros.length > 0) && (
                <SettingsCard title="WSL">
                  <SettingRow title="Lecture de WSL" description={WSL_MODE_HINTS[settings.wslMode]}>
                    <select
                      value={settings.wslMode}
                      onChange={(event) => updateSettings({ ...settings, wslMode: event.target.value as WslMode })}
                    >
                      <option value="off">Désactivé</option>
                      <option value="auto">Automatique</option>
                      <option value="keep">Maintenu allumé</option>
                    </select>
                  </SettingRow>
                </SettingsCard>
              )}

              <SettingsCard title="Mises à jour">
                <SettingRow
                  title="Rechercher les mises à jour automatiquement"
                  description="Au démarrage puis toutes les 6 heures, sur les versions publiées sur GitHub. Jamais en mode hors ligne."
                >
                  <Switch
                    checked={settings.autoUpdate}
                    label="Rechercher les mises à jour automatiquement"
                    onChange={(next) => updateSettings({ ...settings, autoUpdate: next })}
                  />
                </SettingRow>
                <SettingRow title="Version installée" description={updateHint(updater.state)}>
                  {updater.state.status === "available" ? (
                    <button className="btn primary" onClick={() => void updater.install()}>
                      Installer la {updater.state.version}
                    </button>
                  ) : (
                    <button
                      className="btn"
                      disabled={settings.offline || updater.state.status === "checking" || updater.state.status === "installing"}
                      onClick={() => void updater.checkNow()}
                    >
                      Rechercher maintenant
                    </button>
                  )}
                </SettingRow>
              </SettingsCard>

              <SettingsCard title="Harness">
                <HarnessSettings groups={harnessGroups} onToggle={toggleHarness} />
                <p className="muted small set-note">
                  Un harness désactivé n'est plus lu (le scan est plus rapide) et disparaît des totaux et des quotas.
                </p>
              </SettingsCard>
            </div>
          ) : !report ? (
            stoppedNames.length > 0 && !pendingState ? (
              <div className="notice">
                WSL éteint ({stoppedNames.join(", ")}) : l'application ne le démarre pas et n'a pas encore de
                données de lui. Elles apparaîtront dès qu'il tourne.
              </div>
            ) : (
              <Pending state={pendingState} label={tab === "computer" ? "l'ordinateur" : label(activeIds[0] ?? "windows")} />
            )
          ) : (
            <Page>
              {stoppedNames.length > 0 && (
                <div className="notice">
                  WSL éteint ({stoppedNames.join(", ")}) : l'application ne le démarre pas, ses chiffres
                  datent de sa dernière lecture.
                </div>
              )}
              {tab === "computer" && localParts.length < sourceIds.length - stoppedNames.length && (
                <div className="notice error">Une source n'a pas pu être lue : le total de l'ordinateur est partiel.</div>
              )}
              {page === OVERVIEW && hasNoData ? (
                <EmptyState
                  where={tab === "windows" ? "sur ce Windows" : tab === "wsl" ? "dans WSL" : "sur Windows ni dans WSL"}
                  harnesses={SUPPORTED_HARNESSES.map(agentLabel)}
                  disabledCount={disabled.length}
                />
              ) : page === OVERVIEW ? (
                <>
                  <Stats report={report} label="Tous harness confondus" period={PERIOD_LABELS[effectivePeriod]} />
                  {tab === "computer" && <EnvironmentSplit parts={localParts} />}
                  <div className="grid">
                    <SpendChart
                      key={effectivePeriod}
                      report={report}
                      defaultGranularity={defaultGranularity(effectivePeriod)}
                    />
                    <HarnessList report={report} onSelect={setPage} />
                  </div>
                  <Models report={report} detailError={detailError} />
                </>
              ) : (
                <>
                  {(page === "claude" || page === "codex") && pageCards.length === 0 && (
                    <div className="notice">{quotaMissing(page, tab, activeDistro?.running ?? false)}</div>
                  )}
                  {pageCards.map((card) => (
                    <QuotaSection key={`${card.harness}-${card.sources.join()}`} card={card} />
                  ))}
                  {(page === "claude" || page === "codex") && (
                    <SubscriptionCard
                      harness={page}
                      sub={pickSubscription(sourceReports, page)}
                      account={pickClaudeAccount(sourceReports)}
                      card={pageCards[0]}
                    />
                  )}
                  {page === "codex" && (
                    <LimitUsageSection
                      offline={settings.offline}
                      best={limitBest}
                      attempted={limitAttempted}
                      label={label}
                    />
                  )}
                  {selected ? (
                    <>
                      <Stats
                        report={asReport(selected, approx)}
                        label={agentLabel(selected.agent)}
                        period={PERIOD_LABELS[effectivePeriod]}
                      />
                      <SpendChart
                        key={effectivePeriod}
                        report={asReport(selected, approx)}
                        defaultGranularity={defaultGranularity(effectivePeriod)}
                      />
                      <Models report={asReport(selected, approx)} detailError={detailError} />
                      <TokenBreakdownCard
                        breakdown={selected.tokenBreakdown}
                        pending={approx}
                        detailError={detailError}
                      />
                    </>
                  ) : (
                    <div className="notice">Aucune donnée d'usage pour {agentLabel(page)} dans cet environnement.</div>
                  )}
                </>
              )}
            </Page>
          )}
        </main>
        <StatusBar
          loading={loading}
          lastScan={lastScan}
          nextScan={nextScan}
          update={updater.state}
          onInstall={() => void updater.install()}
        />
      </div>
    </div>
  );
}
