import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { locale, t } from "./i18n";
import { formatAge } from "./quota";
import type { UpdateState } from "./updater";
import { useNow } from "./useNow";

/** The installed version, read once from the app. */
export function useAppVersion(): string {
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion().then(setVersion, () => undefined);
  }, []);
  return version;
}

/**
 * Bottom bar, always visible: when usage was last read, when it is read next, a new release
 * when there is one (not in offline mode, which cannot install it), and the app version.
 */
export function StatusBar({
  loading,
  lastScan,
  nextScan,
  error,
  offline,
  update,
  onOpenUpdate,
}: {
  loading: boolean;
  lastScan: number;
  nextScan: number;
  /** The last read of a source failed (for example the CLI removed by an antivirus). */
  error?: string;
  offline: boolean;
  update: UpdateState;
  onOpenUpdate: () => void;
}) {
  const version = useAppVersion();
  const nowMs = useNow(15_000);
  // Rounded up: "in 1 min" until the scan starts, never "in 0 min".
  const nextIn = Math.ceil((nextScan - nowMs) / 60_000);
  const text = t().status;
  const next = nextScan > 0 && nextIn > 0 ? text.nextIn(nextIn) : "";
  return (
    <footer className="statusbar small muted">
      <i className={`dot${loading ? " busy" : error ? " bad" : lastScan > 0 ? " ok" : ""}`} />
      {!loading && error ? (
        <span className="status-error" title={error}>
          {error}
        </span>
      ) : (
        <span title={text.lastRead}>
          {loading
            ? text.updating
            : lastScan > 0
              ? text.updatedAt(new Date(lastScan).toLocaleTimeString(locale()), formatAge(nowMs - lastScan)) + next
              : text.notRead}
        </span>
      )}
      <div className="spacer" />
      {offline && (
        <span className="offline-tag" title={text.offlineTitle}>
          {text.offline}
        </span>
      )}
      {update.status === "available" && !offline && (
        <button className="update-link" onClick={onOpenUpdate} title={text.updateTitle}>
          {text.updateAvailable(update.version)}
        </button>
      )}
      {update.status === "installing" && <span className="update-link">{text.installing(update.percent)}</span>}
      {version && <span>v{version}</span>}
    </footer>
  );
}
