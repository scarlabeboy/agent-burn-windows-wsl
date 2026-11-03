/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { budget, formatAxis, FRESH_MS, freshness, gauge, idleSession, quotaFailure } from "./quota";

test("a weekly axis dates both ends, which share a weekday; a 5-hour axis shows the time only", () => {
  const start = new Date(2026, 10, 1, 20, 0).getTime();
  const end = new Date(2026, 10, 8, 20, 0).getTime();
  assert.notEqual(formatAxis(start, true), formatAxis(end, true));
  assert.match(formatAxis(start, true), /01\/11/);
  assert.equal(formatAxis(start, false), "20:00");
});

const clock = (ms: number) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(ms);

test("a recent reading shows only the time it was measured", () => {
  const observed = new Date(2026, 10, 1, 13, 19).getTime();
  const state = freshness(observed, observed + 20_000);
  assert.equal(state.fresh, true);
  assert.equal(state.label, clock(observed));
});

test("a stale reading says how long ago it was measured", () => {
  const observed = new Date(2026, 10, 1, 13, 19).getTime();
  const state = freshness(observed, observed + FRESH_MS + 4 * 60_000);
  assert.equal(state.fresh, false);
  assert.equal(state.label, `${clock(observed)} · il y a 5 min`);
});

const WEEK = 7 * 1440;
const weekly = (usedPercent: number, minutesToReset: number) =>
  gauge(
    { usedPercent, windowMinutes: WEEK, elapsedPercent: 100 * (1 - minutesToReset / WEEK) } as never,
    Date.now(),
  );

test("with days left, the budget is a daily rate", () => {
  const spend = budget(weekly(48, 2 * 1440));
  assert.equal(spend.perDay, true);
  assert.equal(spend.percent, 26);
});

test("an untouched session window that resets a full window from now is idle", () => {
  const window = (usedPercent: number, elapsedPercent: number) =>
    ({ usedPercent, windowMinutes: 300, elapsedPercent }) as never;
  assert.equal(idleSession(window(0, 0)), true);
  assert.equal(idleSession(window(1, 0.5)), false, "something was used");
  assert.equal(idleSession(window(0, 3)), false, "the window is running");
});

test("under a day before the reset, the budget is the whole remainder", () => {
  const spend = budget(weekly(48, 90));
  assert.equal(spend.perDay, false);
  assert.equal(spend.percent, 52);
});

test("a quota read failure names its cause only when the app knows it", () => {
  // The CLI ran and found no quota: no sign-in, or no answer. The page names both.
  assert.equal(quotaFailure([undefined, "agent-burn exited with exit code: 1"]), undefined);
  assert.equal(quotaFailure(["agent-burn exited with exit code: 1", "agent-burn timed out"]), "agent-burn timed out");
  assert.match(quotaFailure(["cli-missing: agent-burn.exe is missing from the app folder."]) ?? "", /^cli-missing/);
  assert.equal(quotaFailure([]), undefined);
});
