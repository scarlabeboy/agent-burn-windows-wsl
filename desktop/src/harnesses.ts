/** Every harness the Agent Burn CLI can read (`--agents`). */
export const SUPPORTED_HARNESSES = [
  "amp",
  "claude",
  "codebuff",
  "codex",
  "copilot",
  "cursor",
  "droid",
  "gemini",
  "goose",
  "hermes",
  "kilo",
  "kimi",
  "openclaw",
  "opencode",
  "pi",
  "qwen",
];

/** Harnesses sold as a subscription: listed apart in the side bar. */
export const SUBSCRIPTIONS = ["codex", "claude", "cursor"];

/** Only "off" exists for now; a table leaves room for other states later. */
export type HarnessState = "off";
export type HarnessStates = Record<string, HarnessState>;

export const disabledHarnesses = (states: HarnessStates): string[] =>
  Object.keys(states)
    .filter((id) => states[id] === "off")
    .sort();

/**
 * The harness list to scan, or undefined to scan everything. It is every known harness except
 * the disabled ones, so a harness the app has never seen is still picked up.
 */
export function scanAgents(disabled: string[], seen: string[]): string[] | undefined {
  if (disabled.length === 0) return undefined;
  const all = new Set([...SUPPORTED_HARNESSES, ...seen]);
  // The settings never allow disabling the last active harness, so this is never empty.
  return [...all].filter((id) => /^[a-z]+$/.test(id) && !disabled.includes(id)).sort();
}

export interface HarnessGroups {
  active: string[];
  disabled: string[];
  undetected: string[];
}

export function groupHarnesses(detected: string[], seen: string[], disabled: string[]): HarnessGroups {
  const known = new Set([...seen, ...detected]);
  const off = new Set(disabled);
  const active = [...known].filter((id) => !off.has(id)).sort();
  const undetected = SUPPORTED_HARNESSES.filter((id) => !known.has(id) && !off.has(id));
  return { active, disabled: [...off].sort(), undetected };
}
