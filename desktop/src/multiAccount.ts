import { withoutHarnesses } from "./aggregate";
import { withArchive, type DayStore } from "./dailyArchive";
import { filterReport, rangeFor } from "./periods";
import { catalogPlan } from "./plans";
import {
  QUOTA_HARNESSES,
  type MultiAccountConfig,
  type MultiAccountEntry,
  type QuotaHarness,
  type Settings,
  type UsageReport,
} from "./types";

/** Accounts shown as soon as the multi-account switch is on. */
export const MULTI_MIN_ACCOUNTS = 2;
const NAME_MAX = 40;

const emptyAccount = (): MultiAccountEntry => ({ name: "", plan: null });

/** The declared accounts of a harness while its switch is on. */
export const multiAccountOf = (settings: Settings, harness: QuotaHarness): MultiAccountConfig | undefined => {
  const config = settings.multiAccount?.[harness];
  return config?.on ? config : undefined;
};

/** The configuration as stored, with every line kept and at least two of them. */
export function withMinimumAccounts(accounts: MultiAccountEntry[]): MultiAccountEntry[] {
  const lines = [...accounts];
  while (lines.length < MULTI_MIN_ACCOUNTS) lines.push(emptyAccount());
  return lines;
}

/**
 * The stored multi-account settings, checked one value at a time: a damaged entry is dropped, a
 * plan outside the catalog becomes "not chosen", and a line without a plan stays as it is.
 */
export function readMultiAccount(stored: unknown): Settings["multiAccount"] {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return undefined;
  const result: Settings["multiAccount"] = {};
  for (const harness of QUOTA_HARNESSES) {
    const entry = (stored as Record<string, unknown>)[harness];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const { on, accounts } = entry as { on?: unknown; accounts?: unknown };
    if (typeof on !== "boolean" || !Array.isArray(accounts)) continue;
    const lines = accounts
      .filter((line): line is Record<string, unknown> => typeof line === "object" && line !== null && !Array.isArray(line))
      .map((line) => ({
        name: typeof line.name === "string" ? line.name.slice(0, NAME_MAX) : "",
        plan: typeof line.plan === "string" && catalogPlan(harness, line.plan) ? line.plan : null,
      }));
    result[harness] = { on, accounts: withMinimumAccounts(lines) };
  }
  return Object.keys(result).length ? result : undefined;
}

export const MULTI_NAME_MAX = NAME_MAX;

/** One source's report and its archived days, for the month's spend. */
export interface MonthSource {
  report: UsageReport;
  days: DayStore;
}

/**
 * The API-equivalent spend of a harness since the first of the month, over every source read,
 * archived days included. Null when no source has been read: unknown, not zero.
 */
export function monthCost(sources: MonthSource[], harness: string, disabled: string[], now: Date): number | null {
  if (sources.length === 0 || disabled.includes(harness)) return null;
  const range = rangeFor("mtd", now)!;
  return sources.reduce((sum, { report, days }) => {
    const month = withArchive(filterReport(withoutHarnesses(report, disabled), range), days, disabled, range);
    const agent = month.agents.find((entry) => entry.agent === harness);
    return sum + (agent?.daily.reduce((total, point) => total + point.cost, 0) ?? 0);
  }, 0);
}

export interface MultiSummary {
  /** The declared accounts, with their plan when one is chosen. */
  accounts: { name: string; label: string | null; price: number | null }[];
  /** Sum of the chosen plans, in US dollars per month. */
  total: number;
  /** A line has no plan chosen: the total is too low to compare against. */
  incomplete: boolean;
  monthCost: number | null;
  /** The month's spend over the total; null when incomplete, free, or without spend data. */
  ratio: number | null;
}

/** What the subscription block shows for accounts declared by hand. */
export function multiSummary(harness: QuotaHarness, config: MultiAccountConfig, cost: number | null): MultiSummary {
  const accounts = config.accounts.map((line) => {
    const plan = catalogPlan(harness, line.plan);
    return { name: line.name.trim(), label: plan?.label ?? null, price: plan?.price ?? null };
  });
  const total = accounts.reduce((sum, account) => sum + (account.price ?? 0), 0);
  const incomplete = accounts.some((account) => account.price === null);
  const ratio = !incomplete && total > 0 && cost !== null ? cost / total : null;
  return { accounts, total, incomplete, monthCost: cost, ratio };
}
