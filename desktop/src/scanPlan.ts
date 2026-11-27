import type { DataFolders } from "./dataFolders";
import type { SourceId } from "./types";

/** The options every scan depends on, compared between scans. */
export const scanOptions = (offline: boolean, quotas: boolean, agents: string[] | undefined): string =>
  JSON.stringify([offline, quotas, agents ?? null]);

/** The options of one source: Windows also depends on the extra data folders, read there only. */
export const sourceOptions = (options: string, id: SourceId, folders?: DataFolders): string =>
  id === "windows" ? JSON.stringify([options, folders ?? null]) : options;

/** The sources not scanned yet with their options: new ones, or those whose options changed. */
export const sourcesToScan = (
  ids: SourceId[],
  scannedWith: ReadonlyMap<string, string>,
  optionsOf: (id: SourceId) => string,
): SourceId[] => ids.filter((id) => scannedWith.get(id) !== optionsOf(id));
