/**
 * How much of a weekly limit each day used, worked out from the app's own quota readings, for a
 * harness whose provider gives no daily figures (Claude). Less precise than Codex's dashboard:
 * while the app is closed nothing is read, and what was used in the meantime is counted on the
 * day of the next reading, marked as approximate.
 */
import type { Cycle } from "./archive";
import { isoDate } from "./periods";

export interface LimitDay {
  /** `YYYY-MM-DD`, local time. */
  date: string;
  /** Used between two readings of that same day. */
  measured: number;
  /** Used since a reading of an earlier day, or since a reset of an earlier day. */
  approx: number;
  /** At least one reading that day: a day without any is unknown, not unused. */
  read: boolean;
}

const dayOf = (ms: number) => isoDate(new Date(ms));

/** The last `days` days up to `nowMs`, from the first day read. */
export function limitDays(cycles: Cycle[], nowMs: number, days = 30): LimitDay[] {
  const byDay = new Map<string, LimitDay>();
  const entry = (date: string) => {
    let day = byDay.get(date);
    if (!day) {
      day = { date, measured: 0, approx: 0, read: false };
      byDay.set(date, day);
    }
    return day;
  };
  let previous: { t: number; used: number; cycle: number } | null = null;
  cycles.forEach((cycle, index) => {
    for (const sample of cycle.samples) {
      const day = entry(dayOf(sample.t));
      day.read = true;
      const sameCycle = previous !== null && previous.cycle === index;
      const from = sameCycle && previous ? previous.t : cycle.startMs;
      const used = Math.max(0, sample.used - (sameCycle && previous ? previous.used : 0));
      // The first reading of all says nothing about when its usage happened, unless the cycle
      // started that same day: it is the starting point, not a day's use.
      if (previous !== null || dayOf(from) === day.date) {
        if (dayOf(from) === day.date) day.measured += used;
        else day.approx += used;
      }
      previous = { t: sample.t, used: sample.used, cycle: index };
    }
  });
  const readDays = [...byDay.keys()].sort();
  if (readDays.length === 0) return [];
  const today = new Date(nowMs);
  const result: LimitDay[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset));
    if (date < readDays[0]) continue;
    result.push(byDay.get(date) ?? { date, measured: 0, approx: 0, read: false });
  }
  return result;
}
