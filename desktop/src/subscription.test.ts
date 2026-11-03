/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { withAccountSpend } from "./subscription";
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

const report = (...agents: SubscriptionAgent[]): UsageReport => ({
  agents: [],
  daily: [],
  models: [],
  totals: { totalCost: 0, totalTokens: 0 },
  subscription: { agents },
});

const near = (actual: number | null | undefined, expected: number) =>
  assert.ok(actual != null && Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

test("the quota value counts the spend of both environments", () => {
  const windows = codex(30);
  const wsl = codex(10, 4325);
  const sub = withAccountSpend(windows, [report(windows), report(wsl)]);
  near(sub?.estimate?.fullQuotaValue, 100);
  near(sub?.estimate?.monthlyValue, 100 * (30.4375 / 7));
  near(sub?.estimate?.valueMultiple, (100 * (30.4375 / 7)) / 20);
  near(sub?.estimate?.projectedUsePercent, 93.3);
  assert.equal(sub?.plan, "Plus");
});

test("a source that spent nothing this week still gets the other's spend", () => {
  const windows = codex(0);
  const wsl = codex(40);
  near(withAccountSpend(windows, [report(windows), report(wsl)])?.estimate?.fullQuotaValue, 100);
});

test("a source read in another window is left out", () => {
  const windows = codex(30);
  const beforeReset = codex(500, 9000);
  const daily = codex(500, 4320, "daily");
  near(withAccountSpend(windows, [report(windows), report(beforeReset), report(daily)])?.estimate?.fullQuotaValue, 75);
});

test("one source alone keeps the CLI's figures", () => {
  const windows = codex(30);
  assert.deepEqual(withAccountSpend(windows, [report(windows)]), windows);
});
