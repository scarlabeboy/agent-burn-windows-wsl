import { useEffect, useRef, useState } from "react";
import { backfillCodex, loadLimitUsage } from "./api";
import { backfilledAt, mergeBackfill } from "./archive";
import type { LimitUsageDay } from "./limitUsage";
import type { Detected, SourceId } from "./types";

/** The weekly Codex limit per day changes slowly: read again after this long. */
const LIMIT_USAGE_TTL_MS = 5 * 60_000;

/**
 * Rebuild Codex limit history from each source's logs: 30 days the first time, then only
 * what changed since the last scan. It starts after the first usage scan has had a head start.
 */
export function useCodexBackfill({
  archiveReady,
  readableIds,
  disabled,
  disabledKey,
  detected,
}: {
  archiveReady: boolean;
  readableIds: SourceId[];
  disabled: string[];
  disabledKey: string;
  detected: Detected | null;
}) {
  useEffect(() => {
    if (!archiveReady) return;
    let cancelled = false;
    if (disabled.includes("codex")) return;
    void (async () => {
      await new Promise((resolve) => setTimeout(resolve, 8000));
      for (const id of readableIds) {
        if (cancelled) return;
        const scannedAt = Date.now();
        const last = backfilledAt(id);
        const since = last ? last - 24 * 3600_000 : scannedAt - 30 * 24 * 3600_000;
        try {
          const series = await backfillCodex(id === "windows" ? null : id.slice(4), since);
          if (!cancelled) mergeBackfill("codex", id, series, scannedAt);
        } catch {
          // A source without Codex logs has no history to rebuild.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detected, archiveReady, readableIds, disabledKey]);
}

/**
 * The weekly Codex limit per day belongs to the account, so any source that can read it gives
 * the whole picture: the open tab shows the freshest answer among its own sources.
 */
export function useCodexLimitUsage({
  page,
  quotasOn,
  archiveReady,
  disabled,
  disabledKey,
  activeIds,
  activeKey,
  readableIds,
  readableKey,
  lastScan,
}: {
  page: string;
  quotasOn: boolean;
  archiveReady: boolean;
  disabled: string[];
  disabledKey: string;
  activeIds: string[];
  activeKey: string;
  readableIds: SourceId[];
  readableKey: string;
  lastScan: number;
}): { limitBest?: { id: string; days: LimitUsageDay[]; at: number }; limitAttempted: boolean } {
  const [limitUsage, setLimitUsage] = useState<Record<string, { days: LimitUsageDay[]; at: number }>>({});
  const limitUsageRef = useRef(limitUsage);
  limitUsageRef.current = limitUsage;
  useEffect(() => {
    if (page !== "codex" || !quotasOn || !archiveReady || disabled.includes("codex")) return;
    for (const id of activeIds) {
      if (!readableIds.includes(id as SourceId)) continue;
      const known = limitUsageRef.current[id];
      if (known && Date.now() - known.at < LIMIT_USAGE_TTL_MS) continue;
      loadLimitUsage(id === "windows" ? null : id.slice(4))
        .catch(() => [] as LimitUsageDay[])
        .then((days) => setLimitUsage((current) => ({ ...current, [id]: { days, at: Date.now() } })));
    }
  }, [page, activeKey, readableKey, quotasOn, archiveReady, lastScan, disabledKey]);
  const limitEntries = activeIds.flatMap((id) => (limitUsage[id] ? [{ id, ...limitUsage[id] }] : []));
  const limitBest = limitEntries.filter((entry) => entry.days.length > 0).sort((a, b) => b.at - a.at)[0];
  const limitAttempted = limitEntries.length > 0;
  return { limitBest, limitAttempted };
}
