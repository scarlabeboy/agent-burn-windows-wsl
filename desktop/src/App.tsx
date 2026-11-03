import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CLI_MISSING,
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
  setRestartOnCrash,
  setTrayLabels,
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
import { StatusBar, useAppVersion } from "./StatusBar";
import { Glyph } from "./TitleIcons";
import { UpdateDialog } from "./UpdateDialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { REPO_URL, useUpdater, type UpdateState } from "./updater";
import { LimitUsageChart } from "./LimitUsageChart";
import type { LimitUsageDay } from "./limitUsage";
import { SUPPORTED_HARNESSES, disabledHarnesses, groupHarnesses, scanAgents } from "./harnesses";
import { formatUsd, mergeReports, totalBreakdown } from "./aggregate";
import { withArchive } from "./dailyArchive";
import {
  archivedDays,
  backfilledAt,
  cacheReport,
  cachedReports,
  flush,
  loadArchive,
  mergeBackfill,
  recordReading,
} from "./archive";
import { LANG_NAMES, locale, setLang, systemLang, t, type Lang } from "./i18n";
import {
  PERIODS,
  compactDate,
  defaultGranularity,
  filterReport,
  isoDate,
  periodLabel,
  rangeFor,
  type Period,
} from "./periods";
import { updateError } from "./releaseNotes";
import { formatAge, freshness, quotaCards, quotaFailure, type QuotaCard } from "./quota";
import { useNow } from "./useNow";
import {
  autoUpdateActive,
  autoUpdateHint,
  offlineHint,
  quotaHint,
  limitUsageOffReason,
  quotaOffReason,
  quotasActive,
  refreshHint,
  subscriptionOffReason,
} from "./settingsHints";
import { pickClaudeAccount, pickSubscription, withAccountSpend } from "./subscription";
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
  QuotaIcon,
  QuotaSection,
  SpendChart,
  SubscriptionCard,
  Stats,
  TokenBreakdownCard,
  agentLabel,
  asReport,
} from "./views";

const SUBSCRIPTIONS = ["codex", "claude", "cursor"];
const MELVYNX_URL = "https://github.com/Melvynx/agent-burn";
const OVERVIEW = "overview";
/** The weekly Codex limit per day changes slowly: read again after this long. */
const LIMIT_USAGE_TTL_MS = 5 * 60_000;
/** How long a quota stays on screen after a failed read, so one missed read does not blank it. */
const QUOTA_GRACE_MS = 2 * 60_000;
/** Each source's Claude plan is read from its own sign-in file; there is no manual choice. */
const CLAUDE_PLAN = "auto";
function reportOf(state: SourceState | undefined): UsageReport | undefined {
  if (!state) return undefined;
  if (state.status === "ready") return state.report;
  if (state.status === "loading" || state.status === "error") return state.previous;
  return undefined;
}

/** When the report on screen for a source was read (0 when there is none). */
function loadedAtOf(state: SourceState | undefined): number {
  if (state?.status === "ready") return state.loadedAt;
  if (state?.status === "loading" || state?.status === "error") return state.previousAt ?? 0;
  return 0;
}

/** The weekly Codex limit per day, or the reason there is none to show. */
function LimitUsageSection({
  offReason,
  best,
  attempted,
  label,
}: {
  offReason?: string;
  best?: { id: string; days: LimitUsageDay[] };
  attempted: boolean;
  label: (id: string) => string;
}) {
  if (offReason) return <div className="notice">{offReason}</div>;
  if (best) return <LimitUsageChart days={best.days} where={label(best.id)} />;
  return <div className="notice">{attempted ? t().app.limitUsageUnread : t().app.limitUsageLoading}</div>;
}

/** Why a harness page has no quota, in the words of the open tab; `cause` when the app knows it. */
function quotaMissing(harness: string, tab: TabId, wslRunning: boolean, cause?: string): string {
  const name = agentLabel(harness);
  const text = t().app;
  if (tab === "wsl" && !wslRunning) return text.quotaWslOff(name);
  const where = text.quotaWhere[tab];
  if (cause) return text.quotaReadFailed(name, where, sourceError(cause));
  return harness === "claude" ? text.quotaMissingClaude(name, where) : text.quotaMissingCodex(name, where);
}

const noUsage = (tokens: number, cost: number) => tokens === 0 && cost === 0;

/** A chosen period without any usage, instead of a page of zeros. */
function EmptyPeriod({ period, harness }: { period: string; harness?: string }) {
  return <div className="notice">{t().app.emptyPeriod(period, harness)}</div>;
}

/** What the settings say about updates, after the last check. */
function updateHint(state: UpdateState, offline: boolean): string {
  const text = t().update;
  if (offline && state.status === "available") return text.foundOffline(state.version);
  switch (state.status) {
    case "checking":
      return text.checking;
    case "none":
      return text.upToDate(
        new Date(state.checkedAt).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }),
      );
    case "available":
      return text.available(state.version);
    case "installing":
      return state.percent !== undefined ? text.downloading(state.percent) : text.installing;
    case "error":
      return text.checkFailed(updateError(state.message));
    default:
      return text.notChecked;
  }
}

/** A source's read error, with the app's own errors said in the interface language. */
const sourceError = (message: string) => (message.includes(CLI_MISSING) ? t().status.cliMissing : message);

function pillClass(remaining: number): string {
  if (remaining < 20) return "pill bad";
  if (remaining < 50) return "pill mid";
  return "pill ok";
}

function Pending({ state, label }: { state: SourceState | undefined; label: string }) {
  if (state?.status === "error") {
    return (
      <div className="notice error">
        <strong>{t().app.readFailed(label.charAt(0).toUpperCase() + label.slice(1))}</strong>{" "}
        {sourceError(state.message)}
      </div>
    );
  }
  return <div className="notice">{t().app.reading(label)}</div>;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(readSettings);
  // Set before anything renders: every text and format below reads it.
  const lang = settings.language ?? systemLang();
  setLang(lang);
  const text = t();
  const [detected, setDetected] = useState<Detected | null>(null);
  const [states, setStates] = useState<Record<string, SourceState>>({});
  const [quotas, setQuotas] = useState<Record<string, Record<string, QuotaReading>>>({});
  const [storedTab, setStoredTab] = useState<TabId | null>(readTab);
  const [distro, setDistro] = useState<string | null>(null);
  const [page, setPage] = useState<string>(OVERVIEW);
  const [showSettings, setShowSettings] = useState(false);
  const [archiveReady, setArchiveReady] = useState(false);
  const [period, setPeriodState] = useState<Period>(readPeriod);
  // Per-model detail of a period, with when it was asked for: it is only used while no scan of
  // its source finished after that, or its figures would trail the totals beside them.
  const [details, setDetails] = useState<Record<string, { report: UsageReport; requestedAt: number }>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [autostart, setAutostartState] = useState<boolean | null>(null);
  const detailsRef = useRef(details);
  detailsRef.current = details;
  const statesRef = useRef(states);
  statesRef.current = states;
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

  // "Kept running": the app keeps each distribution awake while it runs and renews that every
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
        [id]: { status: "loading", previous: reportOf(current[id]), previousAt: loadedAtOf(current[id]) },
      }));
      return loadUsage(id === "windows" ? null : id.slice(4), settings.offline, CLAUDE_PLAN, {}, agentsToScan)
        .then((report) => {
          const loadedAt = Date.now();
          cacheReport(id, report, loadedAt, !settings.offline);
          setStates((current) => ({ ...current, [id]: { status: "ready", report, loadedAt } }));
        })
        .catch((error) =>
          setStates((current) => ({
            ...current,
            [id]: {
              status: "error",
              message: String(error),
              previous: reportOf(current[id]),
              previousAt: loadedAtOf(current[id]),
            },
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
  // The last failure of each source and harness, kept until a reading succeeds.
  const [quotaErrors, setQuotaErrors] = useState<Record<string, string>>({});
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
              setQuotaErrors(({ [key]: _cleared, ...rest }) => rest);
              setQuotas((current) => {
                // A reading older than the one shown arrived late: it is not the latest state.
                const previous = current[id]?.[harness];
                if (previous && previous.observedAt > reading.observedAt) return current;
                return { ...current, [id]: { ...current[id], [harness]: shown } };
              });
            })
            // A source without a sign-in for this harness simply has no quota to show. A reading
            // from the last two minutes stays through one missed read: in WSL without a sign-in,
            // the quota comes from Claude Code's own cache, which the CLI takes only while fresh.
            .catch((error) => {
              setQuotaErrors((current) => ({ ...current, [key]: String(error) }));
              setQuotas((current) => {
                const previous = current[id]?.[harness];
                if (previous && Date.now() - previous.observedAt < QUOTA_GRACE_MS) return current;
                const { [harness]: _removed, ...rest } = current[id] ?? {};
                return { ...current, [id]: rest };
              });
            })
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
  useEffect(() => {
    void setRestartOnCrash(settings.restartOnCrash).catch(() => undefined);
  }, [settings.restartOnCrash]);
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

  // Quotas off, or offline: no read at all; the readings already shown stay with their time.
  const quotasOn = quotasActive(settings);
  useEffect(() => {
    if (!quotasOn) return;
    refreshQuotas(false);
    const timer = setInterval(() => refreshQuotas(false), 60_000);
    return () => clearInterval(timer);
  }, [detected, refreshQuotas, quotasOn]);

  // Tray menu actions, and a last save of the archive before the tray "Quit" ends the process.
  // "Refresh quotas" reads the quotas; with quotas off it reads the usage instead.
  useEffect(() => {
    const unlisten = [
      listen("tray-refresh", () => (quotasOn ? refreshQuotas(true) : refresh())),
      listen("quit-requested", () => flush()),
    ];
    return () => {
      unlisten.forEach((pending) => void pending.then((stop) => stop()));
    };
  }, [refreshQuotas, refresh, quotasOn]);

  const updater =useUpdater(settings.autoUpdate, settings.offline);
  const [showUpdate, setShowUpdate] = useState(false);
  const appVersion = useAppVersion();
  const updateSettings = (next: Settings) => {
    setSettings(next);
    writeSettings(next);
  };

  const label = (id: string) => (id === "windows" ? "Windows" : `WSL · ${id.slice(4)}`);
  const activeIds: string[] =
    tab === "windows" ? ["windows"] : tab === "wsl" ? (activeDistro ? [`wsl:${activeDistro.name}`] : []) : sourceIds;
  const activeKey = activeIds.join(",");
  // Every source of this tab answered and none has any harness: a first launch, or a machine
  // where no supported agent was used yet. A stopped distribution never read yet has nothing to
  // add, so it does not hold the message back (a stopped one with a saved report does count).
  const answeringIds = activeIds.filter((id) => readableIds.includes(id as SourceId) || states[id]);
  const hasNoData =
    answeringIds.length > 0 &&
    answeringIds.every((id) => {
      const state = states[id];
      return state?.status === "ready" && state.report.agents.length === 0;
    });
  const stoppedNames = distros
    .filter((entry) => !entry.running && activeIds.includes(`wsl:${entry.name}`))
    .map((entry) => entry.name);
  const pendingState = states[activeIds[0] ?? "windows"];
  // A failed read keeps the previous figures on screen; the status bar says it failed.
  const failedId = readableIds.find((id) => states[id]?.status === "error");
  const failedState = failedId ? states[failedId] : undefined;
  const scanError =
    failedId && failedState?.status === "error"
      ? text.app.scanError(label(failedId), sourceError(failedState.message))
      : undefined;
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
  // Quotas that are no longer read are not shown anywhere: a stale reading looks live. Their
  // history stays in the archive and comes back with the next reading.
  const cards: QuotaCard[] = useMemo(
    () => (quotasOn ? quotaCardsFor(activeIds) : []),
    [quotas, activeKey, readableKey, disabledKey, quotasOn],
  );
  const accountCards: QuotaCard[] = useMemo(
    () => (quotasOn ? quotaCardsFor(sourceIds) : []),
    [quotas, sourceIds, readableKey, disabledKey, quotasOn],
  );
  const pageCards = cards.filter((card) => card.harness === page);

  // Ages of the quota readings shown in the tooltip and the sidebar, kept current.
  const nowMs = useNow(15_000);
  // Quota summary on the notification-area icon: the account, whatever tab is open. A reading
  // that is not live says how old it is, as the quota cards do.
  const tooltip = accountCards
    .map((card) => {
      const line = text.app.tooltipLine(
        agentLabel(card.harness),
        card.session?.remaining.toFixed(0),
        card.weekly.remaining.toFixed(0),
      );
      return freshness(card.observedAt, nowMs).fresh
        ? line
        : `${line} · ${text.app.tooltipAge(formatAge(nowMs - card.observedAt))}`;
    })
    .join("\n");
  useEffect(() => {
    // Without any quota the summary goes too, rather than keep percentages that no longer hold.
    void setTrayTooltip(tooltip ? `Agent Burn Windows\n${tooltip}` : "Agent Burn Windows").catch(() => undefined);
  }, [tooltip]);
  // The notification-area menu is built by the Rust side: it gets its words from here.
  useEffect(() => {
    void setTrayLabels(t().tray).catch(() => undefined);
  }, [lang]);

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
  const currentDetail = (id: string, key: string) => {
    const detail = detailsRef.current[key];
    return detail && detail.requestedAt >= loadedAtOf(statesRef.current[id]) ? detail.report : undefined;
  };

  // Totals and daily series of a period are filtered locally and are exact; per-model detail
  // comes from a period scan of the CLI, loaded on demand and reused for a few minutes.
  const localParts = useMemo(
    () =>
      activeKey
        .split(",")
        .filter(Boolean)
        .flatMap((id) => {
          const base = reportOf(states[id]);
          if (!base) return [];
          // Days a harness no longer reports (old logs purged) come back from the daily archive.
          const report = withArchive(range ? filterReport(base, range) : base, archivedDays(id), disabled, range ?? undefined);
          return [{ id, label: label(id), report }];
        }),
    [activeKey, states, rangeSince, rangeUntil, disabledKey],
  );
  const localReport = useMemo(
    () => (localParts.length ? mergeReports(localParts.map((part) => part.report)) : undefined),
    [localParts],
  );
  const report = useMemo(() => {
    if (!localReport) return undefined;
    if (!range) return localReport;
    return mergeReports(
      localParts.map((part) => {
        const detail = currentDetail(part.id, detailKey(part.id));
        return detail ? withArchive(detail, archivedDays(part.id), disabled, range) : part.report;
      }),
    );
  }, [localReport, localParts, details, states, rangeSince, rangeUntil, detailScope, disabledKey]);
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
        const key = `${id}|${rangeSince}|${rangeUntil ?? ""}|${detailScope}`;
        // Asked again after each scan of the source, so per-model figures follow the totals.
        if (currentDetail(id, key)) continue;
        const requestedAt = Date.now();
        try {
          const detail = await loadUsage(
            id === "windows" ? null : id.slice(4),
            settings.offline,
            CLAUDE_PLAN,
            { since: compactDate(rangeSince), until: rangeUntil ? compactDate(rangeUntil) : undefined },
            detailScope === "*" ? agentsToScan : [detailScope],
          );
          setDetails((current) => ({ ...current, [key]: { report: detail, requestedAt } }));
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
    if (page !== "codex" || !quotasOn || !archiveReady || disabled.includes("codex")) return;
    for (const id of activeIds) {
      if (!readableIds.includes(id as SourceId)) continue;
      const known = limitUsageRef.current[id];
      if (known && Date.now() - known.at < LIMIT_USAGE_TTL_MS) continue;
      loadLimitUsage(id === "windows" ? null : id.slice(4))
        .catch(() => [] as LimitUsageDay[])
        .then((days) => setLimitUsage((current) => ({ ...current, [id]: { days, at: Date.now() } })));
    }
  }, [page, activeKey, readableKey, quotasOn, archiveReady, lastScan, disabledKey]);
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

  // The quota belongs to the account, so its value counts the spend of every source read now,
  // whichever tab is open.
  const liveReports = useMemo(
    () =>
      readableIds
        .map((id) => reportOf(states[id]))
        .filter((entry): entry is UsageReport => entry !== undefined),
    [readableIds, states],
  );

  // Only offered with WSL: with Windows alone there is nothing to choose.
  const tabs: { id: TabId; label: string }[] = hasWsl
    ? [
        { id: "computer", label: text.app.computer },
        { id: "windows", label: "Windows" },
        { id: "wsl", label: "WSL" },
      ]
    : [];

  const loading = sourceIds.some((id) => states[id]?.status === "loading");

  // Ctrl+R or F5 does what ⟳ does, Ctrl+Shift+R reads the quotas only. The page itself is never
  // reloaded, which would drop what is on screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const reload = event.key === "F5" || (event.ctrlKey && event.key.toLowerCase() === "r");
      if (!reload) return;
      event.preventDefault();
      if (event.repeat) return;
      if (event.ctrlKey && event.shiftKey) {
        if (quotasOn) refreshQuotas(true);
      } else if (!loading) {
        refresh();
        if (quotasOn) refreshQuotas(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refreshQuotas, refresh, quotasOn, loading]);

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
  const weeklyCard = (id: string) => cards.find((card) => card.harness === id);
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
      <h1 className="page-title">{text.app.settings}</h1>
      <p className="muted page-sub">{text.app.settingsSub}</p>
    </div>
  ) : (
    <div className="page-head">
      <h1 className="page-title">
        {page === OVERVIEW ? (
          <>
            <OverviewIcon size={22} /> {text.app.overview}
          </>
        ) : (
          <>
            <BrandIcon agent={page} size={22} /> {agentLabel(page)}
          </>
        )}
      </h1>
      <p className="muted page-sub">
        {tab === "computer"
          ? text.app.subComputer
          : tab === "wsl"
            ? `WSL · ${activeDistro?.name ?? ""}`
            : text.app.subWindows}{" "}
        · {periodLabel(effectivePeriod)}
        {period === "rtd" && effectivePeriod === "all" && text.app.rtdNote}
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

        <nav className="sidebar-nav">

          {tabs.length > 0 && (
            <>
              <div className="nav-group">{text.app.environment}</div>
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
                  title={text.app.wslDistro}
                >
                  {distros.map((entry) => (
                    <option key={entry.name}>{entry.name}</option>
                  ))}
                </select>
              )}
            </>
          )}

          <div className="nav-group">{text.app.view}</div>
          <button className={`nav${page === OVERVIEW && !showSettings ? " on" : ""}`} onClick={() => openPage(OVERVIEW)}>
            <OverviewIcon />
            <span className="nav-label">{text.app.overview}</span>
            <span className="nav-value">{localReport ? formatUsd(localReport.totals.totalCost) : ""}</span>
          </button>

          {subscriptionIds.length > 0 && <div className="nav-group">{text.app.subscriptions}</div>}
          {subscriptionIds.map((id) => {
            const quota = weeklyCard(id);
            const stale = quota !== undefined && !freshness(quota.observedAt, nowMs).fresh;
            const agent = localReport?.agents.find((entry) => entry.agent === id);
            // The spend line matches every harness; the weekly quota goes below it, only while read.
            return (
              <button
                key={id}
                className={`nav sub${page === id && !showSettings ? " on" : ""}`}
                onClick={() => openPage(id)}
              >
                <span className="nav-line">
                  <BrandIcon agent={id} />
                  <span className="nav-label">{agentLabel(id)}</span>
                  <span className="nav-value">{agent ? formatUsd(agent.totalCost) : ""}</span>
                </span>
                {quota && (
                  <span className="nav-line nav-quota">
                    <span className="nav-label">{text.app.weeklyQuota}</span>
                    {/* Faded when the reading is not live. */}
                    <span className={`${pillClass(quota.weekly.remaining)}${stale ? " stale" : ""}`}>
                      {quota.weekly.remaining.toFixed(0)}%
                    </span>
                  </span>
                )}
              </button>
            );
          })}

          {otherAgents.length > 0 && <div className="nav-group">{text.app.harness}</div>}
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
        </nav>
      </aside>

      <div className="content">
        <header className="topbar">
          {header}
          <div className="spacer" />
          {!showSettings && (
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value as Period)}
              title={text.app.periodShown}
            >
              {PERIODS.map((value) => (
                <option key={value} value={value}>
                  {periodLabel(value)}
                </option>
              ))}
            </select>
          )}
          <button
            className="icon"
            onClick={() => {
              refresh();
              if (quotasOn) refreshQuotas(true);
            }}
            disabled={loading}
            title={text.app.refresh}
          >
            {loading ? "…" : "⟳"}
          </button>
          <button
            className={`icon${showSettings ? " on" : ""}`}
            onClick={() => setShowSettings((value) => !value)}
            title={showSettings ? text.app.closeSettings : text.app.settings}
          >
            ⚙
          </button>
        </header>

        <main>
          {showSettings ? (
            <div className="settings">
              <SettingsCard title={text.settings.general} icon={<Glyph kind="general" size={16} />}>
                <SettingRow title={text.settings.language} description={text.settings.languageHint}>
                  <select
                    value={lang}
                    onChange={(event) => updateSettings({ ...settings, language: event.target.value as Lang })}
                  >
                    {(Object.keys(LANG_NAMES) as Lang[]).map((value) => (
                      <option key={value} value={value}>
                        {LANG_NAMES[value]}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow title={text.settings.autostart} description={text.settings.autostartHint}>
                  <Switch
                    checked={autostart ?? false}
                    disabled={autostart === null || autostartBusy}
                    title={autostartBusy ? text.settings.autostartBusy : undefined}
                    label={text.settings.autostart}
                    onChange={toggleAutostart}
                  />
                </SettingRow>
                <SettingRow title={text.settings.tray} description={text.settings.trayHint}>
                  <Switch
                    checked={settings.closeToTray}
                    label={text.settings.tray}
                    onChange={(next) => updateSettings({ ...settings, closeToTray: next })}
                  />
                </SettingRow>
                <SettingRow title={text.settings.restartOnCrash} description={text.settings.restartOnCrashHint}>
                  <Switch
                    checked={settings.restartOnCrash}
                    label={text.settings.restartOnCrash}
                    onChange={(next) => updateSettings({ ...settings, restartOnCrash: next })}
                  />
                </SettingRow>
              </SettingsCard>

              {/* Hidden when there is no WSL to turn off; kept while off so it can be turned back on. */}
              {(settings.wslMode !== "auto" || distros.length > 0) && (
                <SettingsCard title="WSL" icon={<EnvIcon env="wsl" size={16} />}>
                  <SettingRow title={text.settings.wslRead} description={text.settings.wslModeHints[settings.wslMode]}>
                    <select
                      value={settings.wslMode}
                      onChange={(event) => updateSettings({ ...settings, wslMode: event.target.value as WslMode })}
                    >
                      {(["off", "auto", "keep"] as WslMode[]).map((mode) => (
                        <option key={mode} value={mode}>
                          {text.settings.wslModes[mode]}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                </SettingsCard>
              )}

              <SettingsCard title={text.settings.data} icon={<Glyph kind="data" size={16} />}>
                <SettingRow title={text.settings.offline} description={offlineHint(settings.offline)}>
                  <Switch
                    checked={settings.offline}
                    label={text.settings.offline}
                    onChange={(next) => updateSettings({ ...settings, offline: next })}
                  />
                </SettingRow>
                <SettingRow title={text.settings.quotas} description={quotaHint(settings)}>
                  <Switch
                    checked={quotasOn}
                    disabled={settings.offline}
                    label={text.settings.quotas}
                    onChange={(next) => updateSettings({ ...settings, quotas: next })}
                  />
                </SettingRow>
                <SettingRow title={text.settings.refresh} description={refreshHint(settings.refreshMinutes)}>
                  <select
                    value={settings.refreshMinutes}
                    onChange={(event) => updateSettings({ ...settings, refreshMinutes: Number(event.target.value) })}
                  >
                    <option value={0}>{text.settings.never}</option>
                    {/* A WSL scan with OpenCode takes about 30 s: every minute would read almost
                        nonstop. 1 can come back here if scans get faster. */}
                    {[5, 10, 30].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {text.settings.everyMinutes(minutes)}
                      </option>
                    ))}
                  </select>
                </SettingRow>
              </SettingsCard>

              <SettingsCard title={text.settings.updates} icon={<Glyph kind="updates" size={16} />}>
                <SettingRow title={text.settings.autoUpdate} description={autoUpdateHint(settings.offline)}>
                  <Switch
                    checked={autoUpdateActive(settings)}
                    disabled={settings.offline}
                    label={text.settings.autoUpdate}
                    onChange={(next) => updateSettings({ ...settings, autoUpdate: next })}
                  />
                </SettingRow>
                <SettingRow
                  title={text.settings.installedVersion(appVersion)}
                  description={updateHint(updater.state, settings.offline)}
                >
                  {updater.state.status === "available" ? (
                    <button className="btn primary" onClick={() => setShowUpdate(true)}>
                      {text.settings.seeVersion(updater.state.version)}
                    </button>
                  ) : (
                    <button
                      className="btn"
                      disabled={settings.offline || updater.state.status === "checking" || updater.state.status === "installing"}
                      onClick={() => void updater.checkNow()}
                    >
                      {text.settings.checkNow}
                    </button>
                  )}
                </SettingRow>
              </SettingsCard>

              <SettingsCard title={text.app.harness} icon={<Glyph kind="flame" size={16} />}>
                <HarnessSettings groups={harnessGroups} onToggle={toggleHarness} />
                <p className="muted small set-note">{text.settings.harnessNote}</p>
              </SettingsCard>

              <SettingsCard title={text.settings.about} icon={<Glyph kind="about" size={16} />}>
                <SettingRow
                  title={`Agent Burn Windows${appVersion ? ` ${appVersion}` : ""}`}
                  description={text.settings.aboutHint}
                >
                  <button className="btn" onClick={() => void openUrl(REPO_URL)}>
                    {text.settings.repo}
                  </button>
                </SettingRow>
                <SettingRow title={text.settings.origin} description={text.settings.originHint}>
                  <button className="btn" onClick={() => void openUrl(MELVYNX_URL)}>
                    Agent Burn ↗
                  </button>
                </SettingRow>
              </SettingsCard>
            </div>
          ) : !report ? (
            stoppedNames.length > 0 && !pendingState ? (
              <div className="notice">{text.app.wslOffNoData(stoppedNames.join(", "))}</div>
            ) : (
              <Pending
                state={pendingState}
                label={tab === "computer" ? text.app.theComputer : label(activeIds[0] ?? "windows")}
              />
            )
          ) : (
            <Page>
              {stoppedNames.length > 0 && <div className="notice">{text.app.wslOffStale(stoppedNames.join(", "))}</div>}
              {tab === "computer" && localParts.length < sourceIds.length - stoppedNames.length && (
                <div className="notice error">{text.app.partial}</div>
              )}
              {page === OVERVIEW && hasNoData ? (
                <EmptyState
                  where={text.app.emptyWhere[tab]}
                  harnesses={SUPPORTED_HARNESSES.map(agentLabel)}
                  disabledCount={disabled.length}
                />
              ) : page === OVERVIEW && range && noUsage(report.totals.totalTokens, report.totals.totalCost) ? (
                <EmptyPeriod period={periodLabel(effectivePeriod)} />
              ) : page === OVERVIEW ? (
                <>
                  <Stats report={report} label={text.app.allHarnesses} period={periodLabel(effectivePeriod)} />
                  {tab === "computer" && <EnvironmentSplit parts={localParts} />}
                  <div className="grid">
                    <SpendChart
                      key={effectivePeriod}
                      report={report}
                      defaultGranularity={defaultGranularity(effectivePeriod)}
                    />
                    <HarnessList report={report} onSelect={setPage} />
                  </div>
                  <TokenBreakdownCard breakdown={totalBreakdown(report)} pending={approx} detailError={detailError} />
                  <Models report={report} detailError={detailError} />
                </>
              ) : (
                <>
                  {(page === "claude" || page === "codex") &&
                    pageCards.length === 0 &&
                    (quotaOffReason(settings) ? (
                      <section className="card">
                        <header className="card-head">
                          <h2>
                            <QuotaIcon harness={page} />
                            {text.app.quotaTitle(agentLabel(page))}
                          </h2>
                        </header>
                        <p className="muted small">{quotaOffReason(settings)}</p>
                      </section>
                    ) : (
                      <div className="notice">
                        {quotaMissing(
                          page,
                          tab,
                          activeDistro?.running ?? false,
                          quotaFailure(
                            activeIds
                              .filter((id) => readableIds.includes(id as SourceId))
                              .map((id) => quotaErrors[`${id}|${page}`]),
                          ),
                        )}
                      </div>
                    ))}
                  {pageCards.map((card) => (
                    <QuotaSection
                      key={`${card.harness}-${card.sources.join()}`}
                      card={card}
                      resetCredits={pickSubscription(sourceReports, card.harness)?.resetCreditsAvailable ?? undefined}
                    />
                  ))}
                  {(page === "claude" || page === "codex") && (
                    <SubscriptionCard
                      harness={page}
                      sub={withAccountSpend(pickSubscription(sourceReports, page), liveReports)}
                      account={pickClaudeAccount(sourceReports)}
                      card={pageCards[0]}
                      offReason={subscriptionOffReason(settings)}
                    />
                  )}
                  {page === "codex" && (
                    <LimitUsageSection
                      offReason={limitUsageOffReason(settings)}
                      best={limitBest}
                      attempted={limitAttempted}
                      label={label}
                    />
                  )}
                  {range && (!selected || noUsage(selected.totalTokens, selected.totalCost)) ? (
                    <EmptyPeriod period={periodLabel(effectivePeriod)} harness={agentLabel(page)} />
                  ) : selected ? (
                    <>
                      <Stats
                        report={asReport(selected, approx)}
                        label={agentLabel(selected.agent)}
                        period={periodLabel(effectivePeriod)}
                      />
                      <SpendChart
                        key={effectivePeriod}
                        report={asReport(selected, approx)}
                        defaultGranularity={defaultGranularity(effectivePeriod)}
                      />
                      <TokenBreakdownCard
                        breakdown={selected.tokenBreakdown}
                        pending={approx}
                        detailError={detailError}
                      />
                      <Models report={asReport(selected, approx)} detailError={detailError} />
                    </>
                  ) : (
                    <div className="notice">{text.app.noUsageData(agentLabel(page))}</div>
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
          error={scanError}
          offline={settings.offline}
          update={updater.state}
          onOpenUpdate={() => setShowUpdate(true)}
        />
      </div>
      {showUpdate && (
        <UpdateDialog
          state={updater.state}
          offline={settings.offline}
          onInstall={() => {
            // Installing downloads the release: never in offline mode.
            if (!settings.offline) void updater.install();
          }}
          onClose={() => setShowUpdate(false)}
        />
      )}
    </div>
  );
}
