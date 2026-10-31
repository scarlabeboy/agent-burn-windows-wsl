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

/** Shape of `agent-burn summary --json`. */
export interface UsageReport {
  agents: AgentReport[];
  daily: DailyPoint[];
  models: ModelRow[];
  totals: { totalCost: number; totalTokens: number };
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
}
