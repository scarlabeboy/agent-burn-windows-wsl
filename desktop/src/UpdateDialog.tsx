import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect } from "react";
import { parseNotes, releaseDay } from "./releaseNotes";
import { releaseUrl, type UpdateState } from "./updater";

/**
 * Asks before installing an update: which version, what changed, and a link to the full notes
 * on GitHub. Installing shows the download here until the installer closes the app.
 */
export function UpdateDialog({
  state,
  onInstall,
  onClose,
}: {
  state: UpdateState;
  onInstall: () => void;
  onClose: () => void;
}) {
  const installing = state.status === "installing";
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !installing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [installing, onClose]);

  if (state.status !== "available" && state.status !== "installing" && state.status !== "error") return null;
  const release = state.status === "error" ? undefined : state;
  const day = releaseDay(release?.date);
  const sections = parseNotes(release?.notes);

  return (
    <div className="modal-backdrop" onClick={installing ? undefined : onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="update-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="update-title">Mise à jour disponible</h2>
        {release ? (
          <>
            <p className="muted small">
              Version {release.version}
              {day && ` · publiée le ${day}`} · vous avez la {release.currentVersion}
            </p>
            {sections.length > 0 && (
              <div className="notes">
                {sections.map((section, index) => (
                  <section key={index}>
                    {section.title && <h3>{section.title}</h3>}
                    <ul>
                      {section.items.map((item, line) => (
                        <li key={line}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
            <button className="link" onClick={() => void openUrl(releaseUrl(release.version))}>
              Voir les notes complètes sur GitHub ↗
            </button>
            <p className="muted small">L'application se fermera pendant l'installation, puis redémarrera.</p>
          </>
        ) : (
          <p className="notice error">Installation impossible : {state.status === "error" ? state.message : ""}</p>
        )}
        <div className="modal-actions">
          {installing ? (
            <span className="muted">
              {state.percent !== undefined ? `Téléchargement… ${state.percent} %` : "Préparation…"}
            </span>
          ) : (
            <>
              <button className="btn" onClick={onClose}>
                {release ? "Plus tard" : "Fermer"}
              </button>
              {release && (
                <button className="btn primary" onClick={onInstall}>
                  Installer
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
