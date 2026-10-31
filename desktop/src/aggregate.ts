import type {
  AgentReport,
  DailyPoint,
  ModelRow,
  TokenBreakdown,
  UsageReport,
} from "./types";

const emptyBreakdown = (): TokenBreakdown => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
});

function addBreakdown(into: TokenBreakdown, from: TokenBreakdown) {
  into.input += from.input;
  into.output += from.output;
  into.cacheRead += from.cacheRead;
  into.cacheWrite += from.cacheWrite;
}

function mergeDaily(lists: DailyPoint[][]): DailyPoint[] {
  const byDate = new Map<string, DailyPoint>();
  for (const point of lists.flat()) {
    const current = byDate.get(point.date) ?? { date: point.date, tokens: 0, cost: 0 };
    current.tokens += point.tokens;
    current.cost += point.cost;
    byDate.set(point.date, current);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function mergeModels(lists: ModelRow[][], totalCost: number): ModelRow[] {
  const byModel = new Map<string, ModelRow>();
  for (const row of lists.flat()) {
    const current =
      byModel.get(row.model) ?? { model: row.model, percentage: 0, totalCost: 0, totalTokens: 0 };
    current.totalCost += row.totalCost;
    current.totalTokens += row.totalTokens;
    byModel.set(row.model, current);
  }
  const totalTokens = [...byModel.values()].reduce((sum, row) => sum + row.totalTokens, 0);
  return [...byModel.values()]
    .map((row) => ({
      ...row,
      percentage:
        totalCost > 0
          ? (row.totalCost / totalCost) * 100
          : totalTokens > 0
            ? (row.totalTokens / totalTokens) * 100
            : 0,
    }))
    .sort((a, b) => b.totalCost - a.totalCost || b.totalTokens - a.totalTokens);
}

/**
 * Sum distinct sources (Windows, each WSL distro) into one Computer report.
 * Sources read separate data directories, so addition does not double count.
 */
export function mergeReports(reports: UsageReport[]): UsageReport {
  const byAgent = new Map<string, AgentReport[]>();
  for (const report of reports) {
    for (const agent of report.agents) {
      byAgent.set(agent.agent, [...(byAgent.get(agent.agent) ?? []), agent]);
    }
  }
  const agents: AgentReport[] = [...byAgent.entries()].map(([agent, parts]) => {
    const tokenBreakdown = emptyBreakdown();
    parts.forEach((part) => addBreakdown(tokenBreakdown, part.tokenBreakdown));
    const totalCost = parts.reduce((sum, part) => sum + part.totalCost, 0);
    return {
      agent,
      daily: mergeDaily(parts.map((part) => part.daily)),
      models: mergeModels(parts.map((part) => part.models), totalCost),
      tokenBreakdown,
      totalCost,
      totalTokens: parts.reduce((sum, part) => sum + part.totalTokens, 0),
    };
  });
  agents.sort((a, b) => b.totalCost - a.totalCost || b.totalTokens - a.totalTokens);
  const totalCost = agents.reduce((sum, agent) => sum + agent.totalCost, 0);
  const totalTokens = agents.reduce((sum, agent) => sum + agent.totalTokens, 0);
  return {
    agents,
    daily: mergeDaily(reports.map((report) => report.daily)),
    models: mergeModels(reports.map((report) => report.models), totalCost),
    totals: { totalCost, totalTokens },
  };
}

export const formatTokens = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(Math.round(value));
};

export const formatUsd = (value: number): string =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD" }).format(value);

export const tokensPerDollar = (tokens: number, cost: number): string =>
  cost > 0 ? `${formatTokens(tokens / cost)} / $` : "n/a";
