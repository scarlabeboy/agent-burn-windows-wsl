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

/** Sources read this close together are in the same quota window; further apart, one may be past a reset. */
const SAME_WINDOW_MINUTES = 60;

/**
 * The subscription with its quota value counting the spend of every source. The CLI divides one
 * source's spend by the account's used percentage, which undervalues the quota when Windows and
 * WSL share it. The value grows in proportion to the spend, so the estimate is scaled to the sum.
 */
export function withAccountSpend(
  sub: SubscriptionAgent | undefined,
  reports: UsageReport[],
): SubscriptionAgent | undefined {
  const window = sub?.window;
  if (!sub?.estimate || !window) return sub;
  const others = reports
    .flatMap((report) => report.subscription?.agents ?? [])
    .filter(
      (entry) =>
        entry !== sub &&
        entry.agent === sub.agent &&
        entry.window?.label === window.label &&
        Math.abs(entry.window.elapsedMinutes - window.elapsedMinutes) <= SAME_WINDOW_MINUTES,
    );
  const entries = [sub, ...others];
  const spent = entries.reduce((sum, entry) => sum + (entry.window?.apiEquivalentSpent ?? 0), 0);
  // Any source that spent in the window can be scaled: this one may have spent nothing.
  const base = entries.find((entry) => entry.estimate && (entry.window?.apiEquivalentSpent ?? 0) > 0);
  if (!base?.estimate || !base.window) return sub;
  const scale = spent / base.window.apiEquivalentSpent;
  const monthlyValue = base.estimate.monthlyValue * scale;
  return {
    ...sub,
    estimate: {
      ...sub.estimate,
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
