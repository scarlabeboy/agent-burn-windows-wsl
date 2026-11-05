import type { ClaudeAccount, SubscriptionAgent, UsageReport } from "./types";

/** Subscription data for a harness: prefer a source that knows the plan, then a live one. */
export function pickSubscription(
  reports: UsageReport[],
  harness: string,
): SubscriptionAgent | undefined {
  const candidates = reports
    .flatMap((report) => report.subscription?.agents ?? [])
    .filter((entry) => entry.agent === harness);
  return (
    candidates.find((entry) => entry.plan !== null && entry.plan !== "") ??
    candidates.find((entry) => entry.liveLimits) ??
    candidates[0]
  );
}

/** Windows starting this close together are the same quota window; further apart, one is past a reset. */
const SAME_WINDOW_MINUTES = 60;

/** A source's report and when it was read. */
export interface Reading {
  report: UsageReport;
  at: number;
}

/** When a reading's quota window started, in minutes. */
const windowStart = (entry: SubscriptionAgent, at: number) => at / 60_000 - (entry.window?.elapsedMinutes ?? 0);

/**
 * The subscription with its quota value counting the spend of every source. The CLI divides one
 * source's spend by the account's used percentage, which undervalues the quota when Windows and
 * WSL share it. The value grows in proportion to the spend, so the estimate is scaled to the sum.
 * A stopped WSL distribution keeps its last report: its spend still belongs to the account's
 * window as long as that window has not been reset, however long ago it was read.
 */
export function withAccountSpend(
  sub: SubscriptionAgent | undefined,
  readings: Reading[],
): SubscriptionAgent | undefined {
  const window = sub?.window;
  if (!sub?.estimate || !window) return sub;
  const own = readings.find(({ report }) => report.subscription?.agents.includes(sub));
  if (!own) return sub;
  const start = windowStart(sub, own.at);
  const others = readings
    .flatMap(({ report, at }) => (report.subscription?.agents ?? []).map((entry) => ({ entry, at })))
    .filter(
      ({ entry, at }) =>
        entry !== sub &&
        entry.agent === sub.agent &&
        entry.window?.label === window.label &&
        Math.abs(windowStart(entry, at) - start) <= SAME_WINDOW_MINUTES,
    );
  const entries = [{ entry: sub, at: own.at }, ...others];
  const spent = entries.reduce((sum, { entry }) => sum + (entry.window?.apiEquivalentSpent ?? 0), 0);
  // Scaled from the latest reading that spent in the window: its used percentage is the current
  // one, so every tab shows the same value even while one source's report is hours old.
  const base = entries
    .filter(({ entry }) => entry.estimate && (entry.window?.apiEquivalentSpent ?? 0) > 0)
    .sort((a, b) => b.at - a.at)[0]?.entry;
  if (!base?.estimate || !base.window) return sub;
  const scale = spent / base.window.apiEquivalentSpent;
  const monthlyValue = base.estimate.monthlyValue * scale;
  return {
    ...sub,
    estimate: {
      ...base.estimate,
      fullQuotaValue: base.estimate.fullQuotaValue * scale,
      monthlyValue,
      valueMultiple: sub.pricePerMonth ? monthlyValue / sub.pricePerMonth : null,
    },
  };
}

/** The freshest Claude account reading across sources. */
export function pickClaudeAccount(reports: UsageReport[]): ClaudeAccount | undefined {
  return reports
    .map((report) => report.claudeAccount)
    .filter((account): account is ClaudeAccount => account !== undefined)
    .sort((a, b) => (b.observedAtMs ?? 0) - (a.observedAtMs ?? 0))[0];
}
