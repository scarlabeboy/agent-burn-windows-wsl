import { CLI_FAILED } from "./api";
import { locale, t } from "./i18n";
import type { QuotaReading, QuotaWindow, TrayWindow } from "./types";

const MINUTE_MS = 60_000;

export interface GaugeModel {
  window: QuotaWindow;
  remaining: number;
  /** Elapsed share of the window minus used share: positive means under the even pace. */
  pace: number;
  minutesToReset: number;
  /** Minutes until the quota runs out at the current rate, when that is before the reset. */
  minutesToEmpty: number | null;
  startMs: number;
  endMs: number;
}

export interface QuotaCard {
  harness: string;
  sources: string[];
  observedAt: number;
  session?: GaugeModel;
  /** The long window: a week on paid plans, a month on Codex Free (see `isMonthly`). */
  weekly: GaugeModel;
  /**
   * A plan with a single monthly quota and no 5-hour session (Codex Free): no session card is
   * shown. A paid plan whose session has not started keeps its card.
   */
  sessionless: boolean;
}

/** Windows this long or longer are monthly ones (Codex Free: 30 days); shorter long ones are weekly. */
const MONTHLY_MIN_MINUTES = 14 * 1440;
export const isMonthly = (windowMinutes: number): boolean => windowMinutes >= MONTHLY_MIN_MINUTES;

export function gauge(window: QuotaWindow, observedAt: number): GaugeModel {
  const used = window.usedPercent;
  const elapsed = window.elapsedPercent;
  const windowMs = window.windowMinutes * MINUTE_MS;
  const startMs = observedAt - (elapsed / 100) * windowMs;
  const minutesToReset = window.windowMinutes * (1 - elapsed / 100);
  const elapsedMinutes = window.windowMinutes * (elapsed / 100);
  const untilEmpty =
    used > 0 && elapsed > 0 ? elapsedMinutes * (100 / used) - elapsedMinutes : null;
  return {
    window,
    remaining: Math.max(0, 100 - used),
    pace: elapsed - used,
    minutesToReset,
    minutesToEmpty: untilEmpty !== null && untilEmpty < minutesToReset ? untilEmpty : null,
    startMs,
    endMs: startMs + windowMs,
  };
}

/** A closed cycle as its last recorded sample left it, to chart it again. */
export function pastGauge(windowMinutes: number, endMs: number, last: { t: number; used: number }): GaugeModel {
  const windowMs = windowMinutes * MINUTE_MS;
  const elapsedPercent = (100 * (last.t - (endMs - windowMs))) / windowMs;
  return gauge({ windowMinutes, usedPercent: last.used, elapsedPercent }, last.t);
}

/** The length of the session window of both harnesses, for a session that has not started. */
export const SESSION_MINUTES = 300;

/**
 * A session window nobody has used: Codex reports one even without a session, untouched and
 * resetting a full window from now, a reset that moves with every reading. A session that
 * started a moment ago and has used nothing yet looks the same, and is just as empty.
 */
export const idleSession = (window: QuotaWindow): boolean =>
  window.usedPercent === 0 && window.elapsedPercent < 1;

/**
 * One card per harness. Readings with the same figures from different sources come from
 * the same account, so they collapse into a single card that lists every source.
 */
export function quotaCards(readings: { source: string; reading: QuotaReading }[]): QuotaCard[] {
  const cards = new Map<string, QuotaCard>();
  for (const { source, reading } of readings) {
    const key = [
      reading.agent,
      reading.window.usedPercent,
      reading.window.windowMinutes,
      reading.sessionWindow?.usedPercent ?? "-",
    ].join("|");
    const existing = cards.get(key);
    if (existing) {
      existing.sources.push(source);
      existing.observedAt = Math.max(existing.observedAt, reading.observedAt);
    } else {
      cards.set(key, {
        harness: reading.agent,
        sources: [source],
        observedAt: reading.observedAt,
        session:
          reading.sessionWindow && !idleSession(reading.sessionWindow)
            ? gauge(reading.sessionWindow, reading.observedAt)
            : undefined,
        weekly: gauge(reading.window, reading.observedAt),
        sessionless: !reading.sessionWindow && isMonthly(reading.window.windowMinutes),
      });
    }
  }
  return [...cards.values()].sort((a, b) => a.harness.localeCompare(b.harness));
}

/**
 * The remaining percentage the notification-area icon shows for the cards of one harness (two
 * accounts give two cards: the one with less left counts), or null for the logo: nothing read,
 * or all of it left. An idle session has all of it left, and so does a window whose cycle has
 * ended, reset since its reading.
 */
export function trayPercent(cards: QuotaCard[], window: TrayWindow, nowMs: number): number | null {
  const values = cards.map((card) => {
    const session = leftOf(card.session, nowMs);
    const weekly = leftOf(card.weekly, nowMs);
    if (window === "session") return session;
    if (window === "weekly") return weekly;
    return Math.min(session, weekly);
  });
  if (values.length === 0) return null;
  const shown = Math.round(Math.min(...values));
  return shown >= 100 ? null : shown;
}

/** What is left of a window for the icon: all of it for a session not under way or a cycle over. */
const leftOf = (model: GaugeModel | undefined, nowMs: number): number =>
  !model || cycleEnded(model, nowMs) ? 100 : model.remaining;

/** The icon's colour for what is left. */
export const trayTone = (remaining: number): "ok" | "warn" | "danger" =>
  remaining <= 20 ? "danger" : remaining <= 50 ? "warn" : "ok";

/**
 * The cause to give for a quota that could not be read in these sources, when the app knows it
 * (agent-burn.exe missing, a time limit, WSL that could not be listed). A failure of the CLI
 * itself has none to give: the page then names the usual ones, a sign-in or the service.
 */
export function quotaFailure(errors: (string | undefined)[]): string | undefined {
  return errors.find((error) => error !== undefined && !error.includes(CLI_FAILED));
}

/** A reading this recent counts as live: quotas are read every minute, with some margin. */
export const FRESH_MS = 90_000;

export interface Freshness {
  /** Read within the last minute and a half. */
  fresh: boolean;
  /** When the figures were measured, as a clock time; a stale reading also says how long ago. */
  label: string;
}

/** How long ago, in words: seconds are not worth a number. */
export function formatAge(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE_MS);
  if (minutes < 1) return t().time.underMinute;
  if (minutes < 60) return t().time.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t().time.hours(hours);
  return t().time.days(Math.floor(hours / 24));
}

export function freshness(observedAt: number, nowMs: number): Freshness {
  const age = Math.max(0, nowMs - observedAt);
  // The day is only worth showing when the reading is not from today.
  const clock = formatClock(observedAt, age > 12 * 60 * MINUTE_MS);
  return age <= FRESH_MS
    ? { fresh: true, label: clock }
    : { fresh: false, label: t().time.ago(clock, formatAge(age)) };
}

/** The cycle a reading belongs to is over: its figures describe a window that has closed. */
export const cycleEnded = (model: GaugeModel, nowMs: number): boolean => nowMs >= model.endMs;

export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return t().time.durationDays(days, hours);
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, "0")}m`;
  return `${mins}m`;
}

export interface Budget {
  /** Percentage per day while a day or more is left; otherwise the whole remainder. */
  percent: number;
  perDay: boolean;
}

/**
 * What can still be spent to last until the reset. A daily rate only makes sense while a day
 * or more is left: 52 % for the last 1 h 30 would read as an absurd 830 %/day.
 */
export function budget(model: GaugeModel): Budget {
  const days = model.minutesToReset / 1440;
  return days >= 1
    ? { percent: model.remaining / days, perDay: true }
    : { percent: model.remaining, perDay: false };
}

export interface Forecast {
  /** Remaining percentage expected at the reset when the current rate continues. */
  remainingAtReset: number;
  /** Instant the quota hits zero, when that happens before the reset. */
  emptyAtMs: number | null;
}

export function forecast(model: GaugeModel): Forecast | null {
  const { usedPercent, elapsedPercent } = model.window;
  if (elapsedPercent < 1 || usedPercent <= 0) {
    return { remainingAtReset: model.remaining, emptyAtMs: null };
  }
  const projectedUsed = (usedPercent / elapsedPercent) * 100;
  const remainingAtReset = Math.max(0, 100 - projectedUsed);
  const emptyAtMs =
    projectedUsed > 100
      ? model.startMs + (100 / projectedUsed) * (model.endMs - model.startMs)
      : null;
  return { remainingAtReset, emptyAtMs };
}

export const formatClock = (ms: number, withDay: boolean): string =>
  new Intl.DateTimeFormat(locale(), {
    ...(withDay ? { weekday: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(ms);

/** Chart axis ends: the time, with the date on a weekly window whose two ends share a weekday. */
export const formatAxis = (ms: number, weekly: boolean): string =>
  new Intl.DateTimeFormat(locale(), {
    ...(weekly ? { weekday: "short", day: "2-digit", month: "2-digit" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(ms);

export const formatDay = (ms: number): string =>
  new Intl.DateTimeFormat(locale(), { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(
    ms,
  );
