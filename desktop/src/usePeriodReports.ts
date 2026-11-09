import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { mergeReports, withoutHarnesses } from "./aggregate";
import { loadUsage } from "./api";
import { archivedDays } from "./archive";
import { withArchive } from "./dailyArchive";
import { SUBSCRIPTIONS } from "./harnesses";
import { compactDate, filterReport, isoDate, rangeFor, type DateRange, type Period } from "./periods";
import type { QuotaCard } from "./quota";
import { OVERVIEW } from "./Sidebar";
import { loadedAtOf, reportOf } from "./sourceState";
import type { Detected, ModelPricing, SourceState, UsageReport } from "./types";
import { CLAUDE_PLAN } from "./useUsageReports";

/**
 * The reports of the chosen period for the open tab and page. Totals and daily series are
 * filtered locally and are exact; per-model detail comes from a period scan of the CLI, loaded
 * on demand and asked again after each scan of its source.
 */
export function usePeriodReports({
  period,
  page,
  pageCards,
  cards,
  activeIds,
  activeKey,
  readableKey,
  states,
  disabled,
  disabledKey,
  label,
  archiveReady,
  detected,
  lastScan,
  offline,
  agentsToScan,
  setPricing,
}: {
  period: Period;
  page: string;
  pageCards: QuotaCard[];
  cards: QuotaCard[];
  activeIds: string[];
  activeKey: string;
  readableKey: string;
  states: Record<string, SourceState>;
  disabled: string[];
  disabledKey: string;
  label: (id: string) => string;
  archiveReady: boolean;
  detected: Detected | null;
  lastScan: number;
  offline: boolean;
  agentsToScan: string[] | undefined;
  setPricing: Dispatch<SetStateAction<Record<string, ModelPricing>>>;
}) {
  // Per-model detail of a period, with when it was asked for: it is only used while no scan of
  // its source finished after that, or its figures would trail the totals beside them.
  const [details, setDetails] = useState<Record<string, { report: UsageReport; requestedAt: number }>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const detailsRef = useRef(details);
  detailsRef.current = details;
  const statesRef = useRef(states);
  statesRef.current = states;

  // "Since the reset day" needs a weekly quota cycle, so it only applies on Claude and Codex pages.
  const effectivePeriod: Period =
    period === "rtd" && (page === OVERVIEW || pageCards.length === 0) ? "all" : period;
  const resetStartMs = pageCards[0]?.weekly.startMs;
  const today = isoDate(new Date());
  const range = useMemo(
    () => rangeFor(effectivePeriod, new Date(), resetStartMs),
    [effectivePeriod, resetStartMs !== undefined ? isoDate(new Date(resetStartMs)) : undefined, today],
  );
  const rangeSince = range?.since;
  const rangeUntil = range?.until;
  const detailScope = page === OVERVIEW ? "*" : page;
  const detailKey = (id: string) => `${id}|${rangeSince}|${rangeUntil ?? ""}|${detailScope}`;
  const currentDetail = (id: string, key: string) => {
    const detail = detailsRef.current[key];
    return detail && detail.requestedAt >= loadedAtOf(statesRef.current[id]) ? detail.report : undefined;
  };

  const localPartsFor = (range: DateRange | null) =>
    activeKey
      .split(",")
      .filter(Boolean)
      .flatMap((id) => {
        const base = reportOf(states[id]);
        if (!base) return [];
        // Days a harness no longer reports (old logs purged) come back from the daily archive.
        // A harness turned off since this report was read (a stopped WSL keeps it) stays out.
        const current = withoutHarnesses(base, disabled);
        const report = withArchive(range ? filterReport(current, range) : current, archivedDays(id), disabled, range ?? undefined);
        return [{ id, label: label(id), report }];
      });
  const localReportFor = (range: DateRange | null) => {
    const parts = localPartsFor(range);
    return parts.length ? mergeReports(parts.map((part) => part.report)) : undefined;
  };
  const localParts = useMemo(() => localPartsFor(range), [activeKey, states, rangeSince, rangeUntil, disabledKey]);
  const localReport = useMemo(
    () => (localParts.length ? mergeReports(localParts.map((part) => part.report)) : undefined),
    [localParts],
  );

  // Under "Since the reset day" the side bar does not follow the open page: each subscription
  // counts from its own reset day, everything else over the whole period, as on their own pages.
  const resetRtd = period === "rtd";
  const resetStarts = resetRtd
    ? SUBSCRIPTIONS.map((id) => {
        const start = cards.find((card) => card.harness === id)?.weekly.startMs;
        return [id, start] as const;
      })
    : [];
  const resetStartsKey = resetStarts
    .map(([id, start]) => `${id}:${start === undefined ? "" : isoDate(new Date(start))}`)
    .join(",");
  const navReport = useMemo(
    () => (resetRtd ? localReportFor(null) : localReport),
    [resetRtd, localReport, activeKey, states, disabledKey],
  );
  const resetSpend = useMemo(
    () =>
      new Map(
        resetStarts.map(([id, start]) => {
          const since = start === undefined ? navReport : localReportFor(rangeFor("rtd", new Date(), start));
          return [id, since?.agents.find((agent) => agent.agent === id)?.totalCost] as const;
        }),
      ),
    [resetStartsKey, navReport],
  );
  const report = useMemo(() => {
    if (!localReport) return undefined;
    if (!range) return localReport;
    return mergeReports(
      localParts.map((part) => {
        const detail = currentDetail(part.id, detailKey(part.id));
        return detail
          ? withArchive(withoutHarnesses(detail, disabled), archivedDays(part.id), disabled, range)
          : part.report;
      }),
    );
  }, [localReport, localParts, details, states, rangeSince, rangeUntil, detailScope, disabledKey]);
  const detailError = activeKey
    .split(",")
    .map((id) => detailErrors[detailKey(id)])
    .find(Boolean);

  const detailReads = useRef(new Set<string>());
  const [detailRetry, setDetailRetry] = useState(0);
  // The detail waits for a scan to end, failed or not: a failed scan still lets it be asked.
  const scanningKey = activeIds.filter((id) => states[id]?.status === "loading").join(",");
  useEffect(() => {
    if (!rangeSince || !archiveReady) return;
    let cancelled = false;
    void (async () => {
      for (const id of activeKey.split(",").filter((entry) => entry && readableKey.split(",").includes(entry))) {
        if (cancelled) return;
        const key = `${id}|${rangeSince}|${rangeUntil ?? ""}|${detailScope}`;
        // Asked again after each scan of the source, so per-model figures follow the totals.
        if (currentDetail(id, key)) continue;
        // Not while the source is scanned: the end of that scan asks for it again anyway. Nor
        // twice at once: at launch, two scans ending close together used to ask up to four times.
        if (statesRef.current[id]?.status === "loading" || detailReads.current.has(key)) continue;
        detailReads.current.add(key);
        const requestedAt = Date.now();
        try {
          const { pricing: nextPricing, ...detail } = await loadUsage(
            id === "windows" ? null : id.slice(4),
            offline,
            false,
            CLAUDE_PLAN,
            { since: compactDate(rangeSince), until: rangeUntil ? compactDate(rangeUntil) : undefined },
            detailScope === "*" ? agentsToScan : [detailScope],
          );
          if (nextPricing) setPricing((current) => ({ ...current, ...nextPricing }));
          setDetails((current) => ({ ...current, [key]: { report: detail, requestedAt } }));
          setDetailErrors(({ [key]: _cleared, ...rest }) => rest);
        } catch (error) {
          setDetailErrors((current) => ({ ...current, [key]: String(error) }));
        } finally {
          detailReads.current.delete(key);
          // A scan that ended during this read made it stale: ask again now that none is running.
          if (requestedAt < loadedAtOf(statesRef.current[id])) setDetailRetry((count) => count + 1);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeSince, rangeUntil, detailScope, activeKey, readableKey, detected, archiveReady, lastScan, scanningKey, offline, agentsToScan, detailRetry]);

  return { effectivePeriod, range, localParts, localReport, navReport, resetRtd, resetSpend, report, detailError };
}
