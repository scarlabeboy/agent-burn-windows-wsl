import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTokens, formatUsd, sortModels, tokensPerDollar, type ModelSort, type ModelSortKey } from "./aggregate";
import { IdleChart, QuotaChart } from "./QuotaChart";
import { budget, cycleEnded, formatDay, formatDuration, freshness, type GaugeModel, type QuotaCard } from "./quota";
import { useNow } from "./useNow";
import type { AgentReport, ClaudeAccount, SubscriptionAgent, TokenBreakdown, UsageReport } from "./types";
import amp from "./assets/brands/amp.png";
import claude from "./assets/brands/claude.png";
import codex from "./assets/brands/codex.png";
import cursor from "./assets/brands/cursor.png";
import droid from "./assets/brands/droid.png";
import gemini from "./assets/brands/gemini.png";
import kimi from "./assets/brands/kimi.png";
import openclaw from "./assets/brands/openclaw.png";
import opencode from "./assets/brands/opencode.png";
import pi from "./assets/brands/pi.png";
import qwen from "./assets/brands/qwen.png";

const BRANDS: Record<string, string> = {
  amp, claude, codex, cursor, droid, gemini, kimi, openclaw, opencode, pi, qwen,
};

const AGENT_COLORS: Record<string, string> = {
  codex: "#2ed573",
  claude: "#ff8a3d",
  cursor: "#c44dff",
  opencode: "#4f7cff",
  openclaw: "#ff4d5e",
};
const FALLBACK_COLORS = ["#2ec4b6", "#f4d35e", "#ee6c9a", "#8d99ae", "#7bdff2"];

export function agentColor(agent: string): string {
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
  droid: "Droid",
  gemini: "Gemini",
  kimi: "Kimi",
  pi: "Pi",
  amp: "Amp",
  qwen: "Qwen",
  codebuff: "Codebuff",
  copilot: "Copilot",
  goose: "Goose",
  hermes: "Hermes",
  kilo: "Kilo",
};
export const agentLabel = (agent: string) => AGENT_LABELS[agent] ?? agent;

export function BrandIcon({ agent, size = 22 }: { agent: string; size?: number }) {
  const src = BRANDS[agent];
  return src ? (
    <img className="brand" src={src} width={size} height={size} alt="" />
  ) : (
    <span className="brand fallback" style={{ width: size, height: size, background: agentColor(agent) }}>
      {agentLabel(agent).slice(0, 1)}
    </span>
  );
}

/** The overview's own badge, shaped like the harness icons: every harness's share of a pie. */
export function OverviewIcon({ size = 22 }: { size?: number }) {
  return (
    <svg className="brand" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="overview-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9a3d" />
          <stop offset="1" stopColor="#e8457c" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#overview-badge)" />
      <path d="M11 5.6a6.6 6.6 0 1 0 7.4 7.4H11z" fill="#fff" />
      <path d="M13 3.8V11h7.2A7.2 7.2 0 0 0 13 3.8z" fill="#fff" fillOpacity="0.7" />
    </svg>
  );
}

export const asReport =(agent: AgentReport, approxDetail = false): UsageReport => ({
  agents: [agent],
  daily: agent.daily,
  models: agent.models,
  totals: { totalCost: agent.totalCost, totalTokens: agent.totalTokens },
  approxDetail: approxDetail || undefined,
  archivedDays: agent.archivedDays,
});

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

export function Stats({
  report,
  label,
  period = "Sur toute la période",
}: {
  report: UsageReport;
  label: string;
  period?: string;
}) {
  const tokens = report.totals.totalTokens;
  const cost = report.totals.totalCost;
  return (
    <section className="card stats">
      <Stat title="Dépense totale" value={formatUsd(cost)} hint="Valeur équivalente API" />
      <Stat title="Tokens" value={formatTokens(tokens)} hint="Entrée, sortie et cache" />
      <Stat title="Tokens moyens / $" value={tokensPerDollar(tokens, cost)} hint={period} />
      <Stat title="Modèles" value={report.approxDetail ? "…" : String(report.models.length)} hint={label} />
    </section>
  );
}

function Stat({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{title}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-hint">{hint}</div>
    </div>
  );
}

export function SpendChart({
  report,
  defaultGranularity = "monthly",
}: {
  report: UsageReport;
  defaultGranularity?: Granularity;
}) {
  const [granularity, setGranularity] = useState<Granularity>(defaultGranularity);
  const [metric, setMetric] = useState<Metric>("cost");
  const rows = useMemo(
    () => chartRows(report.agents, granularity, metric),
    [report, granularity, metric],
  );
  const labels = { daily: "Jour", weekly: "Semaine", monthly: "Mois" } as const;
  return (
    <section className="card chart-card">
      <header className="card-head">
        <h2>{metric === "cost" ? "Dépense" : "Tokens"}</h2>
        <div className="seg">
          {(Object.keys(labels) as Granularity[]).map((value) => (
            <button key={value} className={granularity === value ? "on" : ""} onClick={() => setGranularity(value)}>
              {labels[value]}
            </button>
          ))}
        </div>
        <div className="seg">
          {(["cost", "tokens"] as const).map((value) => (
            <button key={value} className={metric === value ? "on" : ""} onClick={() => setMetric(value)}>
              {value === "cost" ? "USD" : "Tokens"}
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
                metric === "tokens"
                  ? formatTokens(value)
                  : // Small totals need cents, or every tick of the axis reads "$0".
                    `$${Math.abs(value) < 10 && value % 1 !== 0 ? value.toFixed(2) : Math.round(value)}`
              }
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.05)" }}
              contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8 }}
              formatter={(value: number, name: string) => [
                metric === "tokens" ? formatTokens(value) : formatUsd(value),
                agentLabel(name),
              ]}
            />
            {report.agents.map((agent) => (
              <Bar key={agent.agent} dataKey={agent.agent} stackId="usage" fill={agentColor(agent.agent)} isAnimationActive={false} />
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

export function HarnessList({ report, onSelect }: { report: UsageReport; onSelect: (agent: string) => void }) {
  const max = Math.max(...report.agents.map((agent) => agent.totalCost), 0.0001);
  return (
    <section className="card">
      <header className="card-head">
        <h2>Par harness</h2>
        <span className="muted">{report.agents.length} actifs</span>
      </header>
      <ul className="harness-list">
        {report.agents.map((agent) => (
          <li key={agent.agent}>
            <button className="harness-row" onClick={() => onSelect(agent.agent)}>
              <BrandIcon agent={agent.agent} size={30} />
              <div className="harness-body">
                <div className="row">
                  <strong>{agentLabel(agent.agent)}</strong>
                  <span>{formatUsd(agent.totalCost)}</span>
                </div>
                <div className="bar">
                  <div style={{ width: `${(agent.totalCost / max) * 100}%`, background: agentColor(agent.agent) }} />
                </div>
                <div className="muted small">{formatTokens(agent.totalTokens)} tokens</div>
              </div>
              <span className="chevron">›</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Shown in place of per-model detail while a period scan runs, or when it failed. */
function DetailPending({ title, error }: { title: string; error?: string }) {
  return (
    <section className="card">
      <header className="card-head">
        <h2>{title}</h2>
      </header>
      <p className="muted small">
        {error
          ? `Détail indisponible pour cette période : ${error}`
          : "Calcul du détail pour cette période en cours… Les totaux et le graphique sont déjà exacts."}
      </p>
    </section>
  );
}

const MODEL_COLUMNS: { key: ModelSortKey; label: string; numeric: boolean }[] = [
  { key: "model", label: "Modèle", numeric: false },
  { key: "tokens", label: "Tokens", numeric: true },
  { key: "cost", label: "Dépense", numeric: true },
  { key: "share", label: "Part", numeric: true },
];

export function Models({ report, detailError }: { report: UsageReport; detailError?: string }) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<ModelSort>({ key: "cost", descending: true });
  if (report.approxDetail) return <DetailPending title="Modèles" error={detailError} />;
  const rows = sortModels(
    report.models.filter((row) => row.model.toLowerCase().includes(filter.trim().toLowerCase())),
    sort,
  );
  // The same column flips the order; another starts with names A to Z and numbers largest first.
  const sortBy = (key: ModelSortKey, numeric: boolean) =>
    setSort((current) => (current.key === key ? { key, descending: !current.descending } : { key, descending: numeric }));
  return (
    <section className="card">
      <header className="card-head">
        <h2>Modèles</h2>
        <span className="muted">{report.models.length}</span>
        <input className="filter" placeholder="Filtrer les modèles" value={filter} onChange={(event) => setFilter(event.target.value)} />
      </header>
      <table>
        <thead>
          <tr>
            {MODEL_COLUMNS.map((column) => (
              <th
                key={column.key}
                className={column.numeric ? "num" : undefined}
                aria-sort={sort.key === column.key ? (sort.descending ? "descending" : "ascending") : undefined}
              >
                <button
                  className={`sort${sort.key === column.key ? " on" : ""}`}
                  onClick={() => sortBy(column.key, column.numeric)}
                >
                  {column.label}
                  <span className="sort-arrow">{sort.key === column.key ? (sort.descending ? "▼" : "▲") : ""}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.model}>
              <td>{row.model}</td>
              <td className="num">{formatTokens(row.totalTokens)}</td>
              <td className="num">{formatUsd(row.totalCost)}</td>
              <td className="num">
                <span className="share">
                  <span className="bar share-bar">
                    <div style={{ width: `${Math.min(100, row.percentage)}%` }} />
                  </span>
                  <span className="share-value">{row.percentage.toFixed(1)}%</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.archivedDays ? (
        <p className="muted small hint-top">
          {report.archivedDays} {report.archivedDays > 1 ? "journées viennent" : "journée vient"} de l'archive de
          l'application (journaux supprimés depuis) : comptées dans les totaux, mais pas détaillées par modèle.
        </p>
      ) : null}
    </section>
  );
}

export function TokenBreakdownCard({
  breakdown,
  pending,
  detailError,
}: {
  breakdown: TokenBreakdown;
  pending?: boolean;
  detailError?: string;
}) {
  if (pending) return <DetailPending title="Répartition des tokens" error={detailError} />;
  return (
    <section className="card">
      <header className="card-head">
        <h2>Répartition des tokens</h2>
      </header>
      <div className="stats">
        <Stat title="Entrée" value={formatTokens(breakdown.input)} hint="Hors cache" />
        <Stat title="Sortie" value={formatTokens(breakdown.output)} hint="Générés" />
        <Stat title="Écriture cache" value={formatTokens(breakdown.cacheWrite)} hint="Cache write" />
        <Stat title="Lecture cache" value={formatTokens(breakdown.cacheRead)} hint="Cache read" />
      </div>
    </section>
  );
}

export function EnvironmentSplit({ parts }: { parts: { label: string; report: UsageReport }[] }) {
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
                {formatTokens(part.report.totals.totalTokens)} tokens · {formatUsd(part.report.totals.totalCost)}
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

function GaugeCard({
  title,
  model,
  card,
  weekly,
  nowMs,
}: {
  title: string;
  model: GaugeModel;
  card: QuotaCard;
  weekly: boolean;
  nowMs: number;
}) {
  const ahead = model.pace >= 0;
  const color = agentColor(card.harness);
  // Counted from now, not from the reading: an old reading must not show a frozen countdown.
  const ended = cycleEnded(model, nowMs);
  return (
    <div className={`gauge-card${weekly && model.minutesToEmpty !== null ? " danger" : ""}${ended ? " ended" : ""}`}>
      <div className="row small muted">
        <span className="caps">{title}</span>
        {ended ? (
          <span className="late">Cycle terminé · nouveau relevé attendu</span>
        ) : (
          <span>Reset dans {formatDuration((model.endMs - nowMs) / 60_000)}</span>
        )}
      </div>
      <div className="gauge-main">
        <span className="gauge-value">{model.remaining.toFixed(0)}%</span>
        <span className="muted"> restants</span>
        <span className={ahead ? "pace ok" : "pace bad"}>
          {ahead ? "+" : "−"}
          {Math.abs(model.pace).toFixed(1)} pts {ahead ? "d'avance" : "de retard"}
        </span>
      </div>
      <QuotaChart harness={card.harness} model={model} observedAt={card.observedAt} color={color} weekly={weekly} />
    </div>
  );
}

/**
 * The 5-hour window has not started: Claude gives no reset time until the first message, and
 * Codex gives an untouched window whose reset keeps moving, so there is nothing to chart. The
 * card keeps its place so the layout does not jump.
 */
function IdleSessionCard() {
  return (
    <div className="gauge-card idle">
      <div className="row small muted">
        <span className="caps">Session 5 h</span>
        <span>Pas de session en cours</span>
      </div>
      <div className="gauge-main">
        <span className="gauge-value">100%</span>
        <span className="muted"> restants</span>
      </div>
      <IdleChart note="Démarre dès votre premier message." />
    </div>
  );
}

/** Subscription quota of one harness: warning banner plus the 5-hour and weekly charts. */
export function QuotaSection({ card, resetCredits }: { card: QuotaCard; resetCredits?: number }) {
  const weekly = card.weekly;
  const spend = budget(weekly);
  const emptyAt = weekly.minutesToEmpty !== null ? card.observedAt + weekly.minutesToEmpty * 60_000 : null;
  const nowMs = useNow(15_000);
  const state = freshness(card.observedAt, nowMs);
  return (
    <section className="card">
      <header className="card-head">
        <h2>Quota {agentLabel(card.harness)}</h2>
        {resetCredits ? (
          <span className="chip" title="Resets de limite gardés par le fournisseur, à utiliser quand une limite est atteinte">
            ↺ {resetCredits} {resetCredits > 1 ? "resets" : "reset"} en stock
          </span>
        ) : null}
        <span
          className={`fresh small ${state.fresh ? "ok" : "late"}`}
          title={`${state.fresh ? "En direct · mesuré" : "Mesuré"} le ${new Date(card.observedAt).toLocaleString("fr-FR")}`}
        >
          <i className="dot" />
          {card.sources.join(" · ")} · {state.label}
        </span>
      </header>
      {emptyAt !== null && (
        <div className="banner">
          <strong>La limite hebdomadaire sera atteinte ≈ {formatDay(emptyAt)}.</strong>{" "}
          {spend.perDay
            ? `Restez sous ${spend.percent.toFixed(1)} %/jour pour tenir jusqu'au reset (${formatDay(weekly.endMs)}).`
            : `Il reste ${PERCENT.format(spend.percent)} % pour tenir jusqu'au reset (${formatDay(weekly.endMs)}).`}
        </div>
      )}
      <div className="gauge-grid">
        {card.session ? (
          <GaugeCard title="Session 5 h" model={card.session} card={card} weekly={false} nowMs={nowMs} />
        ) : (
          <IdleSessionCard />
        )}
        <GaugeCard title="Hebdomadaire" model={weekly} card={card} weekly nowMs={nowMs} />
      </div>
      <p className="muted small hint">
        {card.harness === "codex"
          ? "Historique reconstitué depuis vos logs Codex, puis complété par les relevés de l'application."
          : "Les relevés sont enregistrés tant que l'application est ouverte ; la courbe commence au premier relevé."}
      </p>
    </section>
  );
}

const PERCENT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** Plan, price and value of one subscription, from `summary --value`. */
export function SubscriptionCard({
  harness,
  sub,
  account,
  card,
  offReason,
}: {
  harness: string;
  sub?: SubscriptionAgent;
  account?: ClaudeAccount;
  card?: QuotaCard;
  /** Set when quotas are not read: the block stays, with this reason instead of figures. */
  offReason?: string;
}) {
  const estimate = sub?.estimate ?? null;
  const scoped = harness === "claude" ? (account?.scoped ?? []) : [];
  const extra = harness === "claude" && account?.extraEnabled ? account : undefined;
  if (!offReason && !sub && scoped.length === 0 && !extra) return null;
  const known = sub?.plan && sub.plan !== "";
  const spend = card ? budget(card.weekly) : null;
  if (offReason) {
    // Without quotas the plan is not shown either, even when a local file still names one.
    return (
      <section className="card">
        <header className="card-head">
          <h2>Abonnement</h2>
          <span className="chip">{agentLabel(harness)} · plan non lu</span>
        </header>
        <p className="muted small hint-top">{offReason}</p>
      </section>
    );
  }
  return (
    <section className="card">
      <header className="card-head">
        <h2>Abonnement</h2>
        <span className="chip">
          {agentLabel(harness)} · {known ? sub?.plan : "plan inconnu"}
          {sub?.pricePerMonth != null && ` · ${formatUsd(sub.pricePerMonth)}/mois`}
        </span>
      </header>
      {!known && harness === "claude" && (
        <p className="muted small hint-top">
          Le plan n'a pas pu être détecté : il est lu dans la connexion de Claude Code (commande
          claude) de cet environnement.
        </p>
      )}
      {estimate && (
        <div className="stats">
          <Stat
            title="Valeur / prix du forfait"
            value={estimate.valueMultiple != null ? `${estimate.valueMultiple.toFixed(1)}×` : "n/a"}
            hint="Usage mensuel estimé ÷ prix"
          />
          <Stat title="Valeur mensuelle estimée" value={formatUsd(estimate.monthlyValue)} hint="Équivalent API" />
          <Stat
            title="Consommation projetée"
            value={`${PERCENT.format(estimate.projectedUsePercent)}%`}
            hint="Du quota, au rythme actuel"
          />
          <Stat
            title="Rythme conseillé"
            value={
              spend === null
                ? "n/a"
                : spend.perDay
                  ? `${spend.percent.toFixed(1)} %/j`
                  : `${PERCENT.format(spend.percent)} %`
            }
            hint={
              spend !== null && card && !spend.perDay
                ? `D'ici le reset (dans ${formatDuration(card.weekly.minutesToReset)})`
                : "Pour tenir jusqu'au reset"
            }
          />
        </div>
      )}
      {scoped.length > 0 && (
        <div className="scoped">
          {scoped.map((window) => (
            <div key={window.name}>
              <div className="row small">
                <span>{window.name} · hebdomadaire</span>
                <span>{Math.max(0, 100 - window.usedPercent).toFixed(0)}% restants</span>
              </div>
              <div className="bar">
                <div style={{ width: `${Math.max(0, 100 - window.usedPercent)}%`, background: agentColor(harness) }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {extra && (
        <p className="small hint-top">
          Crédits d'usage supplémentaire : {formatUsd(extra.extraUsedUSD ?? 0)}
          {extra.extraLimitUSD != null && ` sur ${formatUsd(extra.extraLimitUSD)}`}
        </p>
      )}
      <p className="muted small hint-top">
        La dépense affichée est un équivalent API, pas votre facture d'abonnement.
      </p>
    </section>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="stack">{children}</div>;
}
