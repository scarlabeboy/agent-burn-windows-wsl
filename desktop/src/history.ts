import type { QuotaReading } from "./types";

export interface Sample {
  t: number;
  used: number;
}

const KEY = "abf.quotaHistory";
const KEEP_MS = 8 * 24 * 3600_000;
const MIN_GAP_MS = 5 * 60_000;
const MAX_SAMPLES = 600;

type Store = Record<string, Sample[]>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // History is a convenience: without storage the charts just start from now.
  }
}

/** A window cycle is identified by its harness, length and end minute. */
export function seriesKey(
  harness: string,
  windowMinutes: number,
  startMs: number,
): string {
  const endMinute = Math.round((startMs + windowMinutes * 60_000) / 60_000);
  return `${harness}|${windowMinutes}|${endMinute}`;
}

export function readSeries(key: string): Sample[] {
  return read()[key] ?? [];
}

/** Keep one point per change, and a heartbeat every few minutes. */
export function recordReading(reading: QuotaReading) {
  const store = read();
  const now = reading.observedAt;
  for (const key of Object.keys(store)) {
    const end = Number(key.split("|")[2]) * 60_000;
    if (end < now - KEEP_MS) delete store[key];
  }
  const windows = [reading.window, reading.sessionWindow].filter(
    (window): window is NonNullable<typeof window> => window !== undefined,
  );
  for (const window of windows) {
    const start = now - (window.elapsedPercent / 100) * window.windowMinutes * 60_000;
    const key = seriesKey(reading.agent, window.windowMinutes, start);
    const samples = store[key] ?? [];
    const last = samples[samples.length - 1];
    if (!last || last.used !== window.usedPercent || now - last.t >= MIN_GAP_MS) {
      samples.push({ t: now, used: window.usedPercent });
    }
    store[key] = samples.slice(-MAX_SAMPLES);
  }
  write(store);
}
