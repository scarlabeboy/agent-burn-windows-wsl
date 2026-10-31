import { invoke } from "@tauri-apps/api/core";
import type { Detected, QuotaReading, Settings, TabId, UsageReport } from "./types";

export const detectSources = () => invoke<Detected>("detect_sources");

export const loadUsage = (distro: string | null, offline: boolean) =>
  invoke<UsageReport>("load_usage", { distro, offline });

export const loadQuota = (harness: string, distro: string | null, force: boolean) =>
  invoke<QuotaReading>("load_quota", { harness, distro, force });

const SETTINGS_KEY = "abf.settings";
const defaults: Settings = { wslEnabled: true, offline: false, refreshMinutes: 10 };

export function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
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
