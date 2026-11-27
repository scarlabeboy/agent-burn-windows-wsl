import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { loadUsage } from "./api";
import { cacheReport, cachedReports, flush, loadArchive } from "./archive";
import { quotasActive } from "./settingsHints";
import { scanOptions, sourcesToScan } from "./scanPlan";
import { loadedAtOf, reportOf } from "./sourceState";
import type { Detected, ModelPricing, Settings, SourceId, SourceState } from "./types";

/**
 * The report of each source: the archive and the last reports load first, then full scans of each
 * source, at launch, when the sources or options change and on the automatic interval.
 */
export function useUsageReports({
  settings,
  readableIds,
  agentsToScan,
  detected,
  setPricing,
}: {
  settings: Settings;
  readableIds: SourceId[];
  agentsToScan: string[] | undefined;
  detected: Detected | null;
  setPricing: Dispatch<SetStateAction<Record<string, ModelPricing>>>;
}): {
  states: Record<string, SourceState>;
  archiveReady: boolean;
  refresh: (queue?: boolean) => void;
  refreshRef: MutableRefObject<(queue?: boolean) => void>;
  nextScan: number;
  /** The last scan of a source read now had to use the built-in prices. */
  pricingFallback: boolean;
} {
  const [states, setStates] = useState<Record<string, SourceState>>({});
  // Per source, from its last scan only: a later scan that downloads the prices clears it.
  const [fallbacks, setFallbacks] = useState<Record<string, boolean>>({});
  const [archiveReady, setArchiveReady] = useState(false);

  // Saved quota history and the last reports load first, so the app opens with data to show.
  useEffect(() => {
    loadArchive()
      .catch(() => undefined)
      .finally(() => {
        setStates((current) => {
          const next = { ...current };
          for (const [id, cached] of Object.entries(cachedReports())) {
            next[id] ??= { status: "ready", report: cached.report, loadedAt: cached.loadedAt };
          }
          return next;
        });
        setArchiveReady(true);
      });
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  // Each source is scanned on its own: never twice at once, so a slow WSL read never overlaps the
  // next one, but a distribution found after launch starts at once instead of waiting for Windows.
  const scanning = useRef(new Set<string>());
  const queued = useRef(new Set<string>());
  // The options of each source's last scan, to tell a new source or a changed option apart.
  const scannedWith = useRef(new Map<string, string>());
  const options = scanOptions(settings.offline, quotasActive(settings), agentsToScan);

  const scanRef = useRef<(id: SourceId) => void>(() => undefined);
  scanRef.current = (id: SourceId) => {
    scanning.current.add(id);
    scannedWith.current.set(id, options);
    setStates((current) => ({
      ...current,
      [id]: { status: "loading", previous: reportOf(current[id]), previousAt: loadedAtOf(current[id]) },
    }));
    loadUsage(id === "windows" ? null : id.slice(4), settings.offline, quotasActive(settings), {}, agentsToScan)
      .then(({ pricing: nextPricing, pricingFallback, ...report }) => {
        // Keep reference rates only in memory; the last Windows or WSL read wins.
        if (nextPricing) setPricing((current) => ({ ...current, ...nextPricing }));
        setFallbacks((current) => ({ ...current, [id]: pricingFallback === true }));
        const loadedAt = Date.now();
        cacheReport(id, report, loadedAt, !settings.offline);
        setStates((current) => ({ ...current, [id]: { status: "ready", report, loadedAt } }));
      })
      .catch((error) =>
        setStates((current) => ({
          ...current,
          [id]: {
            status: "error",
            message: String(error),
            previous: reportOf(current[id]),
            previousAt: loadedAtOf(current[id]),
          },
        })),
      )
      .finally(() => {
        scanning.current.delete(id);
        // A scan asked for while this one ran starts now, with the options of the moment.
        if (queued.current.delete(id) && readableRef.current.includes(id)) scanRef.current(id);
      });
  };
  const readableRef = useRef(readableIds);
  readableRef.current = readableIds;

  /** `onlyChanged`: only the sources not yet scanned with the current options. */
  const scan = useCallback(
    (queue: boolean, onlyChanged: boolean) => {
      // A source that went away (WSL stopped) is scanned again when it comes back.
      for (const id of scannedWith.current.keys()) if (!readableIds.includes(id as SourceId)) scannedWith.current.delete(id);
      const ids = onlyChanged ? sourcesToScan(readableIds, scannedWith.current, options) : readableIds;
      for (const id of ids) {
        // A change of sources or options waits for that source's running scan instead of being lost.
        if (scanning.current.has(id)) {
          if (queue) queued.current.add(id);
        } else {
          scanRef.current(id);
        }
      }
    },
    [readableIds, options],
  );
  const refresh = useCallback((queue = false) => scan(queue, false), [scan]);
  const refreshRef = useRef<(queue?: boolean) => void>(() => undefined);
  refreshRef.current = refresh;

  // Windows is scanned as soon as the archive is loaded. A WSL distribution joins once its
  // detection answers, and a changed option rescans every source; the others are left alone.
  useEffect(() => {
    if (archiveReady) scan(true, true);
  }, [detected, archiveReady, scan]);

  // Automatic scans. Changing their interval only resets the timer: it does not scan.
  // The time of the next one is kept for the status bar (0: none planned).
  const [nextScan, setNextScan] = useState(0);
  useEffect(() => {
    if (!archiveReady) return;
    if (settings.refreshMinutes <= 0) {
      setNextScan(0);
      return;
    }
    const every = settings.refreshMinutes * 60_000;
    setNextScan(Date.now() + every);
    const timer = setInterval(() => {
      refreshRef.current();
      setNextScan(Date.now() + every);
    }, every);
    return () => clearInterval(timer);
  }, [archiveReady, settings.refreshMinutes]);

  const pricingFallback = !settings.offline && readableIds.some((id) => fallbacks[id]);
  return { states, archiveReady, refresh, refreshRef, nextScan, pricingFallback };
}
