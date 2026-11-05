/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { withAccountSpend, type Reading } from "./subscription";
import type { SubscriptionAgent, UsageReport } from "./types";

/** A Codex subscription read by one source: 40 % of the weekly quota used after 3 days. */
const codex = (spent: number, elapsedMinutes = 4320, label = "weekly"): SubscriptionAgent => {
  const fullQuotaValue = spent / 0.4;
  const monthlyValue = fullQuotaValue * (30.4375 / 7);
  return {
    agent: "codex",
    plan: "Plus",
    pricePerMonth: 20,
    liveLimits: true,
    periodUsage: spent,
    window: { label, usedPercent: 40, elapsedMinutes, apiEquivalentSpent: spent },
    resetCreditsAvailable: null,
    estimate: { fullQuotaValue, monthlyValue, projectedUsePercent: 93.3, valueMultiple: monthlyValue / 20 },
  };
};

const NOW = Date.UTC(2026, 10, 5, 12);

/** One source's report, read `minutesAgo` minutes before now. */
const read = (agent: SubscriptionAgent, minutesAgo = 0): Reading => ({
  report: {
    agents: [],
    daily: [],
    models: [],
    totals: { totalCost: 0, totalTokens: 0 },
    subscription: { agents: [agent] },
  } satisfies UsageReport,
  at: NOW - minutesAgo * 60_000,
});

const near = (actual: number | null | undefined, expected: number) =>
  assert.ok(actual != null && Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

test("the quota value counts the spend of both environments", () => {
  const windows = codex(30);
  const wsl = codex(10, 4325);
  const sub = withAccountSpend(windows, [read(windows), read(wsl)]);
  near(sub?.estimate?.fullQuotaValue, 100);
  near(sub?.estimate?.monthlyValue, 100 * (30.4375 / 7));
  near(sub?.estimate?.valueMultiple, (100 * (30.4375 / 7)) / 20);
  near(sub?.estimate?.projectedUsePercent, 93.3);
  assert.equal(sub?.plan, "Plus");
});

test("a source that spent nothing this week still gets the other's spend", () => {
  const windows = codex(0);
  const wsl = codex(40);
  near(withAccountSpend(windows, [read(windows), read(wsl)])?.estimate?.fullQuotaValue, 100);
});

test("a source read in another window is left out", () => {
  const windows = codex(30);
  const beforeReset = codex(500, 9000);
  const daily = codex(500, 4320, "daily");
  near(withAccountSpend(windows, [read(windows), read(beforeReset), read(daily)])?.estimate?.fullQuotaValue, 75);
});

test("one source alone keeps the CLI's figures", () => {
  const windows = codex(30);
  assert.deepEqual(withAccountSpend(windows, [read(windows)]), windows);
});

test("a WSL distribution stopped hours ago still counts while its window runs", () => {
  const windows = codex(30);
  // Read 3 hours ago, 3 hours into the same week.
  const stopped = read(codex(10, 4320 - 180), 180);
  near(withAccountSpend(windows, [read(windows), stopped])?.estimate?.fullQuotaValue, 100);
});

test("a stopped distribution read before the reset is left out", () => {
  const windows = codex(30, 60);
  // Read 2 hours ago, near the end of the previous week.
  const stopped = read(codex(10, 10_000), 120);
  near(withAccountSpend(windows, [read(windows), stopped])?.estimate?.fullQuotaValue, 75);
});

test("every source shows the value of the latest reading, even an old report", () => {
  const windows = codex(30);
  // Read 9 hours ago, when the account had used 4 % of the week.
  const old = codex(5, 4320 - 540);
  old.window = { ...old.window!, usedPercent: 4 };
  old.estimate = { ...old.estimate!, fullQuotaValue: 5 / 0.04, monthlyValue: (5 / 0.04) * (30.4375 / 7) };
  const readings = [read(windows), read(old, 540)];
  near(withAccountSpend(old, readings)?.estimate?.fullQuotaValue, 35 / 0.4);
  near(withAccountSpend(windows, readings)?.estimate?.fullQuotaValue, 35 / 0.4);
});
