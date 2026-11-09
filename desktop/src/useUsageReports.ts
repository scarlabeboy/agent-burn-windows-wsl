import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { loadUsage } from "./api";
import { cacheReport, cachedReports, flush, loadArchive } from "./archive";
import { quotasActive } from "./settingsHints";
import { loadedAtOf, reportOf } from "./sourceState";
import type { Detected, ModelPricing, Settings, SourceId, SourceState } from "./types";

/** Each source's Claude plan is read from its own sign-in file; there is no manual choice. */
export const CLAUDE_PLAN = "auto";

/**
 * The report of each source: the archive and the last reports load first, then full scans, one
 * at a time, at launch, when the sources change and on the automatic interval.
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
} {
  const [states, setStates] = useState<Record<string, SourceState>>({});
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

  const scanning = useRef(false);
  const rescan = useRef(false);
  const refreshRef = useRef<(queue?: boolean) => void>(() => undefined);
  const refresh = useCallback((queue = false) => {
    // One scan at a time: a slow WSL read must never overlap the next automatic one.
    // A change of sources (WSL started) waits for the running scan instead of being lost.
    if (scanning.current) {
      if (queue) rescan.current = true;
      return;
    }
    scanning.current = true;
    const scans = readableIds.map((id) => {
      setStates((current) => ({
        ...current,
        [id]: { status: "loading", previous: reportOf(current[id]), previousAt: loadedAtOf(current[id]) },
      }));
      return loadUsage(id === "windows" ? null : id.slice(4), settings.offline, quotasActive(settings), CLAUDE_PLAN, {}, agentsToScan)
        .then(({ pricing: nextPricing, ...report }) => {
          // Keep reference rates only in memory; the last Windows or WSL read wins.
          if (nextPricing) setPricing((current) => ({ ...current, ...nextPricing }));
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
        );
    });
    void Promise.all(scans).finally(() => {
      scanning.current = false;
      if (rescan.current) {
        rescan.current = false;
        refreshRef.current();
      }
    });
  }, [readableIds, settings.offline, settings.quotas, agentsToScan]);
  refreshRef.current = refresh;

  // Windows is scanned as soon as the archive is loaded. A WSL distribution joins the scan
  // once its detection answers: the sources change, which scans again (queued if one runs).
  useEffect(() => {
    if (archiveReady) refresh(true);
  }, [detected, archiveReady, refresh]);

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

  return { states, archiveReady, refresh, refreshRef, nextScan };
}
