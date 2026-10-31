export interface DailyPoint {
  date: string;
  tokens: number;
  cost: number;
}

export interface ModelRow {
  model: string;
  percentage: number;
  totalCost: number;
  totalTokens: number;
}

export interface TokenBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface AgentReport {
  agent: string;
  daily: DailyPoint[];
  models: ModelRow[];
  tokenBreakdown: TokenBreakdown;
  totalCost: number;
  totalTokens: number;
}

export interface SubscriptionEstimate {
  fullQuotaValue: number;
  monthlyValue: number;
  projectedUsePercent: number;
  valueMultiple: number | null;
}

/** One subscription from `summary --value`. Plan and price are null when unknown. */
export interface SubscriptionAgent {
  agent: string;
  plan: string | null;
  pricePerMonth: number | null;
  liveLimits: boolean;
  periodUsage: number;
  resetCreditsAvailable: number | null;
  estimate: SubscriptionEstimate | null;
}

export interface ScopedWindow {
  name: string;
  usedPercent: number;
  resetsAtMs: number | null;
}

/** Claude account meters, reported only when Anthropic returns them. */
export interface ClaudeAccount {
  observedAtMs?: number;
  scoped: ScopedWindow[];
  extraEnabled: boolean | null;
  extraUsedUSD: number | null;
  extraLimitUSD: number | null;
  extraUsedPercent: number | null;
}

/** Shape of `agent-burn summary --value --json`. */
export interface UsageReport {
  agents: AgentReport[];
  daily: DailyPoint[];
  models: ModelRow[];
  totals: { totalCost: number; totalTokens: number };
  subscription?: { agents: SubscriptionAgent[] };
  claudeAccount?: ClaudeAccount;
  /** Frontend-only: totals are exact but per-model and token-type detail is not yet known. */
  approxDetail?: boolean;
}

export interface Distro {
  name: string;
  user: string | null;
}

export interface Detected {
  distros: Distro[];
}

export interface QuotaWindow {
  windowMinutes: number;
  usedPercent: number;
  elapsedPercent: number;
}

/** Private quota protocol of `agent-burn harness <agent>` with AGENT_BURN_QUOTA_ONLY. */
export interface QuotaReading {
  agent: string;
  observedAt: number;
  window: QuotaWindow;
  sessionWindow?: QuotaWindow;
}

export type SourceId = "windows" | `wsl:${string}`;

export type SourceState =
  | { status: "idle" }
  | { status: "loading"; previous?: UsageReport }
  | { status: "ready"; report: UsageReport; loadedAt: number }
  | { status: "error"; message: string; previous?: UsageReport };

export type TabId = "windows" | "wsl" | "computer";

export interface Settings {
  wslEnabled: boolean;
  offline: boolean;
  /** Minutes between automatic usage scans; 0 disables them. */
  refreshMinutes: number;
  /** "auto" reads the plan from the sign-in file; or pro, max-5x, max-20x, none. */
  claudePlan: ClaudePlanSetting;
}

export type ClaudePlanSetting = "auto" | "pro" | "max-5x" | "max-20x" | "none";
