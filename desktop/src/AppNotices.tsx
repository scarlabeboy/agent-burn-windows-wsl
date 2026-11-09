import { useMemo, useSyncExternalStore } from "react";
import { getVersion, subscribe, weeklyCycles } from "./archive";
import { errorText } from "./errors";
import { t } from "./i18n";
import { LimitUsageChart, ReadingLimitChart } from "./LimitUsageChart";
import { limitDays } from "./limitDays";
import type { LimitUsageDay } from "./limitUsage";
import { isoDate } from "./periods";
import type { SourceState, TabId } from "./types";
import { useNow } from "./useNow";
import { agentColor, agentLabel } from "./views";

/** The weekly Claude limit per day from the app's own readings, or the reason there is none. */
export function ReadingLimitSection({ offReason }: { offReason?: string }) {
  const archiveVersion = useSyncExternalStore(subscribe, getVersion);
  const nowMs = useNow(60_000);
  const today = isoDate(new Date(nowMs));
  const days = useMemo(() => limitDays(weeklyCycles("claude"), nowMs), [archiveVersion, today]);
  if (offReason) return <div className="notice">{offReason}</div>;
  return <ReadingLimitChart days={days} color={agentColor("claude")} />;
}

/** The weekly Codex limit per day, or the reason there is none to show. */
export function LimitUsageSection({
  offReason,
  best,
  attempted,
  label,
}: {
  offReason?: string;
  best?: { id: string; days: LimitUsageDay[] };
  attempted: boolean;
  label: (id: string) => string;
}) {
  if (offReason) return <div className="notice">{offReason}</div>;
  if (best) return <LimitUsageChart days={best.days} where={label(best.id)} />;
  return <div className="notice">{attempted ? t().app.limitUsageUnread : t().app.limitUsageLoading}</div>;
}

/** Why a harness page has no quota, in the words of the open tab; `cause` when the app knows it. */
function quotaMissing(harness: string, tab: TabId, wslRunning: boolean, cause?: string): string {
  const name = agentLabel(harness);
  const text = t().app;
  if (tab === "wsl" && !wslRunning) return text.quotaWslOff(name);
  const where = text.quotaWhere[tab];
  if (cause) return text.quotaReadFailed(name, where, errorText(cause));
  return harness === "claude" ? text.quotaMissingClaude(name, where) : text.quotaMissingCodex(name, where);
}

/** `quotaMissing` as a notice, with the CLI's own message on hover when there is one. */
export function QuotaMissing({ harness, tab, wslRunning, cause }: {
  harness: string;
  tab: TabId;
  wslRunning: boolean;
  cause?: string;
}) {
  return (
    <div className="notice" title={cause}>
      {quotaMissing(harness, tab, wslRunning, cause)}
    </div>
  );
}

export const noUsage = (tokens: number, cost: number) => tokens === 0 && cost === 0;

/** A chosen period without any usage, instead of a page of zeros. */
export function EmptyPeriod({ period, harness }: { period: string; harness?: string }) {
  return <div className="notice">{t().app.emptyPeriod(period, harness)}</div>;
}

/** A source still being read, or its read error with the app's own errors in the interface language. */
export function Pending({ state, label }: { state: SourceState | undefined; label: string }) {
  if (state?.status === "error") {
    return (
      <div className="notice error" title={state.message}>
        <strong>{t().app.readFailed(label.charAt(0).toUpperCase() + label.slice(1))}</strong>{" "}
        {errorText(state.message)}
      </div>
    );
  }
  return <div className="notice">{t().app.reading(label)}</div>;
}
