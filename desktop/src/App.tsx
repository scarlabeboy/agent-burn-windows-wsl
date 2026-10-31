import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  backfillCodex,
  detectSources,
  getAutostart,
  loadQuota,
  loadUsage,
  readPeriod,
  readSettings,
  readTab,
  setAutostart,
  setCloseToTray,
  setTrayTooltip,
  writePeriod,
  writeSettings,
  writeTab,
} from "./api";
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
  ClaudePlanSetting,
  Detected,
  QuotaReading,
  Settings,
  SourceId,
  SourceState,
  TabId,
  UsageReport,
} from "./types";
import {
  BrandIcon,
  EnvironmentSplit,
  HarnessList,
  Models,
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
/** Period scans are reused for this long before being fetched again. */
const DETAIL_TTL_MS = 10 * 60_000;

function reportOf(state: SourceState | undefined): UsageReport | undefined {
  if (!state) return undefined;
  if (state.status === "ready") return state.report;
  if (state.status === "loading" || state.status === "error") return state.previous;
  return undefined;
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
        <strong>{label} : lecture impossible.</strong> {state.message}
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
    () => (settings.wslEnabled ? (detected?.distros ?? []) : []),
    [settings.wslEnabled, detected],
  );
  const sourceIds = useMemo<SourceId[]>(
    () => ["windows", ...distros.map((entry) => `wsl:${entry.name}` as SourceId)],
    [distros],
  );
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

  useEffect(() => {
    detectSources()
      .then(setDetected)
      .catch(() => setDetected({ distros: [] }));
  }, []);

  const scanning = useRef(false);
  const refresh = useCallback(() => {
    // One scan at a time: a slow WSL read must never overlap the next automatic one.
    if (scanning.current) return;
    scanning.current = true;
    const scans = sourceIds.map((id) => {
      setStates((current) => ({
        ...current,
        [id]: { status: "loading", previous: reportOf(current[id]) },
      }));
      return loadUsage(id === "windows" ? null : id.slice(4), settings.offline, settings.claudePlan)
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
    });
  }, [sourceIds, settings.offline, settings.claudePlan]);

  useEffect(() => {
    if (!detected || !archiveReady) return;
    refresh();
    if (settings.refreshMinutes <= 0) return;
    const timer = setInterval(refresh, settings.refreshMinutes * 60_000);
    return () => clearInterval(timer);
  }, [detected, archiveReady, refresh, settings.refreshMinutes]);

  // Rebuild Codex limit history from each source's logs: 30 days the first time, then only
  // what changed since the last scan. It starts after the first usage scan has had a head start.
  useEffect(() => {
    if (!detected || !archiveReady) return;
    let cancelled = false;
    void (async () => {
      await new Promise((resolve) => setTimeout(resolve, 8000));
      for (const id of sourceIds) {
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
  }, [detected, archiveReady, sourceIds]);

  const refreshQuotas = useCallback(
    (force: boolean) => {
      for (const id of sourceIds) {
        const name = id === "windows" ? null : id.slice(4);
        for (const harness of ["claude", "codex"]) {
          loadQuota(harness, name, force)
            .then((reading) => {
              recordReading(reading);
              setQuotas((current) => ({ ...current, [id]: { ...current[id], [harness]: reading } }));
            })
            // A source without a sign-in for this harness simply has no quota to show.
            .catch(() =>
              setQuotas((current) => {
                const { [harness]: _removed, ...rest } = current[id] ?? {};
                return { ...current, [id]: rest };
              }),
            );
        }
      }
    },
    [sourceIds],
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
  const toggleAutostart = (enabled: boolean) => {
    setAutostart(enabled)
      .then(() => getAutostart())
      .then(setAutostartState)
      .catch(() => getAutostart().then(setAutostartState).catch(() => undefined));
  };

  useEffect(() => {
    if (!detected) return;
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

  const updateSettings = (next: Settings) => {
    setSettings(next);
    writeSettings(next);
  };

  const label = (id: string) => (id === "windows" ? "Windows" : `WSL · ${id.slice(4)}`);
  const activeIds: string[] =
    tab === "windows" ? ["windows"] : tab === "wsl" ? (activeDistro ? [`wsl:${activeDistro.name}`] : []) : sourceIds;
  const activeKey = activeIds.join(",");
  const pendingState = states[activeIds[0] ?? "windows"];
  const lastScan = Math.max(
    0,
    ...sourceIds.map((id) => {
      const state = states[id];
      return state?.status === "ready" ? state.loadedAt : 0;
    }),
  );

  // Quotas belong to the account, not to an environment: read every source in every tab.
  const cards: QuotaCard[] = useMemo(
    () =>
      quotaCards(
        sourceIds.flatMap((id) =>
          Object.values(quotas[id] ?? {}).map((reading) => ({ source: label(id), reading })),
        ),
      ),
    [quotas, sourceIds],
  );
  const pageCards = cards.filter((card) => card.harness === page);

  // Quota summary on the notification-area icon.
  const tooltip = cards
    .map((card) => {
      const session = card.session ? `5 h ${card.session.remaining.toFixed(0)}% · ` : "";
      return `${agentLabel(card.harness)} : ${session}sem. ${card.weekly.remaining.toFixed(0)}%`;
    })
    .join("\n");
  useEffect(() => {
    if (tooltip) void setTrayTooltip(`Agent Burn Windows\n${tooltip}`).catch(() => undefined);
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
    if (!rangeSince || !detected || !archiveReady) return;
    let cancelled = false;
    void (async () => {
      for (const id of activeKey.split(",").filter(Boolean)) {
        if (cancelled) return;
        const key = `${id}|${rangeSince}|${rangeUntil ?? ""}|${detailScope}`;
        const cached = detailsRef.current[key];
        if (cached && Date.now() - cached.loadedAt < DETAIL_TTL_MS) continue;
        try {
          const detail = await loadUsage(
            id === "windows" ? null : id.slice(4),
            settings.offline,
            settings.claudePlan,
            { since: compactDate(rangeSince), until: rangeUntil ? compactDate(rangeUntil) : undefined },
            detailScope === "*" ? undefined : [detailScope],
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
  }, [rangeSince, rangeUntil, detailScope, activeKey, detected, archiveReady, lastScan, settings.offline, settings.claudePlan]);

  // Plan, price and account meters belong to the account: read them from every source.
  const sourceReports = useMemo(
    () =>
      sourceIds
        .map((id) => reportOf(states[id]))
        .filter((entry): entry is UsageReport => entry !== undefined),
    [sourceIds, states],
  );

  const tabs: { id: TabId; label: string }[] = [
    { id: "windows", label: "Windows" },
    ...(hasWsl
      ? [
          { id: "wsl" as TabId, label: "WSL" },
          { id: "computer" as TabId, label: "Computer" },
        ]
      : []),
  ];

  const loading = sourceIds.some((id) => states[id]?.status === "loading");
  // The sidebar always uses the locally filtered report, which lists every harness.
  const agentIds = localReport?.agents.map((agent) => agent.agent) ?? [];
  const subscriptionIds = SUBSCRIPTIONS.filter(
    (id) => agentIds.includes(id) || cards.some((card) => card.harness === id),
  );
  const otherAgents = localReport?.agents.filter((agent) => !SUBSCRIPTIONS.includes(agent.agent)) ?? [];
  const weeklyLeft = (id: string) => cards.find((card) => card.harness === id)?.weekly.remaining;
  const selected =
    page === OVERVIEW
      ? null
      : (report?.agents.find((agent) => agent.agent === page) ??
        // A period without usage for this harness: show its exact zero totals.
        (range ? localReport?.agents.find((agent) => agent.agent === page) : undefined));
  const approx = report?.approxDetail ?? false;

  const header = (
    <>
      <h1 className="page-title">
        {page === OVERVIEW ? (
          "Vue d'ensemble"
        ) : (
          <>
            <BrandIcon agent={page} size={26} /> {agentLabel(page)}
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
    </>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand-row">
          <span className="flame">🔥</span>
          <strong>Agent Burn Windows</strong>
        </div>
        <button className={`nav${page === OVERVIEW ? " on" : ""}`} onClick={() => setPage(OVERVIEW)}>
          <span className="nav-icon">🔥</span>
          <span className="nav-label">Vue d'ensemble</span>
          <span className="nav-value">{localReport ? formatUsd(localReport.totals.totalCost) : ""}</span>
        </button>

        {subscriptionIds.length > 0 && <div className="nav-group">Abonnements</div>}
        {subscriptionIds.map((id) => {
          const left = weeklyLeft(id);
          const agent = localReport?.agents.find((entry) => entry.agent === id);
          return (
            <button key={id} className={`nav${page === id ? " on" : ""}`} onClick={() => setPage(id)}>
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

        {otherAgents.length > 0 && <div className="nav-group">Agents</div>}
        {otherAgents.map((agent) => (
          <button
            key={agent.agent}
            className={`nav${page === agent.agent ? " on" : ""}`}
            onClick={() => setPage(agent.agent)}
          >
            <BrandIcon agent={agent.agent} />
            <span className="nav-label">{agentLabel(agent.agent)}</span>
            <span className="nav-value">{formatUsd(agent.totalCost)}</span>
          </button>
        ))}
      </aside>

      <div className="content">
        <header className="topbar">
          <nav className="tabs">
            {tabs.map((entry) => (
              <button key={entry.id} className={tab === entry.id ? "on" : ""} onClick={() => setTab(entry.id)}>
                {entry.label}
              </button>
            ))}
          </nav>
          {tab === "wsl" && distros.length > 1 && (
            <select value={activeDistro?.name} onChange={(event) => setDistro(event.target.value)}>
              {distros.map((entry) => (
                <option key={entry.name}>{entry.name}</option>
              ))}
            </select>
          )}
          <div className="spacer" />
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
          {lastScan > 0 && (
            <span className="muted small" title="Dernier scan des données d'usage">
              {loading ? "Mise à jour…" : `Mis à jour à ${new Date(lastScan).toLocaleTimeString("fr-FR")}`}
            </span>
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
          <button className="icon" onClick={() => setShowSettings((value) => !value)} title="Réglages">
            ⚙
          </button>
        </header>

        {showSettings && (
          <div className="settings card">
            <label>
              <input
                type="checkbox"
                checked={settings.wslEnabled}
                onChange={(event) => updateSettings({ ...settings, wslEnabled: event.target.checked })}
              />
              Lire aussi WSL (désactivé = Windows uniquement)
            </label>
            <label>
              <input
                type="checkbox"
                checked={autostart ?? false}
                disabled={autostart === null}
                onChange={(event) => toggleAutostart(event.target.checked)}
              />
              Lancer au démarrage de Windows (réduit dans la zone de notification)
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.closeToTray}
                onChange={(event) => updateSettings({ ...settings, closeToTray: event.target.checked })}
              />
              Rester actif dans la zone de notification quand je ferme la fenêtre
            </label>
            <label>
              Plan Claude
              <select
                value={settings.claudePlan}
                onChange={(event) =>
                  updateSettings({ ...settings, claudePlan: event.target.value as ClaudePlanSetting })
                }
              >
                <option value="auto">Détecté automatiquement</option>
                <option value="pro">Pro</option>
                <option value="max-5x">Max 5×</option>
                <option value="max-20x">Max 20×</option>
                <option value="none">Ne pas préciser</option>
              </select>
            </label>
            <label>
              Rafraîchir l'usage automatiquement
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
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.offline}
                onChange={(event) => updateSettings({ ...settings, offline: event.target.checked })}
              />
              Mode hors ligne (aucun appel réseau, mais les modèles récents peuvent afficher 0 $)
            </label>
          </div>
        )}

        <main>
          {!report ? (
            <Pending state={pendingState} label={tab === "computer" ? "Computer" : label(activeIds[0] ?? "windows")} />
          ) : (
            <Page>
              <div>{header}</div>
              {tab === "computer" && localParts.length < sourceIds.length && (
                <div className="notice error">Une source n'a pas pu être lue : le total Computer est partiel.</div>
              )}
              {page === OVERVIEW ? (
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
      </div>
    </div>
  );
}
