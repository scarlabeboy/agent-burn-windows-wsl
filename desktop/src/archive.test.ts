/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { readSeries, recordReading } from "./archive";
import type { QuotaReading } from "./types";

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
