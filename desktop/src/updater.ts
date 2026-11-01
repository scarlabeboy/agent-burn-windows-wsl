import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import { flush } from "./archive";

/** First automatic check after startup, then this often. */
const FIRST_CHECK_MS = 20_000;
const CHECK_EVERY_MS = 6 * 3600_000;

export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "none"; checkedAt: number }
  | { status: "available"; version: string; notes?: string }
  | { status: "installing"; percent?: number }
  | { status: "error"; message: string };

/**
 * New releases come from the GitHub releases, signed: the updater refuses a file whose signature
 * does not match the key built into the app. Installing on Windows closes the app; the installer
 * starts it again.
 */
export function useUpdater(auto: boolean, offline: boolean) {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const update = useRef<Update | null>(null);

  const checkNow = useCallback(async () => {
    setState({ status: "checking" });
    try {
      const found = await check();
      update.current = found;
      setState(
        found
          ? { status: "available", version: found.version, notes: found.body ?? undefined }
          : { status: "none", checkedAt: Date.now() },
      );
    } catch (error) {
      setState({ status: "error", message: String(error) });
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
    if (!pending) return;
    // The installer ends the process: the quota history is saved first.
    flush();
    let total = 0;
    let received = 0;
    setState({ status: "installing" });
    try {
      await pending.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          received += event.data.chunkLength;
          setState({ status: "installing", percent: total > 0 ? Math.round((received / total) * 100) : undefined });
        }
      });
      await relaunch();
    } catch (error) {
      setState({ status: "error", message: String(error) });
    }
  }, []);

  return { state, checkNow, install };
}
