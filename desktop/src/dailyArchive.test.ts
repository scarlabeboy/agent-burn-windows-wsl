/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { recordDays, withArchive } from "./dailyArchive";
import type { AgentReport, UsageReport } from "./types";

const agent = (name: string, daily: [string, number, number][]): AgentReport => ({
  agent: name,
  daily: daily.map(([date, tokens, cost]) => ({ date, tokens, cost })),
  models: [],
  tokenBreakdown: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  totalCost: daily.reduce((sum, [, , cost]) => sum + cost, 0),
  totalTokens: daily.reduce((sum, [, tokens]) => sum + tokens, 0),
});

const report = (agents: AgentReport[]): UsageReport => {
  const byDate = new Map<string, { date: string; tokens: number; cost: number }>();
  for (const point of agents.flatMap((entry) => entry.daily)) {
    const total = byDate.get(point.date) ?? { date: point.date, tokens: 0, cost: 0 };
    total.tokens += point.tokens;
    total.cost += point.cost;
    byDate.set(point.date, total);
  }
  return {
    agents,
    daily: [...byDate.values()],
    models: [],
    totals: {
      totalCost: agents.reduce((sum, entry) => sum + entry.totalCost, 0),
      totalTokens: agents.reduce((sum, entry) => sum + entry.totalTokens, 0),
    },
  };
};

test("a full scan replaces the days it contains and keeps the others", () => {
  let store = recordDays({}, report([agent("claude", [["2026-09-01", 100, 1], ["2026-09-02", 200, 2]])]));
  // Later the oldest log is purged and today's day has grown.
  store = recordDays(store, report([agent("claude", [["2026-09-02", 250, 2.5]])]));
  assert.deepEqual(store.claude, {
    "2026-09-01": { tokens: 100, cost: 1 },
    "2026-09-02": { tokens: 250, cost: 2.5 },
  });
});

test("purged days come back in the daily series and the totals, and are counted", () => {
  const store = {
    claude: { "2026-09-01": { tokens: 100, cost: 1 }, "2026-09-02": { tokens: 250, cost: 2.5 } },
    codex: { "2026-08-31": { tokens: 50, cost: 0.5 } },
  };
  const current = report([agent("claude", [["2026-09-02", 250, 2.5]])]);
  const merged = withArchive(current, store, []);
  assert.equal(merged.totals.totalCost, 4);
  assert.equal(merged.totals.totalTokens, 400);
  assert.equal(merged.archivedDays, 2);
  assert.deepEqual(merged.daily.map((point) => point.date), ["2026-08-31", "2026-09-01", "2026-09-02"]);
  // A harness whose logs are all gone is listed again from the archive.
  assert.deepEqual(merged.agents.map((entry) => [entry.agent, entry.totalCost]), [["claude", 3.5], ["codex", 0.5]]);
});

test("a turned-off harness and days outside the period stay out", () => {
  const store = {
    claude: { "2026-09-01": { tokens: 100, cost: 1 }, "2026-10-01": { tokens: 10, cost: 0.1 } },
    codex: { "2026-09-01": { tokens: 50, cost: 0.5 } },
  };
  const merged = withArchive(report([]), store, ["codex"], { since: "2026-09-15" });
  assert.deepEqual(merged.agents.map((entry) => entry.agent), ["claude"]);
  assert.equal(merged.totals.totalCost, 0.1);
  const unchanged = report([agent("claude", [["2026-09-01", 100, 1]])]);
  assert.equal(withArchive(unchanged, { claude: { "2026-09-01": { tokens: 100, cost: 1 } } }, []), unchanged);
});
