import type { AgentReport, DailyPoint, UsageReport } from "./types";

export type Period =
  | "all"
  | "today"
  | "yesterday"
  | "wtd"
  | "week"
  | "mtd"
  | "month"
  | "ytd"
  | "rtd";

export const PERIOD_LABELS: Record<Period, string> = {
  all: "Toute la période",
  today: "Aujourd'hui",
  yesterday: "Hier",
  wtd: "Cette semaine",
  week: "7 derniers jours",
  mtd: "Ce mois-ci",
  month: "30 derniers jours",
  ytd: "Cette année",
  rtd: "Depuis le reset",
};

export const PERIODS = Object.keys(PERIOD_LABELS) as Period[];

export interface DateRange {
  /** Inclusive local dates, `YYYY-MM-DD`. */
  since: string;
  until?: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

export const isoDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

/**
 * Date range of a period, using the same rules as the CLI: weeks start on Monday,
 * "7 days" and "30 days" include today. `resetStartMs` is the start of the current weekly
 * quota cycle, used by "since reset". Returns null for the whole history.
 */
export function rangeFor(period: Period, now: Date, resetStartMs?: number): DateRange | null {
  switch (period) {
    case "all":
      return null;
    case "today":
      return { since: isoDate(now), until: isoDate(now) };
    case "yesterday": {
      const day = isoDate(addDays(now, -1));
      return { since: day, until: day };
    }
    case "wtd":
      return { since: isoDate(addDays(now, -((now.getDay() + 6) % 7))) };
    case "week":
      return { since: isoDate(addDays(now, -6)) };
    case "mtd":
      return { since: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)) };
    case "month":
      return { since: isoDate(addDays(now, -29)) };
    case "ytd":
      return { since: isoDate(new Date(now.getFullYear(), 0, 1)) };
    case "rtd":
      return resetStartMs === undefined ? null : { since: isoDate(new Date(resetStartMs)) };
  }
}

/** Daily bars suit short periods; long ones read better by month. */
export function defaultGranularity(period: Period): "daily" | "weekly" | "monthly" {
  if (period === "all") return "monthly";
  if (period === "ytd") return "monthly";
  return "daily";
}

export const inRange = (date: string, range: DateRange) =>
  date >= range.since && (range.until === undefined || date <= range.until);

const sum = (points: DailyPoint[], key: "tokens" | "cost") =>
  points.reduce((total, point) => total + point[key], 0);

/**
 * Totals and daily series for a period, exact because they come from per-day data. Per-model
 * and per-token-type detail is not split by day, so it is flagged until a period scan arrives.
 */
export function filterReport(report: UsageReport, range: DateRange): UsageReport {
  const agents: AgentReport[] = report.agents.map((agent) => {
    const daily = agent.daily.filter((point) => inRange(point.date, range));
    return {
      ...agent,
      daily,
      models: [],
      tokenBreakdown: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      totalCost: sum(daily, "cost"),
      totalTokens: sum(daily, "tokens"),
    };
  });
  const daily = report.daily.filter((point) => inRange(point.date, range));
  return {
    agents,
    daily,
    models: [],
    totals: { totalCost: sum(daily, "cost"), totalTokens: sum(daily, "tokens") },
    approxDetail: true,
  };
}

/** `YYYY-MM-DD` to the compact form the CLI expects. */
export const compactDate = (date: string): string => date.replaceAll("-", "");
