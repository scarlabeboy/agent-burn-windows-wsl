/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { archivedDays, cacheReport, readSeries, recordReading } from "./archive";
import type { QuotaReading, UsageReport } from "./types";

const WEEK = 10_080;
const WEEK_MS = WEEK * 60_000;
const START = Date.UTC(2026, 9, 26, 19, 59);

/** A weekly reading of the cycle that starts at `START`, measured `minutes` into it. */
const weekly = (minutes: number, used: number): QuotaReading => {
  const observedAt = START + minutes * 60_000;
  return {
    agent: "claude",
    observedAt,
    window: { windowMinutes: WEEK, usedPercent: used, elapsedPercent: ((observedAt - START) / WEEK_MS) * 100 },
  };
};

const used = () => readSeries("claude", WEEK, START).map((sample) => sample.used);

test("a reading older than the last one recorded is ignored", () => {
  recordReading(weekly(600, 50));
  // Measured earlier, delivered later (a cached answer after a forced refresh).
  recordReading(weekly(599, 48));
  assert.deepEqual(used(), [50], "the real latest value is not taken for an over-count");

  // The same answer served again is not recorded twice, and still shows its value.
  const again = recordReading(weekly(600, 50));
  assert.equal(again.window.usedPercent, 50);
  assert.deepEqual(used(), [50]);

  recordReading(weekly(620, 52));
  assert.deepEqual(used(), [50, 52]);
});

/** One day of Claude Code at `cost`, as a scan reports it. */
const dayReport = (cost: number): UsageReport => {
  const daily = [{ date: "2026-11-03", tokens: 10, cost }];
  return {
    agents: [
      {
        agent: "claude",
        daily,
        models: [],
        tokenBreakdown: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        totalCost: cost,
        totalTokens: 10,
      },
    ],
    daily,
    models: [],
    totals: { totalCost: cost, totalTokens: 10 },
  };
};

test("an offline scan leaves the daily archive as the last online one left it", () => {
  cacheReport("windows", dayReport(4.2), 1, true);
  // Offline, a model without a built-in price costs $0.
  cacheReport("windows", dayReport(0), 2, false);
  assert.equal(archivedDays("windows").claude["2026-11-03"].cost, 4.2);
});
