import { useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { getVersion, pastCycles, readSeries, subscribe } from "./archive";
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
import {
  SESSION_MINUTES,
  budget,
  cycleEnded,
  formatAxis,
  formatClock,
  formatDay,
  formatDuration,
  freshness,
  pastGauge,
  type GaugeModel,
  type QuotaCard,
} from "./quota";
import { formatNumber, getLang, locale, percent, t } from "./i18n";
import { pricingTip } from "./pricingFormat";
import { Glyph, TitleIcon, type GlyphKind } from "./TitleIcons";
import { ChartLabel, withoutZeros } from "./ChartLabel";
import { Tooltip as InfoTooltip } from "./Tooltip";
import { useNow } from "./useNow";

/** "$12.50" in English, "12,50 $" in French. */
const usd = (amount: string): string => (getLang() === "fr" ? `${amount} $` : `$${amount}`);
import type { AgentReport, ClaudeAccount, ModelPricing, SubscriptionAgent, TokenBreakdown, UsageReport } from "./types";
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

/** A quota card's badge: the harness's own logo, on a tint of its colour. */
export function QuotaIcon({ harness }: { harness: string }) {
  return (
    <span className="title-icon" style={{ "--tone": agentColor(harness) } as CSSProperties}>
      <BrandIcon agent={harness} size={16} />
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

/** A bucket key ("2026-09-14", "2026-10") as the language writes it: "14/09" or "09/14",
 * "oct. 2026" or "Oct 2026". Keys stay ISO so the rows sort by date. */
function bucketLabel(key: string, granularity: Granularity): string {
  if (granularity === "monthly") {
    const month = new Date(`${key}-01T00:00:00Z`);
    return month.toLocaleDateString(locale(), { month: "short", year: "numeric", timeZone: "UTC" });
  }
  return getLang() === "en" ? `${key.slice(5, 7)}/${key.slice(8, 10)}` : `${key.slice(8, 10)}/${key.slice(5, 7)}`;
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
  period = t().views.wholePeriod,
}: {
  report: UsageReport;
  label: string;
  period?: string;
}) {
  const tokens = report.totals.totalTokens;
  const cost = report.totals.totalCost;
  const text = t().views;
  return (
    <section className="card stats">
      <Stat icon="spend" title={text.totalSpend} value={formatUsd(cost)} hint={text.apiValue} />
      <Stat icon="tokens" title={text.tokens} value={formatTokens(tokens)} hint={text.tokensHint} />
      <Stat icon="rate" title={text.tokensPerDollar} value={tokensPerDollar(tokens, cost)} hint={period} />
      <Stat
        icon="models"
        title={text.models}
        value={report.approxDetail ? "…" : String(report.models.length)}
        hint={label}
      />
    </section>
  );
}

function Stat({ title, value, hint, icon }: { title: string; value: string; hint: string; icon?: GlyphKind }) {
  return (
    <div className="stat">
      <div className="stat-label">
        {icon && <TitleIcon kind={icon} />}
        {title}
      </div>
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
  const labels = t().views.granularity;
  return (
    <section className="card chart-card">
      <header className="card-head">
        <h2>
          <TitleIcon kind="chart" />
          {metric === "cost" ? t().views.spend : t().views.tokens}
        </h2>
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
          <BarChart data={withoutZeros(rows, report.agents.map((agent) => agent.agent))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis
              dataKey="bucket"
              stroke="var(--muted)"
              tickLine={false}
              minTickGap={28}
              tickFormatter={(key: string) => bucketLabel(key, granularity)}
            />
            <YAxis
              stroke="var(--muted)"
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(value: number) =>
                metric === "tokens"
                  ? formatTokens(value)
                  : // Small totals need cents, or every tick of the axis reads "$0".
                    usd(formatNumber(value, Math.abs(value) < 10 && value % 1 !== 0 ? 2 : 0))
              }
            />
            <Tooltip
              cursor={{ className: "chart-cursor" }}
              contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8 }}
              labelFormatter={(label: string, payload) => (
                <ChartLabel
                  label={bucketLabel(label, granularity)}
                  payload={payload}
                  format={(total) => (metric === "tokens" ? formatTokens(total) : formatUsd(total))}
                />
              )}
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
    <section className="card harness-card">
      <header className="card-head">
        <h2>
          <TitleIcon kind="flame" />
          {t().views.byHarness}
        </h2>
        <span className="muted">{t().views.activeCount(report.agents.length)}</span>
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
function DetailPending({ title, icon, error }: { title: string; icon: GlyphKind; error?: string }) {
  return (
    <section className="card">
      <header className="card-head">
        <h2>
          <TitleIcon kind={icon} />
          {title}
        </h2>
      </header>
      <p className="muted small">
        {error ? t().views.detailUnavailable(error) : t().views.detailPending}
      </p>
    </section>
  );
}

const MODEL_COLUMNS: { key: ModelSortKey; numeric: boolean }[] = [
  { key: "model", numeric: false },
  { key: "tokens", numeric: true },
  { key: "cost", numeric: true },
  { key: "share", numeric: true },
];

/** Rate badge in front of a model name: orange with its rates, grey when unknown or all zero. */
function PricingBadge({ pricing }: { pricing: ModelPricing | undefined }) {
  const tip = pricingTip(pricing);
  return (
    <InfoTooltip text={tip.text}>
      <button type="button" className={`model-pricing-icon${tip.muted ? " muted" : ""}`} aria-label={t().views.pricingLabel}>
        <Glyph kind="spend" size={12} />
      </button>
    </InfoTooltip>
  );
}

export function Models({ report, pricing, detailError }: {
  report: UsageReport;
  pricing: Record<string, ModelPricing>;
  detailError?: string;
}) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<ModelSort>({ key: "cost", descending: true });
  const text = t().views;
  if (report.approxDetail) return <DetailPending title={text.models} icon="models" error={detailError} />;
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
        <h2>
          <TitleIcon kind="models" />
          {text.models}
        </h2>
        <span className="muted">{report.models.length}</span>
        <input className="filter" placeholder={text.filterModels} value={filter} onChange={(event) => setFilter(event.target.value)} />
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
                  {text.columns[column.key]}
                  <span className="sort-arrow">{sort.key === column.key ? (sort.descending ? "▼" : "▲") : ""}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.model}>
              <td>
                <span className="model-name">
                  <PricingBadge pricing={Object.hasOwn(pricing, row.model) ? pricing[row.model] : undefined} />
                  {row.model}
                </span>
              </td>
              <td className="num">{formatTokens(row.totalTokens)}</td>
              <td className="num">{formatUsd(row.totalCost)}</td>
              <td className="num">
                <span className="share">
                  <span className="bar share-bar">
                    <div style={{ width: `${Math.min(100, row.percentage)}%` }} />
                  </span>
                  <span className="share-value">{percent(formatNumber(row.percentage, 1))}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.archivedDays ? (
        <p className="muted small hint-top">{text.archivedDays(report.archivedDays)}</p>
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
  const text = t().views;
  if (pending) return <DetailPending title={text.breakdown} icon="breakdown" error={detailError} />;
  return (
    <section className="card">
      <header className="card-head">
        <h2>
          <TitleIcon kind="breakdown" />
          {text.breakdown}
        </h2>
      </header>
      <div className="stats">
        <Stat title={text.input} value={formatTokens(breakdown.input)} hint={text.inputHint} />
        <Stat title={text.output} value={formatTokens(breakdown.output)} hint={text.outputHint} />
        <Stat title={text.cacheWrite} value={formatTokens(breakdown.cacheWrite)} hint={text.cacheWriteHint} />
        <Stat title={text.cacheRead} value={formatTokens(breakdown.cacheRead)} hint={text.cacheReadHint} />
      </div>
    </section>
  );
}

export function EnvironmentSplit({ parts }: { parts: { label: string; report: UsageReport }[] }) {
  const total = parts.reduce((sum, part) => sum + part.report.totals.totalTokens, 0) || 1;
  return (
    <section className="card">
      <header className="card-head">
        <h2>
          <TitleIcon kind="monitor" />
          {t().views.byEnvironment}
        </h2>
        <span className="muted">{t().views.byEnvironmentHint}</span>
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

/**
 * One quota window of a harness: the cycle under way, or a closed one picked with the arrows.
 * The 5-hour and the weekly cards each browse their own cycles.
 */
function WindowCard({
  title,
  model,
  card,
  weekly,
  nowMs,
}: {
  title: string;
  /** Absent for a session not under way. */
  model?: GaugeModel;
  card: QuotaCard;
  weekly: boolean;
  nowMs: number;
}) {
  const windowMinutes = model?.window.windowMinutes ?? SESSION_MINUTES;
  // Null for the cycle under way, otherwise the end of the closed cycle shown.
  const [shownEnd, setShownEnd] = useState<number | null>(null);
  const archiveVersion = useSyncExternalStore(subscribe, getVersion);
  // Without a session under way, every recorded one ended before now.
  const currentEnd = model?.endMs ?? nowMs;
  const currentMinute = Math.floor(currentEnd / 60_000);
  const ends = useMemo(
    () => pastCycles(card.harness, windowMinutes, currentEnd),
    [card.harness, windowMinutes, currentMinute, archiveVersion],
  );
  const selected = shownEnd !== null && ends.includes(shownEnd) ? shownEnd : null;
  const older = ends.find((end) => selected === null || end < selected);
  const newer = selected === null ? undefined : [...ends].reverse().find((end) => end > selected);
  const text = t().views;
  const nav = ends.length > 0 && (
    <span className="win-nav">
      <button
        disabled={older === undefined}
        title={text.olderWindow}
        aria-label={text.olderWindow}
        onClick={() => setShownEnd(older ?? null)}
      >
        ‹
      </button>
      <button
        disabled={selected === null}
        title={text.newerWindow}
        aria-label={text.newerWindow}
        onClick={() => setShownEnd(newer ?? null)}
      >
        ›
      </button>
      {selected !== null && (
        <button className="win-current" onClick={() => setShownEnd(null)}>
          {text.currentWindow}
        </button>
      )}
    </span>
  );
  if (selected !== null) {
    return <PastCard title={title} card={card} windowMinutes={windowMinutes} endMs={selected} weekly={weekly} nav={nav} />;
  }
  return model ? (
    <GaugeCard title={title} model={model} card={card} weekly={weekly} nowMs={nowMs} nav={nav} />
  ) : (
    <IdleSessionCard nav={nav} />
  );
}

/** A closed cycle as recorded: its dates, what was left at its last reading, and its curve. */
function PastCard({
  title,
  card,
  windowMinutes,
  endMs,
  weekly,
  nav,
}: {
  title: string;
  card: QuotaCard;
  windowMinutes: number;
  endMs: number;
  weekly: boolean;
  nav: ReactNode;
}) {
  const startMs = endMs - windowMinutes * 60_000;
  // Never empty: a cycle without samples is not offered.
  const samples = readSeries(card.harness, windowMinutes, startMs);
  const last = samples[samples.length - 1];
  const model = pastGauge(windowMinutes, endMs, last);
  // A weekly range shows both dates; a session shows its day once, twice if it ran past midnight.
  const sameDay = new Date(startMs).toDateString() === new Date(endMs).toDateString();
  const range = weekly
    ? `${formatAxis(startMs, true)} → ${formatAxis(endMs, true)}`
    : `${formatDay(startMs)} → ${sameDay ? formatClock(endMs, false) : formatDay(endMs)}`;
  const text = t().views;
  return (
    <div className="gauge-card past">
      <div className="row small muted">
        <span className="win-title">
          <span className="caps">{title}</span>
          {nav}
        </span>
        <span>{range}</span>
      </div>
      <div className="gauge-main">
        <span className="gauge-value">{percent(model.remaining.toFixed(0))}</span>
        <span className="muted">{text.remainingAtLast}</span>
      </div>
      <QuotaChart
        harness={card.harness}
        model={model}
        observedAt={last.t}
        color={agentColor(card.harness)}
        weekly={weekly}
        past
      />
    </div>
  );
}

function GaugeCard({
  title,
  model,
  card,
  weekly,
  nowMs,
  nav,
}: {
  title: string;
  model: GaugeModel;
  card: QuotaCard;
  weekly: boolean;
  nowMs: number;
  nav: ReactNode;
}) {
  const ahead = model.pace >= 0;
  const color = agentColor(card.harness);
  // Counted from now, not from the reading: an old reading must not show a frozen countdown.
  const ended = cycleEnded(model, nowMs);
  const text = t().views;
  return (
    <div className={`gauge-card${weekly && model.minutesToEmpty !== null ? " danger" : ""}${ended ? " ended" : ""}`}>
      <div className="row small muted">
        <span className="win-title">
          <span className="caps">{title}</span>
          {nav}
        </span>
        {ended ? (
          <span className="late">{text.cycleEnded}</span>
        ) : (
          <span>{text.resetIn(formatDuration((model.endMs - nowMs) / 60_000))}</span>
        )}
      </div>
      <div className="gauge-main">
        <span className="gauge-value">{percent(model.remaining.toFixed(0))}</span>
        <span className="muted">{text.remaining}</span>
        {/* Right after a reset, nothing used and almost no time elapsed: a lead of a few tenths says nothing. */}
        {(model.remaining < 100 || model.pace >= 1) && (
          <span className={ahead ? "pace ok" : "pace bad"}>
            {ahead ? "+" : "−"}
            {text.pace(formatNumber(Math.abs(model.pace), 1), ahead)}
          </span>
        )}
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
function IdleSessionCard({ nav }: { nav: ReactNode }) {
  const text = t().views;
  return (
    <div className="gauge-card idle">
      <div className="row small muted">
        <span className="win-title">
          <span className="caps">{text.session}</span>
          {nav}
        </span>
        <span>{text.noSession}</span>
      </div>
      <div className="gauge-main">
        <span className="gauge-value">100%</span>
        <span className="muted">{text.remaining}</span>
      </div>
      <IdleChart note={text.startsOnFirst} />
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
  const text = t().views;
  return (
    <section className="card">
      <header className="card-head">
        <h2>
          <QuotaIcon harness={card.harness} />
          {t().app.quotaTitle(agentLabel(card.harness))}
        </h2>
        {resetCredits ? (
          <InfoTooltip text={text.resetsTitle}>
            <span className="chip">{text.resetsInStock(resetCredits)}</span>
          </InfoTooltip>
        ) : null}
        <InfoTooltip text={text.measured(state.fresh, new Date(card.observedAt).toLocaleString(locale()))}>
          <span className={`fresh small ${state.fresh ? "ok" : "late"}`}>
            <i className="dot" />
            {card.sources.join(" · ")} · {state.label}
          </span>
        </InfoTooltip>
      </header>
      {emptyAt !== null && (
        <div className="banner">
          <strong>{text.limitReached(formatDay(emptyAt))}</strong>{" "}
          {spend.perDay
            ? text.stayUnder(decimal(spend.percent), formatDay(weekly.endMs))
            : text.leftToLast(whole(spend.percent), formatDay(weekly.endMs))}
        </div>
      )}
      <div className="gauge-grid">
        <WindowCard title={text.session} model={card.session} card={card} weekly={false} nowMs={nowMs} />
        <WindowCard title={text.weekly} model={weekly} card={card} weekly nowMs={nowMs} />
      </div>
      <p className="muted small hint">{card.harness === "codex" ? text.codexHistory : text.claudeHistory}</p>
    </section>
  );
}

/** A percentage without decimals, or with one, in the interface's number format. */
const whole = (value: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(value);
const decimal = (value: number) =>
  new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);

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
  const text = t().views;
  // The figures come from the last scan, which can outlive the quota by half an hour: without a
  // quota on screen they are hidden too, so every environment shows the same block.
  const reason = offReason ?? (card ? undefined : text.quotaWaiting);
  if (reason) {
    // Without quotas the plan is not shown either, even when a local file still names one.
    return (
      <section className="card">
        <header className="card-head">
          <h2>
            <TitleIcon kind="subscription" />
            {text.subscription}
          </h2>
          <span className="chip">
            {agentLabel(harness)} · {text.planNotRead}
          </span>
        </header>
        <p className="muted small hint-top">{reason}</p>
      </section>
    );
  }
  return (
    <section className="card">
      <header className="card-head">
        <h2>
          <TitleIcon kind="subscription" />
          {text.subscription}
        </h2>
        <span className="chip">
          {agentLabel(harness)} · {known ? sub?.plan : text.planUnknown}
          {sub?.pricePerMonth != null && ` · ${formatUsd(sub.pricePerMonth)}${text.perMonth}`}
        </span>
      </header>
      {!known && harness === "claude" && <p className="muted small hint-top">{text.claudePlanUnknown}</p>}
      {estimate && (
        <div className="stats">
          <Stat
            title={text.value}
            value={estimate.valueMultiple != null ? `${decimal(estimate.valueMultiple)}×` : "n/a"}
            hint={text.valueHint}
          />
          <Stat title={text.monthlyValue} value={formatUsd(estimate.monthlyValue)} hint={text.monthlyValueHint} />
          <Stat
            title={text.projected}
            value={percent(whole(estimate.projectedUsePercent))}
            hint={text.projectedHint}
          />
          <Stat
            title={text.advisedPace}
            value={
              spend === null
                ? "n/a"
                : spend.perDay
                  ? text.perDay(decimal(spend.percent))
                  : percent(whole(spend.percent))
            }
            hint={
              spend !== null && card && !spend.perDay
                ? text.untilReset(formatDuration(card.weekly.minutesToReset))
                : text.toLast
            }
          />
        </div>
      )}
      {scoped.length > 0 && (
        <div className="scoped">
          {scoped.map((window) => (
            <div key={window.name}>
              <div className="row small">
                <span>{text.scopedWeekly(window.name)}</span>
                <span>{text.percentLeft(Math.max(0, 100 - window.usedPercent).toFixed(0))}</span>
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
          {text.extraCredits(
            formatUsd(extra.extraUsedUSD ?? 0),
            extra.extraLimitUSD != null ? formatUsd(extra.extraLimitUSD) : undefined,
          )}
        </p>
      )}
      <p className="muted small hint-top">{text.apiNote}</p>
    </section>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="stack">{children}</div>;
}
