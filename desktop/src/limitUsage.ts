/**
 * How much of the weekly Codex limit each day consumed, split by product surface and by model.
 * It comes from the ChatGPT usage dashboard through `agent-burn harness codex`, so it covers the
 * whole account: the CLI, the desktop app, the IDE extension and the rest, on every device.
 */

export interface LimitUsageSurface {
  surface: string;
  usedPercent: number;
}

export interface LimitUsageModel {
  model: string;
  speed: string | null;
  usedPercent: number;
}

export interface LimitUsageDay {
  /** `YYYY-MM-DD`. */
  date: string;
  usedPercent: number;
  surfaces: LimitUsageSurface[];
  models: LimitUsageModel[];
}

export type Grouping = "surface" | "model";

/** Everything beyond the biggest few series, so a chart stays readable. */
export const OTHER = "Autres";
const SERIES_LIMIT = 5;

const SURFACES: Record<string, string> = {
  cli: "CLI",
  exec: "Exec",
  desktop_app: "Application de bureau",
  work_desktop: "Application de bureau (Work)",
  vscode: "Extension IDE",
  jetbrains: "JetBrains",
  web: "Cloud",
  work_web: "Cloud (Work)",
  mobile: "Mobile",
  work_mobile: "Mobile (Work)",
  github: "GitHub",
  github_code_review: "Revue de code",
  slack: "Slack",
  linear: "Linear",
  sdk: "SDK",
  agent_identity: "Identité d'agent",
};

/** A surface the app does not know is counted under "Autres" rather than shown by its raw name. */
export const surfaceLabel = (surface: string): string => SURFACES[surface] ?? OTHER;

/** The speed is only worth showing when it is not the default one, which nearly every model has. */
export const modelLabel = (model: LimitUsageModel): string =>
  model.speed && model.speed !== "standard" ? `${model.model} (${model.speed})` : model.model;

export interface LimitChart {
  /** One row per day, oldest first: `date`, then the percent of each series that day. */
  rows: Record<string, number | string>[];
  /** Series by total consumption, biggest first; "Autres" is always last. */
  series: { name: string; total: number }[];
}

function entriesOf(day: LimitUsageDay, grouping: Grouping): [string, number][] {
  return grouping === "surface"
    ? day.surfaces.map((entry): [string, number] => [surfaceLabel(entry.surface), entry.usedPercent])
    : day.models.map((entry): [string, number] => [modelLabel(entry), entry.usedPercent]);
}

export function buildChart(days: LimitUsageDay[], grouping: Grouping): LimitChart {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const totals = new Map<string, number>();
  for (const day of sorted) {
    for (const [name, percent] of entriesOf(day, grouping)) {
      totals.set(name, (totals.get(name) ?? 0) + percent);
    }
  }
  const ranked = [...totals.entries()]
    .filter(([name]) => name !== OTHER)
    .sort((a, b) => b[1] - a[1]);
  const kept = new Set(ranked.slice(0, SERIES_LIMIT).map(([name]) => name));

  const rows = sorted.map((day) => {
    const row: Record<string, number | string> = { date: day.date };
    for (const [name, percent] of entriesOf(day, grouping)) {
      const target = kept.has(name) ? name : OTHER;
      row[target] = ((row[target] as number | undefined) ?? 0) + percent;
    }
    return row;
  });

  const series = ranked.slice(0, SERIES_LIMIT).map(([name, total]) => ({ name, total }));
  const other = rows.reduce((sum, row) => sum + ((row[OTHER] as number | undefined) ?? 0), 0);
  if (other > 0) series.push({ name: OTHER, total: other });
  return { rows, series };
}

/** Total consumption over the days given, in percent of one weekly limit. */
export const totalUsed = (days: LimitUsageDay[]): number =>
  days.reduce((sum, day) => sum + day.usedPercent, 0);
