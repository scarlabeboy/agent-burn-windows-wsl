import type { QuotaReading, QuotaWindow } from "./types";

export interface GaugeModel {
  label: string;
  remaining: number;
  /** Elapsed share of the window minus used share: positive means under the even pace. */
  pace: number;
  minutesToReset: number;
  /** Minutes until the quota runs out at the current rate, when that is before the reset. */
  minutesToEmpty: number | null;
}

export interface QuotaCard {
  harness: string;
  sources: string[];
  observedAt: number;
  gauges: GaugeModel[];
}

export function gauge(label: string, window: QuotaWindow): GaugeModel {
  const used = window.usedPercent;
  const elapsed = window.elapsedPercent;
  const minutesToReset = window.windowMinutes * (1 - elapsed / 100);
  const elapsedMinutes = window.windowMinutes * (elapsed / 100);
  const minutesToEmpty =
    used > 0 && elapsed > 0 ? elapsedMinutes * (100 / used) - elapsedMinutes : null;
  return {
    label,
    remaining: Math.max(0, 100 - used),
    pace: elapsed - used,
    minutesToReset,
    minutesToEmpty:
      minutesToEmpty !== null && minutesToEmpty < minutesToReset ? minutesToEmpty : null,
  };
}

function gaugesOf(reading: QuotaReading): GaugeModel[] {
  return [
    ...(reading.sessionWindow ? [gauge("Session 5 h", reading.sessionWindow)] : []),
    gauge("Hebdomadaire", reading.window),
  ];
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
        gauges: gaugesOf(reading),
      });
    }
  }
  return [...cards.values()].sort((a, b) => a.harness.localeCompare(b.harness));
}

export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return `${days}j ${hours}h`;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, "0")}m`;
  return `${mins}m`;
}
