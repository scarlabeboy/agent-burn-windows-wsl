import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { checkDataFolder } from "./api";
import { FOLDER_HARNESSES, withFolder, type FolderHarness } from "./dataFolders";
import { t } from "./i18n";
import { SettingRow } from "./SettingsUi";
import type { Settings, UpdateSettings } from "./types";
import { agentLabel } from "./views";

/** The subfolder that tells a folder of each harness apart (checked again on the Rust side). */
const MARK: Record<FolderHarness, string> = { claude: "projects", codex: "sessions" };

/**
 * Extra data folders per harness: a button that opens the folder picker, the folders chosen, and
 * a cross to remove one. A folder without data of that harness is refused with a message.
 */
export function DataFolderSettings({
  settings,
  updateSettings,
}: {
  settings: Settings;
  updateSettings: UpdateSettings;
}) {
  const text = t().settings;
  const [refused, setRefused] = useState<Partial<Record<FolderHarness, string>>>({});
  // Applied to the settings of the moment: a folder check that ends late must not undo a change
  // made meanwhile, even if this page has closed since.
  const save = (harness: FolderHarness, change: (folders: string[]) => string[]) =>
    updateSettings((current) => ({
      ...current,
      dataFolders: { ...current.dataFolders, [harness]: change(current.dataFolders?.[harness] ?? []) },
    }));

  const add = async (harness: FolderHarness) => {
    const picked = await open({ directory: true, multiple: false, title: text.foldersTitle(agentLabel(harness)) });
    if (typeof picked !== "string") return;
    if (!(await checkDataFolder(harness, picked))) {
      setRefused((current) => ({ ...current, [harness]: picked }));
      return;
    }
    setRefused(({ [harness]: _cleared, ...rest }) => rest);
    save(harness, (folders) => withFolder(folders, picked));
  };

  return (
    <>
      {FOLDER_HARNESSES.map((harness) => {
        const name = agentLabel(harness);
        const folders = settings.dataFolders?.[harness] ?? [];
        return (
          <div key={harness}>
            <SettingRow title={text.foldersTitle(name)} description={text.foldersHint(MARK[harness])}>
              <button type="button" className="btn" onClick={() => void add(harness)}>
                {text.foldersAdd}
              </button>
            </SettingRow>
            {refused[harness] && (
              <p className="small set-note folder-refused">{text.foldersInvalid(name, MARK[harness])}</p>
            )}
            {folders.map((path) => (
              <div key={path} className="set-row folder-row">
                <span className="folder-path" title={path}>
                  {path}
                </span>
                <button
                  type="button"
                  className="btn multi-remove"
                  aria-label={text.foldersRemove(path)}
                  title={text.foldersRemove(path)}
                  onClick={() => save(harness, (current) => current.filter((kept) => kept !== path))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        );
      })}
      <p className="muted small set-note">{text.foldersNote}</p>
    </>
  );
}
