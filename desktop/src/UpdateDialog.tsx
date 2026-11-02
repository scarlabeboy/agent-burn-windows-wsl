import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect } from "react";
import { getLang, t } from "./i18n";
import { parseNotes, releaseDay, updateError } from "./releaseNotes";
import { releaseUrl, type UpdateState } from "./updater";

/**
 * Asks before installing an update: which version, what changed, and a link to the full notes
 * on GitHub. Installing shows the download here until the installer closes the app.
 */
export function UpdateDialog({
  state,
  offline,
  onInstall,
  onClose,
}: {
  state: UpdateState;
  /** The release can be read but not downloaded: Install waits for the app to be online. */
  offline: boolean;
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
  const sections = parseNotes(release?.notes, getLang());
  const text = t().update;

  return (
    <div className="modal-backdrop" onClick={installing ? undefined : onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="update-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="update-title">{text.dialogTitle}</h2>
        {release ? (
          <>
            <p className="muted small">{text.dialogVersion(release.version, day, release.currentVersion)}</p>
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
              {text.fullNotes}
            </button>
            <p className="muted small">{offline ? text.offlineInstall : text.restartNote}</p>
          </>
        ) : (
          <p className="notice error">{text.cannotInstall(state.status === "error" ? updateError(state.message) : "")}</p>
        )}
        <div className="modal-actions">
          {installing ? (
            <span className="muted">
              {state.percent !== undefined ? text.downloading(state.percent) : text.preparing}
            </span>
          ) : (
            <>
              <button className="btn" onClick={onClose}>
                {release ? text.later : text.close}
              </button>
              {release && (
                <button className="btn primary" onClick={onInstall} disabled={offline}>
                  {text.install}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
