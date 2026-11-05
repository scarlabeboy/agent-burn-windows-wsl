import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef } from "react";
import { getLang, t } from "./i18n";
import { parseNotes, releaseDay, skippedVersions, updateError } from "./releaseNotes";
import { CHANGELOG_URL, type UpdateState } from "./updater";

/**
 * Asks before installing an update: which version, what changed, the updates skipped since the
 * installed one, and a link to the notes of every version on GitHub. Installing shows the download here until the installer closes the app.
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
  const open = state.status === "available" || state.status === "installing" || state.status === "error";
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !installing) onClose();
      if (event.key === "Tab") keepFocusInside(event, dialog.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, installing, onClose]);
  // Keyboard focus moves into the dialog when it opens, and back to where it was when it closes.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    return () => before?.focus();
  }, [open]);

  if (!open) return null;
  const release = state.status === "error" ? undefined : state;
  const day = releaseDay(release?.date);
  const sections = parseNotes(release?.notes, getLang());
  const skipped = release ? skippedVersions(release.notes, release.currentVersion, release.version) : [];
  const text = t().update;

  return (
    <div className="modal-backdrop" onClick={installing ? undefined : onClose}>
      <div
        ref={dialog}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
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
            {skipped.length > 0 && <p className="small skipped-note">{text.skipped(skipped)}</p>}
            <button className="link" onClick={() => void openUrl(CHANGELOG_URL)}>
              {text.allNotes}
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

/** Tab and Shift+Tab cycle through the dialog's own controls and never reach the page behind it. */
function keepFocusInside(event: KeyboardEvent, dialog: HTMLElement | null) {
  if (!dialog) return;
  const controls = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), [href]")];
  if (controls.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = controls[0];
  const last = controls[controls.length - 1];
  const inside = dialog.contains(document.activeElement);
  if (event.shiftKey && (!inside || document.activeElement === first || document.activeElement === dialog)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
    event.preventDefault();
    first.focus();
  }
}
