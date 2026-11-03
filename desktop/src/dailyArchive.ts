import { inRange, type DateRange } from "./periods";
import type { AgentReport, DailyPoint, UsageReport } from "./types";

/** Tokens and cost of one day of one harness, as last reported. */
export interface ArchivedDay {
  tokens: number;
  cost: number;
}

/** Per harness, per day (`YYYY-MM-DD`): the days of one source ever seen in a full scan. */
export type DayStore = Record<string, Record<string, ArchivedDay>>;

/**
 * Keep every day a full scan reports. The scan is the truth for the days it contains, so they
 * replace what was stored (today keeps growing); days it no longer contains, because a harness
 * purged its old logs, stay as they were. Melvynx's macOS app follows the same rule.
 */
export function recordDays(store: DayStore, report: UsageReport): DayStore {
  const next: DayStore = { ...store };
  for (const agent of report.agents) {
    const days = { ...next[agent.agent] };
    for (const point of agent.daily) days[point.date] = { tokens: point.tokens, cost: point.cost };
    next[agent.agent] = days;
  }
  return next;
}

const emptyAgent = (agent: string): AgentReport => ({
  agent,
  daily: [],
  models: [],
  tokenBreakdown: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  totalCost: 0,
  totalTokens: 0,
});

const byDate = (a: DailyPoint, b: DailyPoint) => a.date.localeCompare(b.date);

/**
 * Add the archived days a report does not contain (inside the range, if any) to its daily series
 * and totals. A harness turned off stays out. Those days have no per-model or token-type detail:
 * `archivedDays` counts them so the page can say so.
 */
export function withArchive(
  report: UsageReport,
  store: DayStore,
  disabled: string[],
  range?: DateRange,
): UsageReport {
  const agents = report.agents.map((agent) => ({ ...agent, daily: [...agent.daily] }));
  const overall = new Map(report.daily.map((point) => [point.date, { ...point }]));
  let added = 0;
  let addedCost = 0;
  let addedTokens = 0;
  for (const [name, days] of Object.entries(store)) {
    if (disabled.includes(name)) continue;
    let agent = agents.find((entry) => entry.agent === name);
    const known = new Set(agent?.daily.map((point) => point.date));
    const missing = Object.entries(days).filter(
      ([date]) => !known.has(date) && (!range || inRange(date, range)),
    );
    if (missing.length === 0) continue;
    if (!agent) {
      agent = emptyAgent(name);
      agents.push(agent);
    }
    for (const [date, day] of missing) {
      agent.daily.push({ date, tokens: day.tokens, cost: day.cost });
      agent.totalCost += day.cost;
      agent.totalTokens += day.tokens;
      const total = overall.get(date) ?? { date, tokens: 0, cost: 0 };
      total.tokens += day.tokens;
      total.cost += day.cost;
      overall.set(date, total);
      addedCost += day.cost;
      addedTokens += day.tokens;
      added += 1;
    }
    agent.daily.sort(byDate);
    agent.archivedDays = (agent.archivedDays ?? 0) + missing.length;
  }
  if (added === 0) return report;
  agents.sort((a, b) => b.totalCost - a.totalCost || b.totalTokens - a.totalTokens);
  return {
    ...report,
    agents,
    daily: [...overall.values()].sort(byDate),
    totals: {
      totalCost: report.totals.totalCost + addedCost,
      totalTokens: report.totals.totalTokens + addedTokens,
    },
    archivedDays: (report.archivedDays ?? 0) + added,
  };
}

/**
 * Whether a source has anything to show: a harness in its report or a day in its archive, the
 * harnesses turned off left out. A source whose logs were all purged still has its archived days.
 */
export function hasUsage(report: UsageReport, store: DayStore, disabled: string[]): boolean {
  const on = (name: string) => !disabled.includes(name);
  return (
    report.agents.some((agent) => on(agent.agent)) ||
    Object.entries(store).some(([name, days]) => on(name) && Object.keys(days).length > 0)
  );
}
