import { invoke } from "@tauri-apps/api/core";
import type { Detected, Settings, UsageReport } from "./types";

export const detectSources = () => invoke<Detected>("detect_sources");

export const loadUsage = (distro: string | null, offline: boolean) =>
  invoke<UsageReport>("load_usage", { distro, offline });

const SETTINGS_KEY = "abf.settings";
const defaults: Settings = { wslEnabled: true, offline: true };

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
