import type { QuotaReading, QuotaWindow } from "./types";

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
  weekly: GaugeModel;
}

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
        session: reading.sessionWindow && gauge(reading.sessionWindow, reading.observedAt),
        weekly: gauge(reading.window, reading.observedAt),
      });
    }
  }
  return [...cards.values()].sort((a, b) => a.harness.localeCompare(b.harness));
}

/** A reading this recent counts as live: quotas are read every minute, with some margin. */
export const FRESH_MS = 90_000;

export interface Freshness {
  /** Read within the last minute and a half. */
  fresh: boolean;
  /** "En direct", or how long ago the figures were measured. */
  label: string;
}

/** How long ago, in words: seconds are not worth a number. */
export function formatAge(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE_MS);
  if (minutes < 1) return "moins d'une minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

export function freshness(observedAt: number, nowMs: number): Freshness {
  const age = Math.max(0, nowMs - observedAt);
  return age <= FRESH_MS
    ? { fresh: true, label: "en direct" }
    : { fresh: false, label: `relevé il y a ${formatAge(age)}` };
}

/** The cycle a reading belongs to is over: its figures describe a window that has closed. */
export const cycleEnded = (model: GaugeModel, nowMs: number): boolean => nowMs >= model.endMs;

export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return `${days}j ${hours}h`;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, "0")}m`;
  return `${mins}m`;
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
  new Intl.DateTimeFormat("fr-FR", {
    ...(withDay ? { weekday: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(ms);

export const formatDay = (ms: number): string =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(
    ms,
  );
