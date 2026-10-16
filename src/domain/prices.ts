import type { PriceInterval } from "./types";

/**
 * Time-weighted average price over `[from, to)`.
 * Returns `null` if the intervals do not fully cover the span.
 */
export function averagePrice(intervals: readonly PriceInterval[], from: number, to: number): number | null {
  if (to <= from) return null;

  let covered = 0;
  let weightedSum = 0;
  for (const interval of intervals) {
    const overlap = Math.min(interval.end, to) - Math.max(interval.start, from);
    if (overlap > 0) {
      covered += overlap;
      weightedSum += overlap * interval.sekPerKwh;
    }
  }

  return covered === to - from ? weightedSum / covered : null;
}

export interface PriceWindow {
  start: number;
  end: number;
  averageSekPerKwh: number;
}

/**
 * The cheapest window of `duration` ms that lies entirely within `[from, from + period)`.
 * Candidate windows start at `from` or at an interval boundary after it. Ties go to the earliest window.
 * Returns `null` if no fully covered window fits.
 */
export function cheapestWindow(
  intervals: readonly PriceInterval[],
  from: number,
  duration: number,
  period: number,
): PriceWindow | null {
  if (duration <= 0 || duration > period) return null;

  const latestStart = from + period - duration;
  const starts = [from, ...intervals.map((i) => i.start).filter((s) => s > from && s <= latestStart)].sort(
    (a, b) => a - b,
  );

  let best: PriceWindow | null = null;
  for (const start of starts) {
    const end = start + duration;
    const average = averagePrice(intervals, start, end);
    if (average !== null && (best === null || average < best.averageSekPerKwh)) {
      best = { start, end, averageSekPerKwh: average };
    }
  }
  return best;
}
