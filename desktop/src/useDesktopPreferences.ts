import { useEffect, useState } from "react";
import { getAutostart, setAutostart, setClaudeRenew, setCloseToTray, setRestartOnCrash } from "./api";
import type { Settings } from "./types";

/**
 * Background behaviour kept in step with the settings (closing to the notification area, crash
 * restart, Claude sign-in renewal), and the Windows startup entry, read and written here.
 */
export function useDesktopPreferences(settings: Settings) {
  const [autostart, setAutostartState] = useState<boolean | null>(null);
  useEffect(() => {
    getAutostart()
      .then(setAutostartState)
      .catch(() => setAutostartState(null));
  }, []);
  useEffect(() => {
    void setCloseToTray(settings.closeToTray).catch(() => undefined);
  }, [settings.closeToTray]);
  useEffect(() => {
    void setClaudeRenew(settings.claudeRenew).catch(() => undefined);
  }, [settings.claudeRenew]);
  useEffect(() => {
    void setRestartOnCrash(settings.restartOnCrash).catch(() => undefined);
  }, [settings.restartOnCrash]);
  // The box follows the click at once; writing the startup entry can take seconds on a machine
  // whose security software inspects it. The real state is read back when the write is over.
  const [autostartBusy, setAutostartBusy] = useState(false);
  const toggleAutostart = (enabled: boolean) => {
    setAutostartState(enabled);
    setAutostartBusy(true);
    setAutostart(enabled)
      .catch(() => undefined)
      .then(() => getAutostart())
      .then(setAutostartState)
      .catch(() => undefined)
      .finally(() => setAutostartBusy(false));
  };
  return { autostart, autostartBusy, toggleAutostart };
}
