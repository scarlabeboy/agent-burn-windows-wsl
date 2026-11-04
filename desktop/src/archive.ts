import { archiveRead, archiveWrite, type BackfillSeries } from "./api";
import { recordDays, type DayStore } from "./dailyArchive";
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

/** Per source: every day of every harness seen in a full scan (see dailyArchive). Kept forever. */
interface DailyStore {
  version: 1;
  sources: Record<string, DayStore>;
}

type StoreName = "quota-history" | "report-cache" | "daily-metrics";

const LEGACY_KEY = "abf.quotaHistory";
const KEEP_MS = 400 * 24 * 3600_000;
const MIN_GAP_MS = 10 * 60_000;
const SAVE_DELAY_MS = 2000;

let quota: QuotaStore = { version: 1, series: {}, backfilled: {} };
let reports: ReportStore = { version: 1, sources: {} };
let daily: DailyStore = { version: 1, sources: {} };
let version = 0;
const listeners = new Set<() => void>();
const timers: Partial<Record<StoreName, ReturnType<typeof setTimeout>>> = {};
const writes: Partial<Record<StoreName, Promise<void>>> = {};
/**
 * Archives that may be saved: only once loaded, so a save never replaces a file that has not
 * been read yet, or one that exists but could not be loaded. That one stays as it is for this
 * run, and the page works from memory: saving over it would lose its days for good.
 */
const writable = new Set<StoreName>();
const contentOf = (name: StoreName) =>
  name === "quota-history" ? quota : name === "report-cache" ? reports : daily;

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

function queueWrite(name: StoreName): Promise<void> {
  const write = (writes[name] ?? Promise.resolve())
    .then(() => archiveWrite(name, contentOf(name)))
    .catch(() => {
      // The in-memory copy stays valid; the next change retries the write.
    });
  writes[name] = write;
  return write;
}

function save(name: StoreName) {
  if (!writable.has(name)) return;
  clearTimeout(timers[name]);
  timers[name] = setTimeout(() => {
    timers[name] = undefined;
    void queueWrite(name);
  }, SAVE_DELAY_MS);
}

/** Write pending changes now and wait for queued and ongoing saves. */
export async function flush(): Promise<void> {
  for (const name of ["quota-history", "report-cache", "daily-metrics"] as const) {
    if (timers[name] === undefined) continue;
    clearTimeout(timers[name]);
    timers[name] = undefined;
    void queueWrite(name);
  }
  await Promise.all(Object.values(writes));
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

const isObject = (value: unknown) => typeof value === "object" && value !== null;

/**
 * One saved archive. Nothing saved yet is a fresh start and the archive becomes writable; a
 * file that cannot be read, or that holds something else than expected, keeps it read-only.
 */
async function loadStore<T>(name: StoreName, valid: (value: T) => boolean): Promise<T | null> {
  try {
    const value = await archiveRead<T>(name);
    if (value === null || valid(value)) {
      writable.add(name);
      return value;
    }
  } catch {
    // Read-only for this run, see `writable`.
  }
  return null;
}

/** Load saved quota history, report cache and daily metrics, so the app opens with data. */
export async function loadArchive(): Promise<void> {
  const [savedQuota, savedReports, savedDaily] = await Promise.all([
    loadStore<QuotaStore>("quota-history", (value) => isObject(value?.series)),
    loadStore<ReportStore>("report-cache", (value) => isObject(value?.sources)),
    loadStore<DailyStore>("daily-metrics", (value) => isObject(value?.sources)),
  ]);
  if (savedQuota) {
    quota = { version: 1, series: savedQuota.series, backfilled: savedQuota.backfilled ?? {} };
  }
  if (savedReports) reports = savedReports;
  if (savedDaily) daily = savedDaily;
  // First run with the daily archive: the last saved reports seed it, so no day already seen
  // is lost even if a harness purges it before the next scan.
  for (const [sourceId, cached] of Object.entries(reports.sources)) {
    if (!daily.sources[sourceId]) recordDaily(sourceId, cached.report);
  }
  migrateLegacy();
  changed();
}

export const cachedReports = (): Record<string, CachedReport> => reports.sources;

/**
 * Keep the last report of a source. Its days go to the daily archive only when it was read
 * online: offline, models without a built-in price cost $0, and those days would replace the
 * real figures of days that may be purged before the next online scan.
 */
export function cacheReport(sourceId: string, report: UsageReport, loadedAt: number, online: boolean) {
  reports.sources[sourceId] = { report, loadedAt };
  save("report-cache");
  if (online) recordDaily(sourceId, report);
}

/** Store the days of a full scan of one source (a period scan must never be recorded here). */
function recordDaily(sourceId: string, report: UsageReport) {
  daily.sources[sourceId] = recordDays(daily.sources[sourceId] ?? {}, report);
  save("daily-metrics");
}

/** The archived days of one source, to add back what its harnesses no longer report. */
export const archivedDays = (sourceId: string): DayStore => daily.sources[sourceId] ?? {};

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
    // Only a newer reading is recorded, as Melvynx does: an older one arriving late (a cached
    // answer served after a forced refresh) would otherwise make the real latest value look
    // like an over-count. A cached answer served again has the same time and is not recorded
    // twice; what to show is still worked out below.
    const newer = !last || now > last.t;
    if (newer && (!last || last.used !== window.usedPercent || now - last.t >= MIN_GAP_MS)) {
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
