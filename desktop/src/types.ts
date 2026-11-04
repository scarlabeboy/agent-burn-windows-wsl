import type { HarnessStates } from "./harnesses";
import type { Lang } from "./i18n";

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

export interface ModelPricing {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  inputAbove200k?: number;
  outputAbove200k?: number;
  cacheWriteAbove200k?: number;
  cacheReadAbove200k?: number;
  fastMultiplier?: number;
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
  /** Frontend-only: days added from the daily archive, without per-model detail. */
  archivedDays?: number;
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
  /** The quota window the estimate is built on, with this source's own spend in it. */
  window?: { label: string; usedPercent: number; elapsedMinutes: number; apiEquivalentSpent: number } | null;
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
  pricing?: Record<string, ModelPricing>;
  subscription?: { agents: SubscriptionAgent[] };
  claudeAccount?: ClaudeAccount;
  /** Frontend-only: totals are exact but per-model and token-type detail is not yet known. */
  approxDetail?: boolean;
  /** Frontend-only: days added from the daily archive, without per-model detail. */
  archivedDays?: number;
}

export interface Distro {
  name: string;
  user: string | null;
  /** Only running distributions are read: reading a stopped one would start it. */
  running: boolean;
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
  | { status: "loading"; previous?: UsageReport; previousAt?: number }
  | { status: "ready"; report: UsageReport; loadedAt: number }
  | { status: "error"; message: string; previous?: UsageReport; previousAt?: number };

export type TabId = "windows" | "wsl" | "computer";

export type WslMode = "auto" | "keep";

export interface Settings {
  /** Off: Windows only, WSL is never queried and the side bar has no environment choice. */
  wslRead: boolean;
  /** How WSL is read while on: auto, read when it runs and never woken; keep, kept awake. Kept while off. */
  wslMode: WslMode;
  /** No network call at all: quotas and updates are off, usage is priced offline. */
  offline: boolean;
  /** Quotas read every minute (never in offline mode, whatever this says). */
  quotas: boolean;
  /** Minutes between automatic usage scans; 0 disables them. */
  refreshMinutes: number;
  /** Closing the window keeps the app running in the notification area. */
  closeToTray: boolean;
  /** The CLI may renew the Claude Code sign-in, which can sign out a `claude` command. */
  claudeRenew: boolean;
  /** Windows starts the app again after a crash, or when an installer or Windows Update closed it. */
  restartOnCrash: boolean;
  /** Look for a new release at startup and every few hours (never in offline mode, whatever this says). */
  autoUpdate: boolean;
  /** Harnesses turned off: not scanned and removed from the data. */
  harnessStates: HarnessStates;
  /** Interface language once chosen; until then Windows' own language decides. */
  language?: Lang;
  /** Follow Windows unless a light or dark appearance is explicitly chosen. */
  theme: "system" | "dark" | "light";
}

