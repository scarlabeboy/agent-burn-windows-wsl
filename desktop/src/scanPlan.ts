import type { SourceId } from "./types";

/** The options a scan depends on, compared between scans. */
export const scanOptions = (offline: boolean, quotas: boolean, agents: string[] | undefined): string =>
  JSON.stringify([offline, quotas, agents ?? null]);

/** The sources not scanned yet with `options`: new ones, or all of them once an option changed. */
export const sourcesToScan = (ids: SourceId[], scannedWith: ReadonlyMap<string, string>, options: string): SourceId[] =>
  ids.filter((id) => scannedWith.get(id) !== options);
