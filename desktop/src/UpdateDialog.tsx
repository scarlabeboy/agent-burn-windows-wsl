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
  const open = state.status === "available" || state.status === "installing";
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

  // A failed install brings the focus back into the dialog, where Install can be tried again.
  const installError = state.status === "available" ? state.installError : undefined;
  useEffect(() => {
    if (installError !== undefined) dialog.current?.focus();
  }, [installError]);

  if (!open) return null;
  const day = releaseDay(state.date);
  const sections = parseNotes(state.notes, getLang());
  const skipped = skippedVersions(state.notes, state.currentVersion, state.version);
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
        <p className="muted small">{text.dialogVersion(state.version, day, state.currentVersion)}</p>
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
        {/* A failed install can be tried again from here. */}
        {installError !== undefined && <p className="notice error" role="alert">{text.cannotInstall(updateError(installError))}</p>}
        <div className="modal-actions">
          {state.status === "installing" ? (
            <span className="muted">
              {state.percent !== undefined ? text.downloading(state.percent) : text.preparing}
            </span>
          ) : (
            <>
              <button className="btn" onClick={onClose}>
                {text.later}
              </button>
              <button className="btn primary" onClick={onInstall} disabled={offline}>
                {text.install}
              </button>
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
