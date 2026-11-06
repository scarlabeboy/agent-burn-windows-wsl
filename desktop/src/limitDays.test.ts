/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { limitDays } from "./limitDays";

const WEEK_MS = 7 * 24 * 3600_000;
/** Local time, `day` of November 2026. */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();
const cycle = (startMs: number, samples: [number, number][]) => ({
  startMs,
  endMs: startMs + WEEK_MS,
  samples: samples.map(([t, used]) => ({ t, used })),
});

test("each day counts what was used between its own readings", () => {
  const days = limitDays(
    [cycle(at(2, 8), [[at(2, 9), 5], [at(2, 18), 12], [at(3, 9), 12], [at(3, 20), 30]])],
    at(3, 21),
  );
  assert.deepEqual(days, [
    { date: "2026-11-02", measured: 12, approx: 0, read: true },
    { date: "2026-11-03", measured: 18, approx: 0, read: true },
  ]);
});

test("usage while the app was closed counts on the next day read, as approximate", () => {
  const days = limitDays([cycle(at(2, 8), [[at(2, 9), 5], [at(2, 18), 10], [at(4, 10), 25], [at(4, 20), 31]])], at(4, 21));
  assert.deepEqual(days, [
    { date: "2026-11-02", measured: 10, approx: 0, read: true },
    { date: "2026-11-03", measured: 0, approx: 0, read: false },
    { date: "2026-11-04", measured: 6, approx: 15, read: true },
  ]);
});

test("a reset starts again from zero", () => {
  const first = cycle(at(2, 8) - WEEK_MS, [[at(2, 7), 80]]);
  const second = cycle(at(2, 8), [[at(2, 9), 4], [at(2, 12), 9]]);
  const [day] = limitDays([first, second], at(2, 13));
  assert.equal(day.measured, 9);
  assert.equal(day.approx, 0);
});

test("the first reading of all is a starting point, not a day's use", () => {
  // History begins days into the cycle: its 40 % may come from any day before.
  const [day] = limitDays([cycle(at(1, 8), [[at(4, 9), 40], [at(4, 12), 43]])], at(4, 13));
  assert.equal(day.measured, 3);
  assert.equal(day.approx, 0);
});

test("only the last days are kept, and nothing without any reading", () => {
  assert.deepEqual(limitDays([], at(4, 13)), []);
  const days = limitDays([cycle(at(1, 8), [[at(1, 9), 1], [at(5, 9), 9]])], at(5, 10), 3);
  assert.deepEqual(
    days.map((day) => day.date),
    ["2026-11-03", "2026-11-04", "2026-11-05"],
  );
});

test("a reading a point below the cycle's peak, then back to it, adds nothing", () => {
  const [day] = limitDays([cycle(at(2, 8), [[at(2, 9), 10], [at(2, 10), 11], [at(2, 11), 10], [at(2, 12), 11]])], at(2, 13));
  assert.equal(day.measured, 11);
});
