import { CLI_FAILED, CLI_MISSING } from "./api";
import { t } from "./i18n";

/**
 * A read's error in the interface language. The messages come from the Rust side (`cli.rs`,
 * `sources.rs`) in English; the page shows a short sentence instead, and keeps the original for
 * a tooltip, so a reported problem can still be traced.
 */
export function errorText(message: string): string {
  const text = t().errors;
  if (message.includes(CLI_MISSING)) return t().status.cliMissing;
  if (message.includes("agent-burn timed out")) return text.timedOut;
  if (message.includes(CLI_FAILED)) return text.cliFailed;
  if (message.startsWith("could not start agent-burn")) return text.cliStart;
  if (message.includes("output is too large") || message.includes("unsupported report")) return text.badReport;
  if (message.includes("WSL could not be listed")) return text.wslSilent;
  if (/^WSL distribution '.*' is stopped$/.test(message)) return text.distroStopped;
  if (/^WSL distribution '.*' is unavailable$/.test(message)) return text.distroMissing;
  return text.unexpected;
}
