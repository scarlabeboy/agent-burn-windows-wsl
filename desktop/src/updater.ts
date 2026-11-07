import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import { flush } from "./archive";

/** First automatic check after startup, then this often. */
const FIRST_CHECK_MS = 20_000;
const CHECK_EVERY_MS = 6 * 3600_000;
/** A request that never answers fails after this, so a later check or install can run. */
const CHECK_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
export const REPO_URL = "https://github.com/scarlabeboy/agent-burn-windows-wsl";

/** The notes of every version, to read back through them, skipped updates included. */
export const CHANGELOG_URL = `${REPO_URL}/blob/main/desktop/CHANGELOG.md`;

export interface AvailableUpdate {
  version: string;
  currentVersion: string;
  date?: string;
  notes?: string;
}

/**
 * What is known of a newer version. A check under way or failed does not change it (see
 * `checking` and `checkError`): a version found stays offered whatever the next check does.
 */
export type UpdateState =
  | { status: "idle" }
  | { status: "none"; checkedAt: number }
  /** `installError`: the updater's own message, said in the interface language when shown (`updateError`). */
  | ({ status: "available"; installError?: string } & AvailableUpdate)
  | ({ status: "installing"; percent?: number } & AvailableUpdate);

/**
 * New releases come from the GitHub releases, signed: the updater refuses a file whose signature
 * does not match the key built into the app. Installing on Windows closes the app; the installer
 * starts it again.
 */
export function useUpdater(auto: boolean, offline: boolean) {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  /** The last check that got an answer, whether it found a version or not. */
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  /** When the next automatic check is due; null while they are off. */
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  /** The last check's failure, cleared by the next check; said like `installError`. */
  const [checkError, setCheckError] = useState<string | null>(null);
  const update = useRef<Update | null>(null);
  // Once an install starts, no check may replace its progress or the update it downloads: a
  // timer can fire meanwhile, and a check already under way can answer after it began.
  const installing = useRef(false);
  // One check at a time: an automatic and a manual one together would answer in any order.
  const busy = useRef(false);

  const checkNow = useCallback(async () => {
    if (installing.current || busy.current) return;
    busy.current = true;
    setChecking(true);
    setCheckError(null);
    try {
      const found = await check({ timeout: CHECK_TIMEOUT_MS });
      if (installing.current) return;
      update.current = found;
      setCheckedAt(Date.now());
      setState(
        found
          ? {
              status: "available",
              version: found.version,
              currentVersion: found.currentVersion,
              date: found.date ?? undefined,
              notes: found.body ?? undefined,
            }
          : { status: "none", checkedAt: Date.now() },
      );
    } catch (error) {
      if (!installing.current) setCheckError(String(error));
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, []);

  // Offline mode means no network call at all, so no automatic check either. Each automatic
  // check books the next one, whose time is shown; a manual check does not move it.
  useEffect(() => {
    if (!auto || offline) {
      setNextAt(null);
      // No check runs offline: an old failure would stay on screen for nothing.
      if (offline) setCheckError(null);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      setNextAt(Date.now() + delay);
      timer = setTimeout(() => {
        void checkNow();
        schedule(CHECK_EVERY_MS);
      }, delay);
    };
    schedule(FIRST_CHECK_MS);
    return () => clearTimeout(timer);
  }, [auto, offline, checkNow]);

  const install = useCallback(async () => {
    const pending = update.current;
    if (!pending || installing.current) return;
    installing.current = true;
    const release: AvailableUpdate = {
      version: pending.version,
      currentVersion: pending.currentVersion,
      date: pending.date ?? undefined,
      notes: pending.body ?? undefined,
    };
    let total = 0;
    let received = 0;
    setState({ status: "installing", ...release });
    try {
      await pending.download(
        (event) => {
          if (event.event === "Started") total = event.data.contentLength ?? 0;
          if (event.event === "Progress") {
            received += event.data.chunkLength;
            setState({
              status: "installing",
              ...release,
              percent: total > 0 ? Math.round((received / total) * 100) : undefined,
            });
          }
        },
        { timeout: DOWNLOAD_TIMEOUT_MS },
      );
      // Saved right before installing, as the installer exits the app: readings that came in
      // during the download are kept too. Up to three seconds, so a stuck save cannot block it.
      let saveTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          flush(),
          new Promise<void>((resolve) => { saveTimeout = setTimeout(resolve, 3000); }),
        ]);
      } finally {
        clearTimeout(saveTimeout);
      }
      await pending.install();
      await relaunch();
    } catch (error) {
      installing.current = false;
      setState({ status: "available", ...release, installError: String(error) });
    }
  }, []);

  return { state, checking, checkError, checkedAt, nextAt, checkNow, install };
}
