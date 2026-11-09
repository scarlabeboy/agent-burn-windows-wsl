/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  budget,
  formatAxis,
  FRESH_MS,
  freshness,
  gauge,
  idleSession,
  isMonthly,
  quotaCards,
  quotaFailure,
  pastGauge,
  trayPercent,
  trayTone,
  type QuotaCard,
  forecast,
} from "./quota";
import type { QuotaReading } from "./types";

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

const NOW = new Date(2026, 10, 6, 12, 0).getTime();
const trayCard = (weeklyUsed: number, sessionUsed?: number): QuotaCard => ({
  harness: "claude",
  sources: ["Windows"],
  observedAt: NOW,
  weekly: gauge({ usedPercent: weeklyUsed, windowMinutes: WEEK, elapsedPercent: 50 }, NOW),
  session:
    sessionUsed === undefined
      ? undefined
      : gauge({ usedPercent: sessionUsed, windowMinutes: 300, elapsedPercent: 50 }, NOW),
  sessionless: false,
});

test("only a monthly quota without a session hides the session card", () => {
  const reading = (windowMinutes: number, session: boolean): QuotaReading => ({
    agent: "codex",
    observedAt: NOW,
    window: { usedPercent: 7, elapsedPercent: 2, windowMinutes },
    ...(session ? { sessionWindow: { usedPercent: 0, elapsedPercent: 0, windowMinutes: 300 } } : {}),
  });
  const sessionless = (windowMinutes: number, session: boolean) =>
    quotaCards([{ source: "Windows", reading: reading(windowMinutes, session) }])[0].sessionless;
  assert.equal(sessionless(43_200, false), true, "Codex Free: one monthly quota");
  assert.equal(sessionless(WEEK, true), false, "a paid plan with an idle session keeps its card");
  assert.equal(sessionless(WEEK, false), false, "a paid plan read without a session keeps its card");
  assert.equal(isMonthly(43_200), true);
  assert.equal(isMonthly(WEEK), false);
});

test("a plan without a session (Claude Ultra) hides its card only when no session is read", () => {
  const reading = (session: boolean): QuotaReading => ({
    agent: "claude",
    observedAt: NOW,
    window: { usedPercent: 7, elapsedPercent: 20, windowMinutes: WEEK },
    ...(session ? { sessionWindow: { usedPercent: 12, elapsedPercent: 30, windowMinutes: 300 } } : {}),
  });
  const sessionless = (session: boolean, noSession: boolean) =>
    quotaCards([{ source: "Windows", reading: reading(session), noSession }])[0].sessionless;
  assert.equal(sessionless(false, true), true, "Ultra on a verified account");
  assert.equal(sessionless(true, true), false, "Ultra not verified yet keeps its session");
  assert.equal(sessionless(false, false), false, "Pro before the first message keeps its card");
});

test("the limit is not projected right after a reset", () => {
  const week = (usedPercent: number, elapsedPercent: number) =>
    gauge({ usedPercent, elapsedPercent, windowMinutes: WEEK }, NOW);
  // 4 % used an hour and a half into the week would announce the limit for Wednesday.
  assert.equal(week(4, 0.9).minutesToEmpty, null);
  // Nor any line to the reset: it would say nothing more will be used.
  assert.equal(forecast(week(4, 0.9)), null);
  assert.notEqual(forecast(week(30, 15)), null);
  // A tenth of the quota used, or a tenth of the week gone, and the pace counts.
  assert.notEqual(week(12, 2).minutesToEmpty, null);
  assert.notEqual(week(30, 15).minutesToEmpty, null);
  assert.equal(week(5, 15).minutesToEmpty, null, "on pace for 33 %");
});

test("the tray icon shows the chosen quota, or the tighter of the two", () => {
  const card = trayCard(30, 80);
  assert.equal(trayPercent([card], "weekly", NOW), 70);
  assert.equal(trayPercent([card], "session", NOW), 20);
  assert.equal(trayPercent([card], "tightest", NOW), 20);
  assert.equal(trayPercent([trayCard(90, 10)], "tightest", NOW), 10);
});

test("the tray icon shows the logo when nothing is read or all of it is left", () => {
  assert.equal(trayPercent([], "tightest", NOW), null);
  assert.equal(trayPercent([trayCard(0)], "weekly", NOW), null);
  // An idle session has all of it left, whatever the weekly quota says.
  assert.equal(trayPercent([trayCard(60)], "session", NOW), null);
  assert.equal(trayPercent([trayCard(60)], "tightest", NOW), 40);
  // Under half a point used rounds to the full quota, as the cards show it.
  assert.equal(trayPercent([trayCard(0.4)], "weekly", NOW), null);
});

test("a session whose cycle has ended counts as reset", () => {
  const card = trayCard(30, 80);
  assert.equal(trayPercent([card], "session", NOW + 3 * 60 * 60_000), null);
  assert.equal(trayPercent([card], "tightest", NOW + 3 * 60 * 60_000), 70);
});

test("with two accounts, the one with less left counts", () => {
  assert.equal(trayPercent([trayCard(30), trayCard(55)], "weekly", NOW), 45);
});

test("the tray colour follows what is left", () => {
  assert.equal(trayTone(80), "ok");
  assert.equal(trayTone(50), "warn");
  assert.equal(trayTone(21), "warn");
  assert.equal(trayTone(20), "danger");
});

test("a closed cycle is charted from its own start to its own end, as its last reading left it", () => {
  const end = NOW;
  const model = pastGauge(300, end, { t: end - 60 * 60_000, used: 35 });
  assert.equal(Math.round(model.startMs), end - 300 * 60_000);
  assert.equal(Math.round(model.endMs), end);
  assert.equal(model.remaining, 65);
});
