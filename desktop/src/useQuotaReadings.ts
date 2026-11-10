import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { loadQuota } from "./api";
import { recordReading } from "./archive";
import { QUOTA_HARNESSES, type Detected, type QuotaReading, type SourceId } from "./types";

/** How long a quota stays on screen after a failed read, so missed reads do not blank it. */
const QUOTA_GRACE_MS = 5 * 60_000;
/** A weekly window ending within this of the last one is the same cycle (as in the archive). */
const SAME_CYCLE_MS = 2 * 60_000;
/** A weekly usage drop this large within one cycle is a change of plan or account. */
const DROP_POINTS = 5;

/**
 * The quota readings of each source and harness, read every minute while quotas are on, and
 * the last failure of each. A change in a quota's windows asks for a usage scan.
 */
export function useQuotaReadings({
  readableIds,
  disabled,
  disabledKey,
  quotasOn,
  archiveReady,
  detected,
  refreshRef,
  rawHarnesses,
}: {
  readableIds: SourceId[];
  disabled: string[];
  disabledKey: string;
  quotasOn: boolean;
  archiveReady: boolean;
  detected: Detected | null;
  refreshRef: MutableRefObject<(queue?: boolean) => void>;
  /** Harnesses whose readings show as measured: Claude Code with several accounts declared. */
  rawHarnesses: string[];
}): {
  quotas: Record<string, Record<string, QuotaReading>>;
  quotaErrors: Record<string, string>;
  refreshQuotas: (force: boolean) => void;
} {
  const [quotas, setQuotas] = useState<Record<string, Record<string, QuotaReading>>>({});
  // One quota read at a time per source and harness: a read can wait minutes on a frozen WSL,
  // and the next ones must not pile up behind it.
  const quotaReads = useRef(new Set<string>());
  // The last failure of each source and harness, kept until a reading succeeds.
  const [quotaErrors, setQuotaErrors] = useState<Record<string, string>>({});
  // The shape of each source and harness's windows (lengths, session or not). A change means the
  // plan changed (Codex Free taken back to Plus): the plan and price come from the next usage scan.
  // Read at each reading, so turning the setting on or off needs no new timer.
  const rawRef = useRef(rawHarnesses);
  rawRef.current = rawHarnesses;
  const quotaShapes = useRef(new Map<string, { shape: string; at: number }>());
  // When each source and harness's reads started failing. A quota back after longer than the
  // grace period (a lapsed plan, a new sign-in) was scanned without it: value and projection
  // come from a new scan, as for a change of shape.
  const failingSince = useRef(new Map<string, number>());
  // The last weekly reading of each source and harness. Usage never falls within one cycle, so a
  // drop of several points without a reset means a larger plan with the same windows (Plus to
  // Pro 200) or another account: the plan and value come from a new scan.
  const lastWeekly = useRef(new Map<string, { used: number; endMs: number; at: number }>());
  const refreshQuotas = useCallback(
    (force: boolean) => {
      // A reading recorded before the archive loads would be replaced by it, whatever asked for
      // it (the timer, the tray menu, Ctrl+Shift+R): the timer reads as soon as it has loaded.
      if (!archiveReady) return;
      for (const id of readableIds) {
        const name = id === "windows" ? null : id.slice(4);
        for (const harness of QUOTA_HARNESSES.filter((entry) => !disabled.includes(entry))) {
          const key = `${id}|${harness}`;
          if (quotaReads.current.has(key)) continue;
          quotaReads.current.add(key);
          loadQuota(harness, name, force)
            .then((reading) => {
              // Stored as measured; what is shown has an unconfirmed over-count held back.
              const shown = recordReading(reading, rawRef.current.includes(reading.agent));
              // A reading older than the last one (a slow read) says nothing about the plan now.
              const shape = `${reading.window.windowMinutes}|${reading.sessionWindow?.windowMinutes ?? "-"}`;
              const known = quotaShapes.current.get(key);
              if (!known || reading.observedAt >= known.at) {
                quotaShapes.current.set(key, { shape, at: reading.observedAt });
                if (known && known.shape !== shape) refreshRef.current(true);
              }
              const { usedPercent, elapsedPercent, windowMinutes } = reading.window;
              const endMs = reading.observedAt + (1 - elapsedPercent / 100) * windowMinutes * 60_000;
              const weekly = lastWeekly.current.get(key);
              if (!weekly || reading.observedAt >= weekly.at) {
                lastWeekly.current.set(key, { used: usedPercent, endMs, at: reading.observedAt });
                const sameCycle = weekly !== undefined && Math.abs(weekly.endMs - endMs) <= SAME_CYCLE_MS;
                if (sameCycle && weekly.used - usedPercent >= DROP_POINTS) refreshRef.current(true);
              }
              const since = failingSince.current.get(key);
              failingSince.current.delete(key);
              if (since !== undefined && Date.now() - since >= QUOTA_GRACE_MS) refreshRef.current(true);
              setQuotaErrors(({ [key]: _cleared, ...rest }) => rest);
              setQuotas((current) => {
                // A reading older than the one shown arrived late: it is not the latest state.
                const previous = current[id]?.[harness];
                if (previous && previous.observedAt > reading.observedAt) return current;
                return { ...current, [id]: { ...current[id], [harness]: shown } };
              });
            })
            // A source without a sign-in for this harness simply has no quota to show. A reading
            // from the last five minutes stays through missed reads: in WSL without a sign-in,
            // the quota comes from Claude Code's own cache, which the CLI takes only while fresh.
            .catch((error) => {
              if (!failingSince.current.has(key)) failingSince.current.set(key, Date.now());
              setQuotaErrors((current) => ({ ...current, [key]: String(error) }));
              setQuotas((current) => {
                const previous = current[id]?.[harness];
                if (previous && Date.now() - previous.observedAt < QUOTA_GRACE_MS) return current;
                const { [harness]: _removed, ...rest } = current[id] ?? {};
                return { ...current, [id]: rest };
              });
            })
            .finally(() => quotaReads.current.delete(key));
        }
      }
    },
    [readableIds, disabledKey, archiveReady],
  );

  // Quotas off, or offline: no read at all; the readings already shown stay with their time.
  // Readings wait for the archive: one recorded before it loads would be replaced by it.
  useEffect(() => {
    if (!quotasOn || !archiveReady) return;
    refreshQuotas(false);
    const timer = setInterval(() => refreshQuotas(false), 60_000);
    return () => clearInterval(timer);
  }, [detected, refreshQuotas, quotasOn, archiveReady]);

  return { quotas, quotaErrors, refreshQuotas };
}
