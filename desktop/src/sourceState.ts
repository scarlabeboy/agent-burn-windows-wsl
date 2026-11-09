import type { SourceState, UsageReport } from "./types";

/** The report on screen for a source: the last one read, kept while it is read again or failed. */
export function reportOf(state: SourceState | undefined): UsageReport | undefined {
  if (!state) return undefined;
  if (state.status === "ready") return state.report;
  if (state.status === "loading" || state.status === "error") return state.previous;
  return undefined;
}

/** When the report on screen for a source was read (0 when there is none). */
export function loadedAtOf(state: SourceState | undefined): number {
  if (state?.status === "ready") return state.loadedAt;
  if (state?.status === "loading" || state?.status === "error") return state.previousAt ?? 0;
  return 0;
}
