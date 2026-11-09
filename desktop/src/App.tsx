import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  backfillCodex,
  loadLimitUsage,
  loadQuota,
  loadUsage,
  readPeriod,
  readSeen,
  readTab,
  setTrayIcon,
  setTrayLabels,
  quitApp,
  setTrayTooltip,
  writePeriod,
  writeSeen,
  writeSettings,
  writeTab,
} from "./api";
import { EmptyPeriod, LimitUsageSection, Pending, QuotaMissing, ReadingLimitSection, noUsage } from "./AppNotices";
import { SettingsPage } from "./SettingsPage";
import { OVERVIEW, Sidebar } from "./Sidebar";
import { EmptyState } from "./EmptyState";
import { StatusBar, useAppVersion } from "./StatusBar";
import { Tooltip } from "./Tooltip";
import { UpdateDialog } from "./UpdateDialog";
import { useUpdater } from "./updater";
import type { LimitUsageDay } from "./limitUsage";
import { SUPPORTED_HARNESSES, disabledHarnesses, groupHarnesses, scanAgents } from "./harnesses";
import { mergeReports, totalBreakdown, withoutHarnesses } from "./aggregate";
import { hasUsage, withArchive } from "./dailyArchive";
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
import { setLang, systemLang, t } from "./i18n";
import {
  PERIODS,
  compactDate,
  defaultGranularity,
  filterReport,
  isoDate,
  periodLabel,
  rangeFor,
  type DateRange,
  type Period,
} from "./periods";
import { errorText } from "./errors";
import { formatAge, freshness, isMonthly, quotaCards, quotaFailure, trayPercent, trayTone, type QuotaCard } from "./quota";
import { TRAY_ICON_SIZE, drawTrayIcon, type TrayIconTone } from "./trayIcon";
import { loadedAtOf, reportOf } from "./sourceState";
import { useDesktopPreferences } from "./useDesktopPreferences";
import { useNow } from "./useNow";
import { useSourceDiscovery } from "./useSourceDiscovery";
import {
  limitUsageOffReason,
  readingLimitOffReason,
  quotaOffReason,
  quotasActive,
  subscriptionOffReason,
} from "./settingsHints";
import { pickClaudeAccount, pickSubscription, withAccountSpend } from "./subscription";
import {
  QUOTA_HARNESSES,
  type ModelPricing,
  type QuotaReading,
  type Settings,
  type SourceId,
  type SourceState,
  type TabId,
  type UsageReport,
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
/** The weekly Codex limit per day changes slowly: read again after this long. */
const LIMIT_USAGE_TTL_MS = 5 * 60_000;
/** How long a quota stays on screen after a failed read, so missed reads do not blank it. */
const QUOTA_GRACE_MS = 5 * 60_000;
/** Each source's Claude plan is read from its own sign-in file; there is no manual choice. */
const CLAUDE_PLAN = "auto";

export default function App({ initialSettings, onThemeChange }: {
  initialSettings: Settings;
  onThemeChange: (theme: Settings["theme"]) => void;
}) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  // Set before anything renders: every text and format below reads it.
  const lang = settings.language ?? systemLang();
  setLang(lang);
  const text = t();
  // WSL distributions, detected (and kept running) as the settings ask.
  const detected = useSourceDiscovery(settings.wslRead, settings.wslMode);
  const [states, setStates] = useState<Record<string, SourceState>>({});
  const [pricing, setPricing] = useState<Record<string, ModelPricing>>({});
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
  const detailsRef = useRef(details);
  detailsRef.current = details;
  const statesRef = useRef(states);
  statesRef.current = states;
  const setPeriod = (next: Period) => {
    setPeriodState(next);
    writePeriod(next);
  };

  const distros = useMemo(
    () => (settings.wslRead ? (detected?.distros ?? []) : []),
    [settings.wslRead, detected],
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

  const scanning = useRef(false);
  const rescan = useRef(false);
  const refreshRef = useRef<(queue?: boolean) => void>(() => undefined);
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
      return loadUsage(id === "windows" ? null : id.slice(4), settings.offline, quotasActive(settings), CLAUDE_PLAN, {}, agentsToScan)
        .then(({ pricing: nextPricing, ...report }) => {
          // Keep reference rates only in memory; the last Windows or WSL read wins.
          if (nextPricing) setPricing((current) => ({ ...current, ...nextPricing }));
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
  }, [readableIds, settings.offline, settings.quotas, agentsToScan]);
  refreshRef.current = refresh;

  // Windows is scanned as soon as the archive is loaded. A WSL distribution joins the scan
  // once its detection answers: the sources change, which scans again (queued if one runs).
  useEffect(() => {
    if (archiveReady) refresh(true);
  }, [detected, archiveReady, refresh]);

  // Automatic scans. Changing their interval only resets the timer: it does not scan.
  // The time of the next one is kept for the status bar (0: none planned).
  const [nextScan, setNextScan] = useState(0);
  useEffect(() => {
    if (!archiveReady) return;
    if (settings.refreshMinutes <= 0) {
      setNextScan(0);
      return;
    }
    const every = settings.refreshMinutes * 60_000;
    setNextScan(Date.now() + every);
    const timer = setInterval(() => {
      refreshRef.current();
      setNextScan(Date.now() + every);
    }, every);
    return () => clearInterval(timer);
  }, [archiveReady, settings.refreshMinutes]);

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
  // The shape of each source and harness's windows (lengths, session or not). A change means the
  // plan changed (Codex Free taken back to Plus): the plan and price come from the next usage scan.
  const quotaShapes = useRef(new Map<string, string>());
  const refreshQuotas = useCallback(
    (force: boolean) => {
      for (const id of readableIds) {
        const name = id === "windows" ? null : id.slice(4);
        for (const harness of QUOTA_HARNESSES.filter((entry) => !disabled.includes(entry))) {
          const key = `${id}|${harness}`;
          if (quotaReads.current.has(key)) continue;
          quotaReads.current.add(key);
          loadQuota(harness, name, force)
            .then((reading) => {
              // Stored as measured; what is shown has an unconfirmed over-count held back.
              const shown = recordReading(reading);
              const shape = `${reading.window.windowMinutes}|${reading.sessionWindow?.windowMinutes ?? "-"}`;
              const known = quotaShapes.current.get(key);
              quotaShapes.current.set(key, shape);
              if (known !== undefined && known !== shape) refreshRef.current(true);
              setQuotaErrors(({ [key]: _cleared, ...rest }) => rest);
              setQuotas((current) => {
                // A reading older than the one shown arrived late: it is not the latest state.
                const previous = current[id]?.[harness];
                if (previous && previous.observedAt > reading.observedAt) return current;
                return { ...current, [id]: { ...current[id], [harness]: shown } };
              });
            })
            // A source without a sign-in for this harness simply has no quota to show. A reading
            // from the last five minutes stays through missed reads: in WSL without a sign-in,
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
  const { autostart, autostartBusy, toggleAutostart } = useDesktopPreferences(settings);

  // Quotas off, or offline: no read at all; the readings already shown stay with their time.
  const quotasOn = quotasActive(settings);
  // Readings wait for the archive: one recorded before it loads would be replaced by it.
  useEffect(() => {
    if (!quotasOn || !archiveReady) return;
    refreshQuotas(false);
    const timer = setInterval(() => refreshQuotas(false), 60_000);
    return () => clearInterval(timer);
  }, [detected, refreshQuotas, quotasOn, archiveReady]);

  // Tray menu actions, and a last save of the archive before the app quits (tray "Quit", or
  // closing the window when it does not stay in the notification area): the process ends once
  // saved. "Refresh quotas" reads the quotas; with quotas off it reads the usage instead.
  useEffect(() => {
    const unlisten = [
      listen("tray-refresh", () => (quotasOn ? refreshQuotas(true) : refresh())),
      listen("quit-requested", () => void flush().finally(() => void quitApp())),
    ];
    return () => {
      unlisten.forEach((pending) => void pending.then((stop) => stop()));
    };
  }, [refreshQuotas, refresh, quotasOn]);

  const updater = useUpdater(settings.autoUpdate, settings.offline);
  const [showUpdate, setShowUpdate] = useState(false);
  // The dialog closes for good when no version is offered any more: it must not come back by
  // itself with the next one found.
  const offered = updater.state.status === "available" || updater.state.status === "installing";
  useEffect(() => {
    if (!offered) setShowUpdate(false);
  }, [offered]);
  const appVersion = useAppVersion();
  const updateSettings = (next: Settings) => {
    if (next.theme !== settings.theme) onThemeChange(next.theme);
    setSettings(next);
    writeSettings(next);
  };

  const label = (id: string) => (id === "windows" ? "Windows" : `WSL · ${id.slice(4)}`);
  const activeIds: string[] =
    tab === "windows" ? ["windows"] : tab === "wsl" ? (activeDistro ? [`wsl:${activeDistro.name}`] : []) : sourceIds;
  const activeKey = activeIds.join(",");
  // Every source of this tab answered and none has a harness or an archived day: a first launch,
  // or a machine where no supported agent was used yet. A stopped distribution never read yet has
  // nothing to add, so it does not hold the message back (a stopped one with a saved report does).
  const answeringIds = activeIds.filter((id) => readableIds.includes(id as SourceId) || states[id]);
  const hasNoData =
    answeringIds.length > 0 &&
    answeringIds.every((id) => {
      const state = states[id];
      return state?.status === "ready" && !hasUsage(state.report, archivedDays(id), disabled);
    });
  const stoppedNames = distros
    .filter((entry) => !entry.running && activeIds.includes(`wsl:${entry.name}`))
    .map((entry) => entry.name);
  // A stopped distribution with a saved report shows old figures; one never read shows none.
  const staleNames = stoppedNames.filter((name) => reportOf(states[`wsl:${name}`]));
  const unreadNames = stoppedNames.filter((name) => !reportOf(states[`wsl:${name}`]));
  const pendingState = states[activeIds[0] ?? "windows"];
  // A failed read keeps the previous figures on screen; the status bar says it failed.
  const failedId = readableIds.find((id) => states[id]?.status === "error");
  const failedState = failedId ? states[failedId] : undefined;
  const scanError =
    failedId && failedState?.status === "error"
      ? text.app.scanError(label(failedId), errorText(failedState.message))
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
        isMonthly(card.weekly.window.windowMinutes),
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
  // The remaining quota on the notification-area icon, when one is chosen: the logo otherwise,
  // when nothing is read and when all of it is left. An old reading turns the figure grey.
  const trayCards = settings.trayIcon === "logo" ? [] : accountCards.filter((card) => card.harness === settings.trayIcon);
  const trayValue = trayPercent(trayCards, settings.trayWindow, nowMs);
  const trayFresh =
    trayCards.length > 0 && freshness(Math.max(...trayCards.map((card) => card.observedAt)), nowMs).fresh;
  const trayKey = trayValue === null ? "logo" : `${trayValue}|${trayFresh ? trayTone(trayValue) : "stale"}`;
  useEffect(() => {
    const [value, tone] = trayKey.split("|");
    const rgba = trayKey === "logo" ? null : drawTrayIcon(Number(value), tone as TrayIconTone);
    void setTrayIcon(rgba, TRAY_ICON_SIZE).catch(() => undefined);
  }, [trayKey]);
  // The notification-area menu is built by the Rust side: it gets its words from here. Its
  // refresh entry reads the usage instead when quotas are not read, and says so.
  useEffect(() => {
    const { open, refresh, refreshUsage, quit } = t().tray;
    void setTrayLabels({ open, refresh: quotasOn ? refresh : refreshUsage, quit }).catch(() => undefined);
  }, [lang, quotasOn]);
  // Screen readers and the WebView's own texts take the page language from `<html lang>`.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // "Since the reset day" needs a weekly quota cycle, so it only applies on Claude and Codex pages.
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
  const localPartsFor = (range: DateRange | null) =>
    activeKey
      .split(",")
      .filter(Boolean)
      .flatMap((id) => {
        const base = reportOf(states[id]);
        if (!base) return [];
        // Days a harness no longer reports (old logs purged) come back from the daily archive.
        // A harness turned off since this report was read (a stopped WSL keeps it) stays out.
        const current = withoutHarnesses(base, disabled);
        const report = withArchive(range ? filterReport(current, range) : current, archivedDays(id), disabled, range ?? undefined);
        return [{ id, label: label(id), report }];
      });
  const localReportFor = (range: DateRange | null) => {
    const parts = localPartsFor(range);
    return parts.length ? mergeReports(parts.map((part) => part.report)) : undefined;
  };
  const localParts = useMemo(() => localPartsFor(range), [activeKey, states, rangeSince, rangeUntil, disabledKey]);
  const localReport = useMemo(
    () => (localParts.length ? mergeReports(localParts.map((part) => part.report)) : undefined),
    [localParts],
  );

  // Under "Since the reset day" the side bar does not follow the open page: each subscription
  // counts from its own reset day, everything else over the whole period, as on their own pages.
  const resetRtd = period === "rtd";
  const resetStarts = resetRtd
    ? SUBSCRIPTIONS.map((id) => {
        const start = cards.find((card) => card.harness === id)?.weekly.startMs;
        return [id, start] as const;
      })
    : [];
  const resetStartsKey = resetStarts
    .map(([id, start]) => `${id}:${start === undefined ? "" : isoDate(new Date(start))}`)
    .join(",");
  const navReport = useMemo(
    () => (resetRtd ? localReportFor(null) : localReport),
    [resetRtd, localReport, activeKey, states, disabledKey],
  );
  const resetSpend = useMemo(
    () =>
      new Map(
        resetStarts.map(([id, start]) => {
          const since = start === undefined ? navReport : localReportFor(rangeFor("rtd", new Date(), start));
          return [id, since?.agents.find((agent) => agent.agent === id)?.totalCost] as const;
        }),
      ),
    [resetStartsKey, navReport],
  );
  const report = useMemo(() => {
    if (!localReport) return undefined;
    if (!range) return localReport;
    return mergeReports(
      localParts.map((part) => {
        const detail = currentDetail(part.id, detailKey(part.id));
        return detail
          ? withArchive(withoutHarnesses(detail, disabled), archivedDays(part.id), disabled, range)
          : part.report;
      }),
    );
  }, [localReport, localParts, details, states, rangeSince, rangeUntil, detailScope, disabledKey]);
  const detailError = activeKey
    .split(",")
    .map((id) => detailErrors[detailKey(id)])
    .find(Boolean);

  const detailReads = useRef(new Set<string>());
  const [detailRetry, setDetailRetry] = useState(0);
  // The detail waits for a scan to end, failed or not: a failed scan still lets it be asked.
  const scanningKey = activeIds.filter((id) => states[id]?.status === "loading").join(",");
  useEffect(() => {
    if (!rangeSince || !archiveReady) return;
    let cancelled = false;
    void (async () => {
      for (const id of activeKey.split(",").filter((entry) => entry && readableKey.split(",").includes(entry))) {
        if (cancelled) return;
        const key = `${id}|${rangeSince}|${rangeUntil ?? ""}|${detailScope}`;
        // Asked again after each scan of the source, so per-model figures follow the totals.
        if (currentDetail(id, key)) continue;
        // Not while the source is scanned: the end of that scan asks for it again anyway. Nor
        // twice at once: at launch, two scans ending close together used to ask up to four times.
        if (statesRef.current[id]?.status === "loading" || detailReads.current.has(key)) continue;
        detailReads.current.add(key);
        const requestedAt = Date.now();
        try {
          const { pricing: nextPricing, ...detail } = await loadUsage(
            id === "windows" ? null : id.slice(4),
            settings.offline,
            false,
            CLAUDE_PLAN,
            { since: compactDate(rangeSince), until: rangeUntil ? compactDate(rangeUntil) : undefined },
            detailScope === "*" ? agentsToScan : [detailScope],
          );
          if (nextPricing) setPricing((current) => ({ ...current, ...nextPricing }));
          setDetails((current) => ({ ...current, [key]: { report: detail, requestedAt } }));
          setDetailErrors(({ [key]: _cleared, ...rest }) => rest);
        } catch (error) {
          setDetailErrors((current) => ({ ...current, [key]: String(error) }));
        } finally {
          detailReads.current.delete(key);
          // A scan that ended during this read made it stale: ask again now that none is running.
          if (requestedAt < loadedAtOf(statesRef.current[id])) setDetailRetry((count) => count + 1);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeSince, rangeUntil, detailScope, activeKey, readableKey, detected, archiveReady, lastScan, scanningKey, settings.offline, agentsToScan, detailRetry]);

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

  // The quota belongs to the account, so its value counts the spend of every source, whichever
  // tab is open: a stopped WSL distribution counts through its last report.
  const accountReadings = useMemo(
    () =>
      sourceIds.flatMap((id) => {
        const report = reportOf(states[id]);
        return report ? [{ report, at: loadedAtOf(states[id]) }] : [];
      }),
    [sourceIds, states],
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
  const visibleAgents = navReport?.agents.filter((agent) => !disabled.includes(agent.agent)) ?? [];
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
      <Sidebar
        tabs={tabs}
        tab={tab}
        openTab={openTab}
        distros={distros}
        activeDistro={activeDistro}
        onDistro={setDistro}
        page={page}
        showSettings={showSettings}
        openPage={openPage}
        overviewCost={navReport?.totals.totalCost}
        subscriptionIds={subscriptionIds}
        weeklyCard={weeklyCard}
        costOf={(id) =>
          resetRtd ? resetSpend.get(id) : localReport?.agents.find((entry) => entry.agent === id)?.totalCost
        }
        nowMs={nowMs}
        otherAgents={otherAgents}
      />

      <div className="content">
        <header className="topbar">
          {header}
          <div className="spacer" />
          {!showSettings && (
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value as Period)}
              aria-label={text.app.periodShown}
            >
              {PERIODS.map((value) => (
                <option key={value} value={value}>
                  {periodLabel(value)}
                </option>
              ))}
            </select>
          )}
          <Tooltip text={text.app.refresh}>
            <button
              className="icon"
              onClick={() => {
                refresh();
                if (quotasOn) refreshQuotas(true);
              }}
              disabled={loading}
              aria-label={text.app.refresh}
            >
              {loading ? "…" : "⟳"}
            </button>
          </Tooltip>
          <Tooltip text={showSettings ? text.app.closeSettings : text.app.settings}>
            <button
              className={`icon${showSettings ? " on" : ""}`}
              onClick={() => setShowSettings((value) => !value)}
              aria-label={showSettings ? text.app.closeSettings : text.app.settings}
            >
              ⚙
            </button>
          </Tooltip>
        </header>

        <main>
          {showSettings ? (
            <SettingsPage
              settings={settings}
              lang={lang}
              updateSettings={updateSettings}
              quotasOn={quotasOn}
              autostart={autostart}
              autostartBusy={autostartBusy}
              toggleAutostart={toggleAutostart}
              hasDistros={distros.length > 0}
              harnessGroups={harnessGroups}
              toggleHarness={toggleHarness}
              updater={updater}
              appVersion={appVersion}
              openUpdate={() => setShowUpdate(true)}
            />
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
              {staleNames.length > 0 && <div className="notice">{text.app.wslOffStale(staleNames.join(", "))}</div>}
              {unreadNames.length > 0 && <div className="notice">{text.app.wslOffNoData(unreadNames.join(", "))}</div>}
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
                  <Models report={report} pricing={pricing} detailError={detailError} />
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
                      <QuotaMissing
                        harness={page}
                        tab={tab}
                        wslRunning={activeDistro?.running ?? false}
                        cause={quotaFailure(
                          activeIds
                            .filter((id) => readableIds.includes(id as SourceId))
                            .map((id) => quotaErrors[`${id}|${page}`]),
                        )}
                      />
                    ))}
                  {pageCards.map((card) => (
                    <QuotaSection
                      key={card.harness}
                      card={card}
                      resetCredits={pickSubscription(sourceReports, card.harness)?.resetCreditsAvailable ?? undefined}
                    />
                  ))}
                  {(page === "claude" || page === "codex") && (
                    <SubscriptionCard
                      harness={page}
                      sub={withAccountSpend(pickSubscription(sourceReports, page), accountReadings)}
                      account={pickClaudeAccount(sourceReports)}
                      card={pageCards[0]}
                      offReason={subscriptionOffReason(settings)}
                    />
                  )}
                  {/* On Codex Free the dashboard's daily figures are not shares of the monthly quota
                      (0.16 % for a day that used 7 % of it): the chart would mislead, so it goes.
                      With no readable source in the tab (WSL off), nothing would ever be read. */}
                  {page === "codex" &&
                    !pageCards.some((card) => isMonthly(card.weekly.window.windowMinutes)) &&
                    (limitUsageOffReason(settings) || activeIds.some((id) => readableIds.includes(id as SourceId))) && (
                    <LimitUsageSection
                      offReason={limitUsageOffReason(settings)}
                      best={limitBest}
                      attempted={limitAttempted}
                      label={label}
                    />
                  )}
                  {page === "claude" && <ReadingLimitSection offReason={readingLimitOffReason(settings)} />}
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
                      <Models report={asReport(selected, approx)} pricing={pricing} detailError={detailError} />
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
          autoRefresh={settings.refreshMinutes > 0}
          error={scanError}
          errorDetail={failedState?.status === "error" ? failedState.message : undefined}
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
