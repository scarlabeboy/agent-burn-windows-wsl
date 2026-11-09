import { useEffect, useState } from "react";
import { detectSources, setWslKeepalive } from "./api";
import type { Detected, WslMode } from "./types";

/**
 * The WSL distributions to read, `null` until the first detection answers. With WSL reading off
 * there are none and WSL is not queried at all.
 */
export function useSourceDiscovery(wslRead: boolean, wslMode: WslMode): Detected | null {
  const [detected, setDetected] = useState<Detected | null>(null);

  // The detection only lists WSL, it never starts it: this check is cheap, so it repeats to
  // notice a distribution starting or stopping.
  useEffect(() => {
    if (!wslRead) {
      setDetected({ distros: [] });
      return;
    }
    let cancelled = false;
    const check = () =>
      detectSources()
        // A failed check says nothing new: the last known distributions stay.
        .catch(() => null)
        .then((next) => {
          if (!cancelled && next)
            setDetected((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
        });
    void check();
    const timer = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [wslRead]);

  // "Kept running": the app keeps each distribution awake while it runs and renews that every
  // few seconds, so a distribution that was shut down comes back. Any other mode stops it.
  useEffect(() => {
    const keep = wslRead && wslMode === "keep";
    void setWslKeepalive(keep).catch(() => undefined);
    if (!keep) return;
    const timer = setInterval(() => void setWslKeepalive(true).catch(() => undefined), 15_000);
    return () => clearInterval(timer);
  }, [wslRead, wslMode]);

  return detected;
}
