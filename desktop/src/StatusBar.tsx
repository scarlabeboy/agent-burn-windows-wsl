import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState, useSyncExternalStore } from "react";
import { archiveProblem, subscribe } from "./archive";
import { locale, t } from "./i18n";
import { formatAge } from "./quota";
import type { UpdateState } from "./updater";
import { useNow } from "./useNow";
import { Tooltip } from "./Tooltip";

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
  autoRefresh,
  error,
  errorDetail,
  offline,
  update,
  onOpenUpdate,
}: {
  loading: boolean;
  lastScan: number;
  nextScan: number;
  /** Off ("Never"): the dot turns neutral and the bar says so, though the last read worked. */
  autoRefresh: boolean;
  /** The last read of a source failed (for example the CLI removed by an antivirus). */
  error?: string;
  /** The original message behind `error`, shown in its tooltip. */
  errorDetail?: string;
  offline: boolean;
  update: UpdateState;
  onOpenUpdate: () => void;
}) {
  const version = useAppVersion();
  // An archive that is not saved: discreet, the app keeps working from memory.
  const archiveIssue = useSyncExternalStore(subscribe, archiveProblem);
  const nowMs = useNow(15_000);
  // Rounded up: "in 1 min" until the scan starts, never "in 0 min". The clock is read now, not
  // at the last tick of `nowMs`, which would say "31 min" right after choosing 30.
  const nextIn = Math.ceil((nextScan - Date.now()) / 60_000);
  const text = t().status;
  const next = !autoRefresh ? text.autoOff : nextScan > 0 && nextIn > 0 ? text.nextIn(nextIn) : "";
  return (
    <footer className="statusbar small muted">
      <i
        className={`dot${loading ? " busy" : error ? " bad" : lastScan > 0 ? (autoRefresh ? " ok" : " idle") : ""}`}
      />
      {!loading && error ? (
        <Tooltip text={errorDetail ? `${error} · ${errorDetail}` : error} className="status-error-tip">
          <span className="status-error">{error}</span>
        </Tooltip>
      ) : (
        <span>
          {loading
            ? text.updating
            : lastScan > 0
              ? text.updatedAt(new Date(lastScan).toLocaleTimeString(locale()), formatAge(nowMs - lastScan)) + next
              : text.notRead}
        </span>
      )}
      <div className="spacer" />
      {archiveIssue && (
        <Tooltip text={`${text.archiveTitle} · ${archiveIssue}`}>
          <span className="offline-tag archive-tag">{text.archiveUnsaved}</span>
        </Tooltip>
      )}
      {offline && (
        <Tooltip text={text.offlineTitle}>
          <span className="offline-tag">{text.offline}</span>
        </Tooltip>
      )}
      {update.status === "available" && !offline && (
        <Tooltip text={text.updateTitle}>
          <button className="update-link" onClick={onOpenUpdate}>
            {text.updateAvailable(update.version)}
          </button>
        </Tooltip>
      )}
      {update.status === "installing" && <span className="update-link">{text.installing(update.percent)}</span>}
      {version && <span>v{version}</span>}
    </footer>
  );
}
