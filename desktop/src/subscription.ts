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

/** The freshest Claude account reading across sources. */
export function pickClaudeAccount(reports: UsageReport[]): ClaudeAccount | undefined {
  return reports
    .map((report) => report.claudeAccount)
    .filter((account): account is ClaudeAccount => account !== undefined)
    .sort((a, b) => (b.observedAtMs ?? 0) - (a.observedAtMs ?? 0))[0];
}
