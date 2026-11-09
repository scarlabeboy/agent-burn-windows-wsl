import type { QuotaHarness, SubscriptionAgent } from "./types";

/** What the app knows of a plan, whatever name the CLI gives it. */
export interface PlanProfile {
  /** The name shown. */
  label: string;
  /** US dollars per month; null when unknown. */
  price: number | null;
  /** The plan has no 5-hour session: Claude Ultra, once the account is verified. */
  noSession: boolean;
}

interface KnownPlan {
  label: string;
  price: number;
  noSession?: boolean;
}

// Keys are names without case, spaces or signs: the CLI's labels ("Max 20×" gives "max20"), the
// server's plan types ("prolite") and the names shown here ("Pro 100"), so a plan keeps its name
// whether the CLI is updated or not.
const CODEX_PLANS: Record<string, KnownPlan> = {
  free: { label: "Free", price: 0 },
  go: { label: "Go", price: 8 },
  plus: { label: "Plus", price: 20 },
  // Codex names them "Pro", "Pro (More)" and "Pro (Max)": the 100, 200 and 500 $ plans.
  prolite: { label: "Pro 100", price: 100 },
  pro100: { label: "Pro 100", price: 100 },
  pro: { label: "Pro 200", price: 200 },
  promore: { label: "Pro 200", price: 200 },
  pro200: { label: "Pro 200", price: 200 },
  promax: { label: "Pro 500", price: 500 },
  pro500: { label: "Pro 500", price: 500 },
};

const CLAUDE_PLANS: Record<string, KnownPlan> = {
  pro: { label: "Pro", price: 20 },
  max: { label: "Max", price: 100 },
  max5: { label: "Max", price: 100 },
  max5x: { label: "Max", price: 100 },
  // Max 20× became Ultra on 30/10/2026, with 10 times Pro's weekly usage.
  max20: { label: "Ultra", price: 200, noSession: true },
  max20x: { label: "Ultra", price: 200, noSession: true },
  ultra: { label: "Ultra", price: 200, noSession: true },
};

const keyOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The profile of a harness's plan, from the CLI's name and price. Unknown plans keep both. */
export function planProfile(harness: string, plan: string | null, price: number | null): PlanProfile | undefined {
  if (!plan) return undefined;
  const table = harness === "codex" ? CODEX_PLANS : harness === "claude" ? CLAUDE_PLANS : {};
  const known = table[keyOf(plan)];
  return known
    ? { label: known.label, price: known.price, noSession: known.noSession ?? false }
    : { label: plan, price, noSession: false };
}

/** The subscription with the app's name and price for its plan, and the value worked out again. */
export function withPlanProfile(sub: SubscriptionAgent | undefined): SubscriptionAgent | undefined {
  const profile = sub && planProfile(sub.agent, sub.plan, sub.pricePerMonth);
  if (!sub || !profile) return sub;
  const price = profile.price;
  return {
    ...sub,
    plan: profile.label,
    pricePerMonth: price,
    estimate: sub.estimate && {
      ...sub.estimate,
      valueMultiple: price ? sub.estimate.monthlyValue / price : null,
    },
  };
}

/** A plan offered when accounts are declared by hand: one entry per real plan, no aliases. */
export interface CatalogPlan {
  id: string;
  label: string;
  price: number;
}

/** The plans offered in the multi-account settings. Claude Free is left out: it has no Claude Code. */
export const PLAN_CATALOG: Record<QuotaHarness, CatalogPlan[]> = {
  codex: [
    { id: "free", label: "Free", price: 0 },
    { id: "go", label: "Go", price: 8 },
    { id: "plus", label: "Plus", price: 20 },
    { id: "pro100", label: "Pro 100", price: 100 },
    { id: "pro200", label: "Pro 200", price: 200 },
    { id: "pro500", label: "Pro 500", price: 500 },
  ],
  claude: [
    { id: "pro", label: "Pro", price: 20 },
    { id: "max", label: "Max", price: 100 },
    { id: "ultra", label: "Ultra", price: 200 },
  ],
};

export const catalogPlan = (harness: QuotaHarness, id: string | null): CatalogPlan | undefined =>
  id === null ? undefined : PLAN_CATALOG[harness].find((plan) => plan.id === id);

/** The catalog entry of a detected plan, through the same names as `planProfile`. */
export function catalogIdOf(harness: QuotaHarness, plan: string | null, price: number | null): string | null {
  const profile = planProfile(harness, plan, price);
  if (!profile) return null;
  return PLAN_CATALOG[harness].find((entry) => entry.label === profile.label && entry.price === profile.price)?.id ?? null;
}
