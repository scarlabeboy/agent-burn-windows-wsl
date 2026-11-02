import { t } from "./i18n";
import type { Settings } from "./types";

/**
 * Offline mode stops every network call: quotas and updates are off whatever their own switch
 * says, and that choice comes back when the app goes online again. Reading the usage logs is
 * local and goes on.
 */
export const quotasActive = (settings: Settings) => settings.quotas && !settings.offline;

export const autoUpdateActive = (settings: Settings) => settings.autoUpdate && !settings.offline;

export function offlineHint(offline: boolean): string {
  return offline ? t().hints.offlineOn : t().hints.offlineOff;
}

export function quotaHint(settings: Settings): string {
  if (settings.offline) return t().hints.quotaOffline;
  return settings.quotas ? t().hints.quotaOn : t().hints.quotaOff;
}

export function refreshHint(minutes: number): string {
  return minutes > 0 ? t().hints.refreshEvery(minutes) : t().hints.refreshNever;
}

export function autoUpdateHint(offline: boolean): string {
  return offline ? t().hints.autoUpdateOffline : t().hints.autoUpdateOn;
}

/**
 * Why a Claude or Codex page shows no quota when the reason is a setting, not a sign-in. A reading
 * that is no longer refreshed is not shown either: offline comes first, since it stops quotas too.
 */
export function quotaOffReason(settings: Settings): string | undefined {
  if (settings.offline) return t().hints.quotaOffOffline;
  if (!settings.quotas) return t().hints.quotaOffSwitch;
  return undefined;
}

/** Why the subscription value and pace are not shown: they need live prices and the live quota. */
export function subscriptionOffReason(settings: Settings): string | undefined {
  if (settings.offline) return t().hints.subscriptionOffOffline;
  if (!settings.quotas) return t().hints.subscriptionOffSwitch;
  return undefined;
}

/** Why the weekly Codex limit per day is not read: it comes from the ChatGPT dashboard. */
export function limitUsageOffReason(settings: Settings): string | undefined {
  if (settings.offline) return t().hints.limitUsageOffOffline;
  if (!settings.quotas) return t().hints.limitUsageOffSwitch;
  return undefined;
}
