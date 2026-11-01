import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { formatAge } from "./quota";
import type { UpdateState } from "./updater";
import { useNow } from "./useNow";

/**
 * Bottom bar, always visible: when usage was last read, when it is read next, a new release
 * when there is one, and the app version.
 */
export function StatusBar({
  loading,
  lastScan,
  nextScan,
  update,
  onInstall,
}: {
  loading: boolean;
  lastScan: number;
  nextScan: number;
  update: UpdateState;
  onInstall: () => void;
}) {
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion().then(setVersion, () => undefined);
  }, []);
  const nowMs = useNow(15_000);
  // Rounded up: "dans 1 min" until the scan starts, never "dans 0 min".
  const nextIn = Math.ceil((nextScan - nowMs) / 60_000);
  const next = nextScan > 0 && nextIn > 0 ? ` (prochaine dans ${nextIn} min)` : "";
  return (
    <footer className="statusbar small muted">
      <i className={`dot${loading ? " busy" : lastScan > 0 ? " ok" : ""}`} />
      <span title="Dernière lecture des journaux des harness">
        {loading
          ? "Mise à jour…"
          : lastScan > 0
            ? `Mis à jour à ${new Date(lastScan).toLocaleTimeString("fr-FR")} · il y a ${formatAge(nowMs - lastScan)}${next}`
            : "Pas encore lu"}
      </span>
      <div className="spacer" />
      {update.status === "available" && (
        <button className="update-link" onClick={onInstall} title="L'application se ferme pendant l'installation puis redémarre">
          Version {update.version} disponible · Installer
        </button>
      )}
      {update.status === "installing" && (
        <span className="update-link">
          Mise à jour{update.percent !== undefined ? ` · ${update.percent} %` : "…"}
        </span>
      )}
      {version && <span>v{version}</span>}
    </footer>
  );
}
