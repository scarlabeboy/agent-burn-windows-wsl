import { locale, t } from "./i18n";
import { updateError } from "./releaseNotes";
import type { UpdateState } from "./updater";

const clockOf = (ms: number) => new Date(ms).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });

/**
 * The installed version's line: the last check and the next automatic one. It stays the same
 * when a version is found, which gets a line of its own (`foundHint`).
 */
export function checkHint(
  state: UpdateState,
  checking: boolean,
  checkError: string | null,
  checkedAt: number | null,
  nextAt: number | null,
): string {
  const text = t().update;
  if (checking) return text.checking;
  if (checkError !== null) return text.checkFailed(updateError(checkError));
  const next = nextAt !== null ? ` · ${text.nextCheck(clockOf(nextAt))}` : "";
  if (checkedAt === null) return `${text.notChecked}${next}`;
  const last = state.status === "none" ? text.upToDate(clockOf(checkedAt)) : text.checkedAt(clockOf(checkedAt));
  return `${last}${next}`;
}

/** The found version's line: what to do with it, or how its install goes. */
export function foundHint(state: UpdateState, offline: boolean): string {
  const text = t().update;
  if (state.status === "installing") {
    return state.percent !== undefined ? text.downloading(state.percent) : text.installing;
  }
  if (state.status !== "available") return text.available;
  if (offline) return text.foundOffline(state.version);
  if (state.installError !== undefined) return text.cannotInstall(updateError(state.installError));
  return text.available;
}
