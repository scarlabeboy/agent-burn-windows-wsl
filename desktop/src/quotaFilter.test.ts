/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { consistentSamples, currentUsed, type Sample } from "./quotaFilter";

const WEEK = 10_080;
const SESSION = 300;

/** Samples from `[seconds, used]` pairs, oldest first. */
const series = (points: [number, number][]): Sample[] =>
  points.map(([seconds, used]) => ({ t: seconds * 1000, used }));
const used = (samples: Sample[]) => samples.map((sample) => sample.used);

// The cases below are those of Agent Burn's macOS tests (QuotaHistoryTests.swift).

test("an over-count contradicted by a later, lower reading is dropped", () => {
  const samples = series([
    [0, 40],
    [600, 42],
    [1200, 85],
    [1800, 87],
    [2400, 43],
    [3000, 88],
    [3600, 44],
  ]);
  assert.deepEqual(used(consistentSamples(samples, WEEK)), [40, 42, 43, 44]);
});

test("an unconfirmed weekly spike is held back, then accepted after half an hour", () => {
  const spiky = series([
    [0, 50],
    [60, 100],
    [120, 50],
    [180, 100],
  ]);
  assert.deepEqual(used(consistentSamples(spiky, WEEK)), [50, 50]);
  assert.equal(currentUsed(spiky, WEEK), 50);

  // Forty minutes later the reading is still 100: nothing contradicts it any more.
  const confirmed = [...spiky, ...series([[2400, 100]])];
  assert.deepEqual(used(consistentSamples(confirmed, WEEK)), [50, 50, 100, 100]);
  assert.equal(currentUsed(confirmed, WEEK), 100);
});

test("fast growth of a 5-hour session is shown as it is", () => {
  const session = series([
    [0, 10],
    [60, 30],
  ]);
  assert.deepEqual(used(consistentSamples(session, SESSION)), [10, 30]);
  assert.equal(currentUsed(session, SESSION), 30);
});

test("steady growth and a one-point wobble are left alone", () => {
  const steady = series([
    [0, 10],
    [600, 11],
    [1200, 12],
  ]);
  assert.deepEqual(used(consistentSamples(steady, WEEK)), [10, 11, 12]);
  const wobble = series([
    [0, 50],
    [60, 51],
    [120, 50],
  ]);
  assert.deepEqual(used(consistentSamples(wobble, WEEK)), [50, 51, 50]);
});

test("no samples means nothing to show", () => {
  assert.deepEqual(consistentSamples([], WEEK), []);
  assert.equal(currentUsed([], WEEK), undefined);
});

test("a single reading is shown, however high", () => {
  const single = series([[0, 90]]);
  assert.deepEqual(used(consistentSamples(single, WEEK)), [90]);
  assert.equal(currentUsed(single, WEEK), 90);
});

test("a weekly jump that cannot be real is held back, however the clock runs", () => {
  // 10 % to 30 % of a week in twenty minutes: not credible, so not shown until confirmed. The
  // step to 20 % stays within what real use can do (10 points over half as much again).
  const jump = series([
    [0, 10],
    [600, 20],
    [1200, 30],
  ]);
  assert.deepEqual(used(consistentSamples(jump, WEEK)), [10, 20]);
  assert.equal(currentUsed(jump, WEEK), 20);
});

test("real use near 0 is shown, a large jump still held back", () => {
  // 1 % to 7 % within half an hour: heavy use, not an over-count.
  const busy = series([
    [0, 1],
    [600, 7],
  ]);
  assert.deepEqual(used(consistentSamples(busy, WEEK)), [1, 7]);
  assert.equal(currentUsed(busy, WEEK), 7);
  // 1 % to 12 %: past 1.5 × 1 + 10, held back until confirmed.
  const jump = series([
    [0, 1],
    [600, 12],
  ]);
  assert.equal(currentUsed(jump, WEEK), 1);
  // The case the macOS app saw: 99 % served while 49 % was enforced.
  const served = series([
    [0, 49],
    [600, 99],
  ]);
  assert.equal(currentUsed(served, WEEK), 49);
});

test("the stored samples are not modified", () => {
  const samples = series([
    [0, 50],
    [60, 100],
    [120, 50],
  ]);
  const before = JSON.stringify(samples);
  consistentSamples(samples, WEEK);
  currentUsed(samples, WEEK);
  assert.equal(JSON.stringify(samples), before);
});
