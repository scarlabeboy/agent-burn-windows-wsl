import { invoke } from "@tauri-apps/api/core";
import { isLang } from "./i18n";
import type { LimitUsageDay } from "./limitUsage";
import { PERIODS, type Period } from "./periods";
import { wslSettings } from "./settingsHints";
import { QUOTA_HARNESSES, type Detected, type QuotaReading, type Settings, type TabId, type UsageReport } from "./types";

/** Starts the error of a read when agent-burn.exe is missing; the page words it in its language. */
export const CLI_MISSING = "cli-missing";

/**
 * Starts the error of a CLI run that ended in failure (`run_to_file` in cli.rs). For a quota it
 * only means the quota was unavailable: no sign-in, or no answer from the service.
 */
export const CLI_FAILED = "agent-burn exited with";

export const detectSources =() => invoke<Detected>("detect_sources");

/** Keeps every WSL distribution awake while on; call again to renew, with false to stop. */
export const setWslKeepalive = (enabled: boolean) => invoke<void>("set_wsl_keepalive", { enabled });

export interface UsageScope {
  /** Compact dates, `YYYYMMDD`. */
  since?: string;
  until?: string;
}

/** `quotas`: a full scan also reads the subscription block online (`--value`). */
export const loadUsage = (
  distro: string | null,
  offline: boolean,
  quotas: boolean,
  claudePlan: string,
  scope: UsageScope = {},
  agents?: string[],
) =>
  invoke<UsageReport>("load_usage", {
    distro,
    offline,
    quotas,
    claudePlan,
    since: scope.since ?? null,
    until: scope.until ?? null,
    agents: agents ?? null,
  });

/** Weekly Codex limit used per day by surface and model (empty when it cannot be read). */
export const loadLimitUsage = (distro: string | null) =>
  invoke<LimitUsageDay[]>("load_limit_usage", { distro });

export const loadQuota = (harness: string, distro: string | null, force: boolean) =>
  invoke<QuotaReading>("load_quota", { harness, distro, force });

export interface BackfillSeries {
  windowMinutes: number;
  endMinute: number;
  /** `[timestamp ms, used percent]`, oldest first. */
  samples: [number, number][];
}

type ArchiveName = "quota-history" | "report-cache" | "daily-metrics";

export const archiveRead = <T>(name: ArchiveName) => invoke<T | null>("archive_read", { name });

export const archiveWrite = (name: ArchiveName, value: unknown) =>
  invoke<void>("archive_write", { name, value });

export const backfillCodex = (distro: string | null, sinceMs: number) =>
  invoke<BackfillSeries[]>("backfill_codex", { distro, sinceMs });

const SETTINGS_KEY = "abf.settings";
const defaults: Settings = {
  wslRead: true,
  wslMode: "auto",
  offline: false,
  quotas: true,
  refreshMinutes: 10,
  closeToTray: false,
  claudeRenew: false,
  restartOnCrash: true,
  autoUpdate: true,
  harnessStates: {},
  theme: "system",
  trayIcon: "logo",
  trayWindow: "tightest",
};

const SEEN_KEY = "abf.seen-harnesses";

/** Harnesses that have shown usage data at least once, so a disabled one stays listed. */
export function readSeen(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function writeSeen(seen: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Without storage, harnesses are simply detected again at the next scan.
  }
}

export function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const stored = JSON.parse(raw);
    if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return defaults;
    const { wslEnabled: _old, ...rest } = stored;
    // "Every minute" is no longer offered: a scan can take half a minute.
    const refreshMinutes =
      stored.refreshMinutes === 1
        ? 5
        : typeof stored.refreshMinutes === "number" && Number.isFinite(stored.refreshMinutes)
          ? stored.refreshMinutes
          : defaults.refreshMinutes;
    // A damaged value here would break the first render (`Object.keys(null)`).
    const harnessStates =
      typeof stored.harnessStates === "object" && stored.harnessStates !== null && !Array.isArray(stored.harnessStates)
        ? stored.harnessStates
        : defaults.harnessStates;
    // An unknown language is dropped, so Windows' own language decides again.
    const language = isLang(stored.language) ? stored.language : undefined;
    const theme = stored.theme === "dark" || stored.theme === "light" ? stored.theme : "system";
    const trayIcon = (QUOTA_HARNESSES as string[]).includes(stored.trayIcon) ? stored.trayIcon : "logo";
    const trayWindow = ["session", "weekly"].includes(stored.trayWindow) ? stored.trayWindow : "tightest";
    return { ...defaults, ...rest, ...wslSettings(stored), refreshMinutes, harnessStates, language, theme, trayIcon, trayWindow };
  } catch {
    return defaults;
  }
}

export function writeSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings simply do not persist when storage is unavailable.
  }
}

const TAB_KEY = "abf.tab";

export function readTab(): TabId | null {
  try {
    const raw = localStorage.getItem(TAB_KEY);
    return raw === "windows" || raw === "wsl" || raw === "computer" ? raw : null;
  } catch {
    return null;
  }
}

export function writeTab(tab: TabId) {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // The start tab simply is not remembered.
  }
}

const PERIOD_KEY = "abf.period";

export function readPeriod(): Period {
  try {
    const raw = localStorage.getItem(PERIOD_KEY) as Period | null;
    return raw && PERIODS.includes(raw) ? raw : "all";
  } catch {
    return "all";
  }
}

export function writePeriod(period: Period) {
  try {
    localStorage.setItem(PERIOD_KEY, period);
  } catch {
    // The period simply is not remembered.
  }
}

export const setCloseToTray = (enabled: boolean) => invoke<void>("set_close_to_tray", { enabled });
export const setClaudeRenew = (enabled: boolean) => invoke<void>("set_claude_renew", { enabled });
export const setRestartOnCrash = (enabled: boolean) => invoke<void>("set_restart_on_crash", { enabled });
export const getAutostart = () => invoke<boolean>("get_autostart");
export const setAutostart = (enabled: boolean) => invoke<void>("set_autostart", { enabled });
export const setTrayTooltip = (text: string) => invoke<void>("set_tray_tooltip", { text });
/** A square RGBA picture for the notification-area icon; null puts the logo back. */
export const setTrayIcon = (rgba: number[] | null, size: number) =>
  invoke<void>("set_tray_icon", { rgba, size });
export const setTrayLabels = (labels: { open: string; refresh: string; quit: string }) =>
  invoke<void>("set_tray_labels", labels);
/** Ends the process, once the archive is saved after `quit-requested`. */
export const quitApp = () => invoke<void>("quit_app");
