import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { detectSources, loadQuota, loadUsage, readSettings, writeSettings } from "./api";
import { formatDuration, quotaCards, type QuotaCard } from "./quota";
import { formatTokens, formatUsd, mergeReports, tokensPerDollar } from "./aggregate";
import type {
  AgentReport,
  Detected,
  QuotaReading,
  Settings,
  SourceId,
  SourceState,
  TabId,
  UsageReport,
} from "./types";

const AGENT_COLORS: Record<string, string> = {
  codex: "#2ed573",
  claude: "#ff8a3d",
  cursor: "#c44dff",
  opencode: "#4f7cff",
  openclaw: "#ff4d5e",
};
const FALLBACK_COLORS = ["#2ec4b6", "#f4d35e", "#ee6c9a", "#8d99ae", "#7bdff2"];

function agentColor(agent: string): string {
  if (AGENT_COLORS[agent]) return AGENT_COLORS[agent];
  let hash = 0;
  for (const char of agent) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

const AGENT_LABELS: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "OpenCode",
  openclaw: "Openclaw",
};
const agentLabel = (agent: string) => AGENT_LABELS[agent] ?? agent;

type Granularity = "daily" | "weekly" | "monthly";
type Metric = "tokens" | "cost";

function bucketKey(date: string, granularity: Granularity): string {
  if (granularity === "monthly") return date.slice(0, 7);
  if (granularity === "weekly") {
    const day = new Date(`${date}T00:00:00Z`);
    const offset = (day.getUTCDay() + 6) % 7; // Monday start
    day.setUTCDate(day.getUTCDate() - offset);
    return day.toISOString().slice(0, 10);
  }
  return date;
}

function chartRows(agents: AgentReport[], granularity: Granularity, metric: Metric) {
  const rows = new Map<string, Record<string, number | string>>();
  for (const agent of agents) {
    for (const point of agent.daily) {
      const key = bucketKey(point.date, granularity);
      const row = rows.get(key) ?? { bucket: key };
      row[agent.agent] = ((row[agent.agent] as number) ?? 0) + point[metric];
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)));
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-hint">{hint}</div>
    </div>
  );
}

function UsageChart({ report }: { report: UsageReport }) {
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [metric, setMetric] = useState<Metric>("tokens");
  const rows = useMemo(
    () => chartRows(report.agents, granularity, metric),
    [report, granularity, metric],
  );
  return (
    <section className="card chart-card">
      <header className="card-head">
        <h2>{metric === "tokens" ? "Tokens" : "Dépense"}</h2>
        <div className="seg">
          {(["daily", "weekly", "monthly"] as const).map((value) => (
            <button
              key={value}
              className={granularity === value ? "on" : ""}
              onClick={() => setGranularity(value)}
            >
              {{ daily: "Jour", weekly: "Semaine", monthly: "Mois" }[value]}
            </button>
          ))}
        </div>
        <div className="seg">
          {(["tokens", "cost"] as const).map((value) => (
            <button
              key={value}
              className={metric === value ? "on" : ""}
              onClick={() => setMetric(value)}
            >
              {value === "tokens" ? "Tokens" : "USD"}
            </button>
          ))}
        </div>
      </header>
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="bucket" stroke="var(--muted)" tickLine={false} minTickGap={28} />
            <YAxis
              stroke="var(--muted)"
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(value: number) =>
                metric === "tokens" ? formatTokens(value) : `$${Math.round(value)}`
              }
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.05)" }}
              contentStyle={{
                background: "var(--panel-2)",
                border: "1px solid var(--line)",
                borderRadius: 8,
              }}
              formatter={(value: number, name: string) => [
                metric === "tokens" ? formatTokens(value) : formatUsd(value),
                agentLabel(name),
              ]}
            />
            {report.agents.map((agent) => (
              <Bar
                key={agent.agent}
                dataKey={agent.agent}
                stackId="usage"
                fill={agentColor(agent.agent)}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="legend">
        {report.agents.map((agent) => (
          <span key={agent.agent}>
            <i style={{ background: agentColor(agent.agent) }} />
            {agentLabel(agent.agent)}
          </span>
        ))}
      </div>
    </section>
  );
}

function Harnesses({ report }: { report: UsageReport }) {
  const max = Math.max(...report.agents.map((agent) => agent.totalTokens), 1);
  return (
    <section className="card">
      <header className="card-head">
        <h2>Par harness</h2>
        <span className="muted">{report.agents.length} actifs</span>
      </header>
      <ul className="harness-list">
        {report.agents.map((agent) => (
          <li key={agent.agent}>
            <div className="row">
              <strong>{agentLabel(agent.agent)}</strong>
              <span>{formatUsd(agent.totalCost)}</span>
            </div>
            <div className="bar">
              <div
                style={{
                  width: `${(agent.totalTokens / max) * 100}%`,
                  background: agentColor(agent.agent),
                }}
              />
            </div>
            <div className="muted small">{formatTokens(agent.totalTokens)} tokens</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Models({ report }: { report: UsageReport }) {
  const [filter, setFilter] = useState("");
  const rows = report.models.filter((row) =>
    row.model.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  return (
    <section className="card">
      <header className="card-head">
        <h2>Modèles</h2>
        <span className="muted">{report.models.length}</span>
        <input
          className="filter"
          placeholder="Filtrer les modèles"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </header>
      <table>
        <thead>
          <tr>
            <th>Modèle</th>
            <th className="num">Tokens</th>
            <th className="num">Dépense</th>
            <th className="num">Part</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.model}>
              <td>{row.model}</td>
              <td className="num">{formatTokens(row.totalTokens)}</td>
              <td className="num">{formatUsd(row.totalCost)}</td>
              <td className="num">{row.percentage.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Dashboard({ report, children }: { report: UsageReport; children?: React.ReactNode }) {
  const tokens = report.totals.totalTokens;
  const cost = report.totals.totalCost;
  return (
    <div className="stack">
      <section className="card stats">
        <Stat label="Dépense totale" value={formatUsd(cost)} hint="Valeur équivalente API" />
        <Stat label="Tokens" value={formatTokens(tokens)} hint="Entrée, sortie et cache" />
        <Stat label="Tokens moyens / $" value={tokensPerDollar(tokens, cost)} hint="Sur toute la période" />
        <Stat label="Modèles" value={String(report.models.length)} hint="Tous harness confondus" />
      </section>
      {children}
      <div className="grid">
        <UsageChart report={report} />
        <Harnesses report={report} />
      </div>
      <Models report={report} />
    </div>
  );
}

function QuotaPanel({ cards }: { cards: QuotaCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section className="card">
      <header className="card-head">
        <h2>Quotas d'abonnement</h2>
        <span className="muted">Lecture en direct</span>
      </header>
      <div className="quota-grid">
        {cards.map((card) => (
          <div key={`${card.harness}-${card.sources.join()}`} className="quota-card">
            <div className="row">
              <strong>{agentLabel(card.harness)}</strong>
              <span className="muted small">{card.sources.join(" · ")}</span>
            </div>
            {card.gauges.map((entry) => {
              const color = entry.remaining < 15 ? "var(--danger)" : agentColor(card.harness);
              const ahead = entry.pace >= 0;
              return (
                <div key={entry.label} className="gauge">
                  <div className="row small muted">
                    <span>{entry.label}</span>
                    <span>Reset dans {formatDuration(entry.minutesToReset)}</span>
                  </div>
                  <div className="gauge-main">
                    <span className="gauge-value">{entry.remaining.toFixed(0)}%</span>
                    <span className="muted"> restants</span>
                    <span className={ahead ? "pace ok" : "pace bad"}>
                      {ahead ? "+" : "−"}
                      {Math.abs(entry.pace).toFixed(1)} pts {ahead ? "d'avance" : "de retard"}
                    </span>
                  </div>
                  <div className="bar gauge-bar">
                    <div style={{ width: `${entry.remaining}%`, background: color }} />
                  </div>
                  {entry.minutesToEmpty !== null && (
                    <div className="small warn">
                      Épuisé dans ≈ {formatDuration(entry.minutesToEmpty)} à ce rythme, avant le reset.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function EnvironmentSplit({ parts }: { parts: { label: string; report: UsageReport }[] }) {
  const total = parts.reduce((sum, part) => sum + part.report.totals.totalTokens, 0) || 1;
  return (
    <section className="card">
      <header className="card-head">
        <h2>Par environnement</h2>
        <span className="muted">Sources distinctes, additionnées</span>
      </header>
      <div className="env-split">
        {parts.map((part) => (
          <div key={part.label} className="env">
            <div className="row">
              <strong>{part.label}</strong>
              <span>
                {formatTokens(part.report.totals.totalTokens)} tokens ·{" "}
                {formatUsd(part.report.totals.totalCost)}
              </span>
            </div>
            <div className="bar">
              <div style={{ width: `${(part.report.totals.totalTokens / total) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
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

function reportOf(state: SourceState | undefined): UsageReport | undefined {
  if (!state) return undefined;
  if (state.status === "ready") return state.report;
  if (state.status === "loading" || state.status === "error") return state.previous;
  return undefined;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(readSettings);
  const [detected, setDetected] = useState<Detected | null>(null);
  const [states, setStates] = useState<Record<string, SourceState>>({});
  const [tab, setTab] = useState<TabId>("windows");
  const [distro, setDistro] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [quotas, setQuotas] = useState<Record<string, Record<string, QuotaReading>>>({});

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

  useEffect(() => {
    detectSources()
      .then(setDetected)
      .catch(() => setDetected({ distros: [] }));
  }, []);

  const refresh = useCallback(() => {
    for (const id of sourceIds) {
      setStates((current) => {
        const previous = reportOf(current[id]);
        return { ...current, [id]: { status: "loading", previous } };
      });
      const name = id === "windows" ? null : id.slice(4);
      loadUsage(name, settings.offline)
        .then((report) =>
          setStates((current) => ({
            ...current,
            [id]: { status: "ready", report, loadedAt: Date.now() },
          })),
        )
        .catch((error) =>
          setStates((current) => ({
            ...current,
            [id]: {
              status: "error",
              message: String(error),
              previous: reportOf(current[id]),
            },
          })),
        );
    }
  }, [sourceIds, settings.offline]);

  useEffect(() => {
    if (detected) refresh();
  }, [detected, refresh]);

  const refreshQuotas = useCallback(
    (force: boolean) => {
      for (const id of sourceIds) {
        const name = id === "windows" ? null : id.slice(4);
        for (const harness of ["claude", "codex"]) {
          loadQuota(harness, name, force)
            .then((reading) =>
              setQuotas((current) => ({
                ...current,
                [id]: { ...current[id], [harness]: reading },
              })),
            )
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

  const cardsFor = (ids: string[]): QuotaCard[] =>
    quotaCards(
      ids.flatMap((id) =>
        Object.values(quotas[id] ?? {}).map((reading) => ({
          source: id === "windows" ? "Windows" : `WSL · ${id.slice(4)}`,
          reading,
        })),
      ),
    );

  useEffect(() => {
    if (!hasWsl && tab !== "windows") setTab("windows");
  }, [hasWsl, tab]);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    writeSettings(next);
  };

  const windowsState = states["windows"];
  const wslState = activeDistro ? states[`wsl:${activeDistro.name}`] : undefined;
  const loading = sourceIds.some((id) => states[id]?.status === "loading");

  const computer = useMemo(() => {
    const parts = sourceIds.map((id) => ({
      label: id === "windows" ? "Windows" : `WSL · ${id.slice(4)}`,
      report: reportOf(states[id]),
    }));
    const ready = parts.filter(
      (part): part is { label: string; report: UsageReport } => part.report !== undefined,
    );
    return ready.length ? { parts: ready, report: mergeReports(ready.map((part) => part.report)) } : null;
  }, [sourceIds, states]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "windows", label: "Windows" },
    ...(hasWsl
      ? [
          { id: "wsl" as TabId, label: "WSL" },
          { id: "computer" as TabId, label: "Computer" },
        ]
      : []),
  ];

  const missing = computer && computer.parts.length < sourceIds.length;
  const windowsReport = reportOf(windowsState);
  const wslReport = reportOf(wslState);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="flame">🔥</span>
          <strong>Agent Burn</strong>
        </div>
        <nav className="tabs">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              className={tab === entry.id ? "on" : ""}
              onClick={() => setTab(entry.id)}
            >
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
              checked={settings.offline}
              onChange={(event) => updateSettings({ ...settings, offline: event.target.checked })}
            />
            Mode hors ligne (aucun appel réseau, mais les modèles récents peuvent afficher 0 $)
          </label>
        </div>
      )}

      <main>
        {tab === "windows" &&
          (windowsReport ? (
            <Dashboard report={windowsReport}>
              <QuotaPanel cards={cardsFor(["windows"])} />
            </Dashboard>
          ) : (
            <Pending state={windowsState} label="Windows" />
          ))}
        {tab === "wsl" &&
          (wslReport ? (
            <Dashboard report={wslReport}>
              <QuotaPanel cards={cardsFor(activeDistro ? [`wsl:${activeDistro.name}`] : [])} />
            </Dashboard>
          ) : (
            <Pending state={wslState} label={`WSL ${activeDistro?.name ?? ""}`} />
          ))}
        {tab === "computer" &&
          (computer ? (
            <Dashboard report={computer.report}>
              {missing && (
                <div className="notice error">
                  Une source n'a pas pu être lue : le total Computer est partiel.
                </div>
              )}
              <QuotaPanel cards={cardsFor(sourceIds)} />
              <EnvironmentSplit parts={computer.parts} />
            </Dashboard>
          ) : (
            <div className="notice">Lecture en cours…</div>
          ))}
      </main>
    </div>
  );
}
