import { HOUR_MS } from "./time";

/** Probability of thunder (0–100 %) for the hour starting at `start` (UTC epoch ms). */
export interface ThunderHour {
  start: number;
  probability: number;
}

export interface ThunderAssessment {
  expected: boolean;
  /** Start of the first hour at or above the threshold, or `null` if none. */
  start: number | null;
  /** End of the last hour at or above the threshold, or `null` if none. */
  end: number | null;
  /** Highest probability in the period, in percent. */
  maxProbability: number;
}

/**
 * Assesses whether thunder is expected from `now` until `hoursAhead` hours later: true if any forecast hour
 * overlapping that period has a probability at or above `thresholdPercent`.
 * Returns `null` if the forecast does not cover the whole period.
 */
export function assessThunder(
  hours: readonly ThunderHour[],
  now: number,
  hoursAhead: number,
  thresholdPercent: number,
): ThunderAssessment | null {
  const until = now + hoursAhead * HOUR_MS;
  const relevant = hours.filter((h) => h.start < until && h.start + HOUR_MS > now).sort((a, b) => a.start - b.start);

  // The hours must cover [now, until) without gaps.
  if (relevant.length === 0 || relevant[0]!.start > now) return null;
  let covered = now;
  for (const hour of relevant) {
    if (hour.start > covered) return null;
    covered = Math.max(covered, hour.start + HOUR_MS);
  }
  if (covered < until) return null;

  const above = relevant.filter((h) => h.probability >= thresholdPercent);
  return {
    expected: above.length > 0,
    start: above[0]?.start ?? null,
    end: above.length > 0 ? above.at(-1)!.start + HOUR_MS : null,
    maxProbability: Math.max(...relevant.map((h) => h.probability)),
  };
}
