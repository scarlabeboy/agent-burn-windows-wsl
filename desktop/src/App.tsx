import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  detectSources,
  loadQuota,
  loadUsage,
  readSettings,
  readTab,
  writeSettings,
  writeTab,
} from "./api";
import { formatUsd, mergeReports } from "./aggregate";
import { recordReading } from "./history";
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
        .then((report) =>
          setStates((current) => ({
            ...current,
            [id]: { status: "ready", report, loadedAt: Date.now() },
          })),
        )
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
    if (!detected) return;
    refresh();
    if (settings.refreshMinutes <= 0) return;
    const timer = setInterval(refresh, settings.refreshMinutes * 60_000);
    return () => clearInterval(timer);
  }, [detected, refresh, settings.refreshMinutes]);

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

  useEffect(() => {
    if (!detected) return;
    refreshQuotas(false);
    const timer = setInterval(() => refreshQuotas(false), 60_000);
    return () => clearInterval(timer);
  }, [detected, refreshQuotas]);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    writeSettings(next);
  };

  const label = (id: string) => (id === "windows" ? "Windows" : `WSL · ${id.slice(4)}`);
  const activeIds: string[] =
    tab === "windows" ? ["windows"] : tab === "wsl" ? (activeDistro ? [`wsl:${activeDistro.name}`] : []) : sourceIds;

  const computer = useMemo(() => {
    const parts = sourceIds
      .map((id) => ({ label: label(id), report: reportOf(states[id]) }))
      .filter((part): part is { label: string; report: UsageReport } => part.report !== undefined);
    return parts.length ? { parts, report: mergeReports(parts.map((part) => part.report)) } : null;
  }, [sourceIds, states]);

  const report =
    tab === "computer" ? computer?.report : reportOf(states[activeIds[0] ?? "windows"]);
  const pendingState = states[activeIds[0] ?? "windows"];

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
  const lastScan = Math.max(
    0,
    ...sourceIds.map((id) => {
      const state = states[id];
      return state?.status === "ready" ? state.loadedAt : 0;
    }),
  );
  const agentIds = report?.agents.map((agent) => agent.agent) ?? [];
  const subscriptionIds = SUBSCRIPTIONS.filter(
    (id) => agentIds.includes(id) || cards.some((card) => card.harness === id),
  );
  const otherAgents = report?.agents.filter((agent) => !SUBSCRIPTIONS.includes(agent.agent)) ?? [];
  const weeklyLeft = (id: string) => cards.find((card) => card.harness === id)?.weekly.remaining;
  const selected = page === OVERVIEW ? null : report?.agents.find((agent) => agent.agent === page);
  const pageCards = cards.filter((card) => card.harness === page);

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
        · toute la période
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
          <span className="nav-value">{report ? formatUsd(report.totals.totalCost) : ""}</span>
        </button>

        {subscriptionIds.length > 0 && <div className="nav-group">Abonnements</div>}
        {subscriptionIds.map((id) => {
          const left = weeklyLeft(id);
          const agent = report?.agents.find((entry) => entry.agent === id);
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
              {tab === "computer" && computer && computer.parts.length < sourceIds.length && (
                <div className="notice error">Une source n'a pas pu être lue : le total Computer est partiel.</div>
              )}
              {page === OVERVIEW ? (
                <>
                  <Stats report={report} label="Tous harness confondus" />
                  {tab === "computer" && computer && <EnvironmentSplit parts={computer.parts} />}
                  <div className="grid">
                    <SpendChart report={report} />
                    <HarnessList report={report} onSelect={setPage} />
                  </div>
                  <Models report={report} />
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
                      <Stats report={asReport(selected)} label={agentLabel(selected.agent)} />
                      <SpendChart report={asReport(selected)} />
                      <Models report={asReport(selected)} />
                      <TokenBreakdownCard breakdown={selected.tokenBreakdown} />
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
