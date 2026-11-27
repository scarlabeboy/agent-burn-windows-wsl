import type { Settings } from "./types";

/** The harnesses whose usage can also be read from folders of the user's choice. */
export const FOLDER_HARNESSES = ["claude", "codex"] as const;
export type FolderHarness = (typeof FOLDER_HARNESSES)[number];

/** Extra data folders per harness, read on Windows besides the usual one. */
export type DataFolders = Partial<Record<FolderHarness, string[]>>;

const MAX_FOLDERS = 10;
const MAX_LENGTH = 500;

/** The folder written as typed, without trailing separators, to compare two entries. A drive root
 * keeps its own: `D:` alone would name the drive's current folder. */
const normalized = (path: string) => {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  return /^[A-Za-z]:$/.test(trimmed) ? `${trimmed}\\` : trimmed;
};

/** The stored folders, checked one by one: anything but a usable path is dropped, as are repeats. */
export function readDataFolders(stored: unknown): DataFolders | undefined {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return undefined;
  const result: DataFolders = {};
  for (const harness of FOLDER_HARNESSES) {
    const list = (stored as Record<string, unknown>)[harness];
    if (!Array.isArray(list)) continue;
    const folders = withFolder([], ...list.filter((path): path is string => typeof path === "string"));
    if (folders.length > 0) result[harness] = folders;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** `folders` with `added` at the end, each kept once, at most ten, none empty or too long. */
export function withFolder(folders: string[], ...added: string[]): string[] {
  const result = [...folders];
  for (const path of added.map(normalized)) {
    if (path === "" || path.length > MAX_LENGTH || result.length >= MAX_FOLDERS) continue;
    if (!result.some((kept) => kept.toLowerCase() === path.toLowerCase())) result.push(path);
  }
  return result;
}

/** The folders a scan of Windows reads besides the usual ones (none for a WSL source). */
export const foldersOf = (settings: Settings, harness: FolderHarness): string[] => settings.dataFolders?.[harness] ?? [];
