import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import { flush } from "./archive";

/** First automatic check after startup, then this often. */
const FIRST_CHECK_MS = 20_000;
const CHECK_EVERY_MS = 6 * 3600_000;
export const REPO_URL ="https://github.com/scarlabeboy/agent-burn-windows-wsl";

/** The notes of every version, to read back through them, skipped updates included. */
export const CHANGELOG_URL = `${REPO_URL}/blob/main/desktop/CHANGELOG.md`;

export interface AvailableUpdate {
  version: string;
  currentVersion: string;
  date?: string;
  notes?: string;
}

export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "none"; checkedAt: number }
  | ({ status: "available" } & AvailableUpdate)
  | ({ status: "installing"; percent?: number } & AvailableUpdate)
  /** The updater's own message, said in the interface language when shown (`updateError`). */
  | { status: "error"; message: string };

/**
 * New releases come from the GitHub releases, signed: the updater refuses a file whose signature
 * does not match the key built into the app. Installing on Windows closes the app; the installer
 * starts it again.
 */
export function useUpdater(auto: boolean, offline: boolean) {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const update = useRef<Update | null>(null);
  // Once an install starts, no check may replace its progress or the update it downloads: a
  // timer can fire meanwhile, and a check already under way can answer after it began.
  const installing = useRef(false);

  const checkNow = useCallback(async () => {
    if (installing.current) return;
    setState({ status: "checking" });
    try {
      const found = await check();
      if (installing.current) return;
      update.current = found;
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
      if (!installing.current) setState({ status: "error", message: String(error) });
    }
  }, []);

  // Offline mode means no network call at all, so no automatic check either.
  useEffect(() => {
    if (!auto || offline) return;
    const first = setTimeout(() => void checkNow(), FIRST_CHECK_MS);
    const timer = setInterval(() => void checkNow(), CHECK_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
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
      // Give pending history saves up to three seconds before the installer can exit the app.
      let saveTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          flush(),
          new Promise<void>((resolve) => { saveTimeout = setTimeout(resolve, 3000); }),
        ]);
      } finally {
        clearTimeout(saveTimeout);
      }
      await pending.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          received += event.data.chunkLength;
          setState({
            status: "installing",
            ...release,
            percent: total > 0 ? Math.round((received / total) * 100) : undefined,
          });
        }
      });
      await relaunch();
    } catch (error) {
      installing.current = false;
      setState({ status: "error", message: String(error) });
    }
  }, []);

  return { state, checkNow, install };
}
