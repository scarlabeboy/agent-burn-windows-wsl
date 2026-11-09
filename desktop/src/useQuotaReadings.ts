import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { loadQuota } from "./api";
import { recordReading } from "./archive";
import { QUOTA_HARNESSES, type Detected, type QuotaReading, type SourceId } from "./types";

/** How long a quota stays on screen after a failed read, so missed reads do not blank it. */
const QUOTA_GRACE_MS = 5 * 60_000;

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
}: {
  readableIds: SourceId[];
  disabled: string[];
  disabledKey: string;
  quotasOn: boolean;
  archiveReady: boolean;
  detected: Detected | null;
  refreshRef: MutableRefObject<(queue?: boolean) => void>;
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
  const quotaShapes = useRef(new Map<string, string>());
  const refreshQuotas = useCallback(
    (force: boolean) => {
      for (const id of readableIds) {
        const name = id === "windows" ? null : id.slice(4);
        for (const harness of QUOTA_HARNESSES.filter((entry) => !disabled.includes(entry))) {
          const key = `${id}|${harness}`;
          if (quotaReads.current.has(key)) continue;
          quotaReads.current.add(key);
          loadQuota(harness, name, force)
            .then((reading) => {
              // Stored as measured; what is shown has an unconfirmed over-count held back.
              const shown = recordReading(reading);
              const shape = `${reading.window.windowMinutes}|${reading.sessionWindow?.windowMinutes ?? "-"}`;
              const known = quotaShapes.current.get(key);
              quotaShapes.current.set(key, shape);
              if (known !== undefined && known !== shape) refreshRef.current(true);
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
    [readableIds, disabledKey],
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
