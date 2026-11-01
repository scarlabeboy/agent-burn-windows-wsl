import { archiveRead, archiveWrite, type BackfillSeries } from "./api";
import { consistentSamples, currentUsed, type Sample } from "./quotaFilter";
import type { QuotaReading, QuotaWindow, UsageReport } from "./types";

export type { Sample };

interface QuotaStore {
  version: 1;
  series: Record<string, Sample[]>;
  /** Per source: when its logs were last scanned for limit history. */
  backfilled: Record<string, number>;
}

interface CachedReport {
  report: UsageReport;
  loadedAt: number;
}

interface ReportStore {
  version: 1;
  sources: Record<string, CachedReport>;
}

const LEGACY_KEY = "abf.quotaHistory";
const KEEP_MS = 400 * 24 * 3600_000;
const MIN_GAP_MS = 10 * 60_000;
const SAVE_DELAY_MS = 2000;

let quota: QuotaStore = { version: 1, series: {}, backfilled: {} };
let reports: ReportStore = { version: 1, sources: {} };
let version = 0;
const listeners = new Set<() => void>();
const timers: Partial<Record<"quota-history" | "report-cache", ReturnType<typeof setTimeout>>> = {};

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getVersion = () => version;
const changed = () => {
  version += 1;
  listeners.forEach((listener) => listener());
};

function save(name: "quota-history" | "report-cache") {
  clearTimeout(timers[name]);
  timers[name] = setTimeout(() => {
    void archiveWrite(name, name === "quota-history" ? quota : reports).catch(() => {
      // The in-memory copy stays valid; the next change retries the write.
    });
  }, SAVE_DELAY_MS);
}

/** Write pending changes now, for when the window is closing. */
export function flush() {
  for (const name of ["quota-history", "report-cache"] as const) {
    if (timers[name] === undefined) continue;
    clearTimeout(timers[name]);
    timers[name] = undefined;
    void archiveWrite(name, name === "quota-history" ? quota : reports).catch(() => undefined);
  }
}

function mergeSamples(existing: Sample[], added: Sample[]): Sample[] {
  const byTime = new Map<number, Sample>();
  for (const sample of [...existing, ...added]) byTime.set(sample.t, sample);
  const merged = [...byTime.values()].sort((a, b) => a.t - b.t);
  // Collapse runs of identical values, keeping the first and the last of each run.
  return merged.filter(
    (sample, index) =>
      index === 0 ||
      index === merged.length - 1 ||
      sample.used !== merged[index - 1].used ||
      sample.used !== merged[index + 1].used,
  );
}

function migrateLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const legacy = JSON.parse(raw) as Record<string, Sample[]>;
    for (const [key, samples] of Object.entries(legacy)) {
      quota.series[key] = mergeSamples(quota.series[key] ?? [], samples);
    }
    localStorage.removeItem(LEGACY_KEY);
    save("quota-history");
  } catch {
    // Old browser-storage history is optional.
  }
}

/** Load saved quota history and report cache; missing or unreadable data just means a fresh start. */
export async function loadArchive(): Promise<void> {
  const [savedQuota, savedReports] = await Promise.all([
    archiveRead<QuotaStore>("quota-history").catch(() => null),
    archiveRead<ReportStore>("report-cache").catch(() => null),
  ]);
  if (savedQuota?.series) {
    quota = { version: 1, series: savedQuota.series, backfilled: savedQuota.backfilled ?? {} };
  }
  if (savedReports?.sources) reports = savedReports;
  migrateLegacy();
  changed();
}

export const cachedReports = (): Record<string, CachedReport> => reports.sources;

export function cacheReport(sourceId: string, report: UsageReport, loadedAt: number) {
  reports.sources[sourceId] = { report, loadedAt };
  save("report-cache");
}

const endMinuteOf = (windowMinutes: number, startMs: number) =>
  Math.round((startMs + windowMinutes * 60_000) / 60_000);

const keyOf = (harness: string, windowMinutes: number, endMinute: number) =>
  `${harness}|${windowMinutes}|${endMinute}`;

/**
 * The series of one window cycle. Sources round the reset time differently, so an end minute
 * off by one still belongs to the same cycle: reuse that series instead of starting a new one.
 */
function resolveKey(harness: string, windowMinutes: number, endMinute: number): string {
  return (
    [endMinute, endMinute - 1, endMinute + 1]
      .map((candidate) => keyOf(harness, windowMinutes, candidate))
      .find((candidate) => quota.series[candidate]) ?? keyOf(harness, windowMinutes, endMinute)
  );
}

/** The samples of one cycle for a chart, without the provider's over-counts (see quotaFilter). */
export function readSeries(harness: string, windowMinutes: number, startMs: number): Sample[] {
  const raw = quota.series[resolveKey(harness, windowMinutes, endMinuteOf(windowMinutes, startMs))] ?? [];
  return consistentSamples(raw, windowMinutes);
}

/**
 * Keep one point per change, and a heartbeat every few minutes. The reading is stored as
 * measured; the one returned is what to show: an over-count that nothing has confirmed yet is
 * replaced by the last plausible usage.
 */
export function recordReading(reading: QuotaReading): QuotaReading {
  const now = reading.observedAt;
  for (const key of Object.keys(quota.series)) {
    if (Number(key.split("|")[2]) * 60_000 < now - KEEP_MS) delete quota.series[key];
  }
  const windows = [reading.window, reading.sessionWindow].filter(
    (window): window is NonNullable<typeof window> => window !== undefined,
  );
  let dirty = false;
  const shown = new Map<QuotaWindow, QuotaWindow>();
  for (const window of windows) {
    const start = now - (window.elapsedPercent / 100) * window.windowMinutes * 60_000;
    const end = endMinuteOf(window.windowMinutes, start);
    const key = resolveKey(reading.agent, window.windowMinutes, end);
    const samples = quota.series[key] ?? [];
    const last = samples[samples.length - 1];
    if (!last || last.used !== window.usedPercent || now - last.t >= MIN_GAP_MS) {
      quota.series[key] = [...samples, { t: now, used: window.usedPercent }];
      dirty = true;
    }
    const held = currentUsed(quota.series[key] ?? [], window.windowMinutes);
    if (held !== undefined && held !== window.usedPercent) {
      shown.set(window, { ...window, usedPercent: held });
    }
  }
  if (dirty) {
    save("quota-history");
    changed();
  }
  return {
    ...reading,
    window: shown.get(reading.window) ?? reading.window,
    sessionWindow: reading.sessionWindow && (shown.get(reading.sessionWindow) ?? reading.sessionWindow),
  };
}

export const backfilledAt = (sourceId: string): number | undefined => quota.backfilled[sourceId];

/** Add limit history rebuilt from a source's logs, and remember when that source was scanned. */
export function mergeBackfill(
  harness: string,
  sourceId: string,
  series: BackfillSeries[],
  scannedAt: number,
) {
  for (const entry of series) {
    const key = resolveKey(harness, entry.windowMinutes, entry.endMinute);
    const added = entry.samples.map(([t, used]) => ({ t, used }));
    quota.series[key] = mergeSamples(quota.series[key] ?? [], added);
  }
  quota.backfilled[sourceId] = scannedAt;
  save("quota-history");
  changed();
}
