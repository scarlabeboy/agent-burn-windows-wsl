/**
 * Quota readings can be wrong: a provider sometimes serves a higher usage than it enforces
 * (Agent Burn's macOS app saw Codex report 99 % while enforcing 49 %). The rules here come from
 * its `QuotaHistory.swift` and are applied when a series is read, never when it is saved, so
 * the stored readings stay as they were measured.
 */

export interface Sample {
  t: number;
  used: number;
}

/** Readings this close to the newest one confirm or contradict it. */
const RECENT_MS = 30 * 60_000;
/** Only a weekly window is too slow to roughly double within half an hour. */
const WEEKLY_MINUTES = 2 * 24 * 60;

/**
 * Weekly usage cannot jump far above the lowest recent reading: it is an unconfirmed over-count.
 * The macOS app allows 3 points over half as much again; near 0 that held back real use (1 to 7 %
 * in half an hour), so 10 points are allowed here. 49 to 99 % is still held back.
 */
const isOverCount = (used: number, floor: number, windowMinutes: number): boolean =>
  windowMinutes >= WEEKLY_MINUTES && used > floor * 1.5 + 10;

/** The samples of the newest reading's last half hour, newest first. */
function recentSamples(samples: Sample[]): Sample[] {
  const newest = samples[samples.length - 1];
  const recent: Sample[] = [];
  for (let index = samples.length - 1; index >= 0; index--) {
    if (newest.t - samples[index].t > RECENT_MS) break;
    recent.push(samples[index]);
  }
  return recent;
}

/**
 * The samples of one cycle without the provider's over-counts, oldest first.
 *
 * Usage never falls inside one cycle, so a sample above a later, lower one was an over-count.
 * A jump at the very end that no later reading confirms yet is held back the same way, until
 * half an hour passes without a lower reading.
 */
export function consistentSamples(samples: Sample[], windowMinutes: number): Sample[] {
  const kept: Sample[] = [];
  let lowestLater = Infinity;
  for (let index = samples.length - 1; index >= 0; index--) {
    const sample = samples[index];
    if (sample.used > lowestLater + 1) continue;
    lowestLater = Math.min(lowestLater, sample.used);
    kept.push(sample);
  }
  kept.reverse();
  if (kept.length === 0) return kept;
  const floor = Math.min(...recentSamples(kept).map((sample) => sample.used));
  while (kept.length > 0 && isOverCount(kept[kept.length - 1].used, floor, windowMinutes)) {
    kept.pop();
  }
  return kept;
}

/**
 * The usage to show now, given the cycle's samples with the newest reading last. It is the
 * newest recent reading that is not an unconfirmed over-count, or the newest one if all are.
 */
export function currentUsed(samples: Sample[], windowMinutes: number): number | undefined {
  if (samples.length === 0) return undefined;
  const recent = recentSamples(samples);
  const floor = Math.min(...recent.map((sample) => sample.used));
  return (recent.find((sample) => !isOverCount(sample.used, floor, windowMinutes)) ?? recent[0]).used;
}
