import { averagePrice } from "./prices";
import { HOUR_MS } from "./time";
import type { PriceInterval } from "./types";

export type PriceLevel = "cheap" | "normal" | "expensive";

export interface ClassificationSettings {
  minPriceDiffSekPerKwh: number;
  priceDiffPercent: number;
  averageWindowHours: number;
}

export interface PriceStatus {
  level: PriceLevel;
  /** Average price from now to one hour ahead. */
  currentSekPerKwh: number;
  /** Average price over the trailing window. */
  averageSekPerKwh: number;
  /** How far from the average the current price must be to count as cheap or expensive. */
  thresholdSekPerKwh: number;
}

/**
 * Classifies the price from `now` to one hour ahead relative to the average over the trailing window.
 * It is cheap or expensive only if it differs from the average by more than both the absolute minimum and the
 * percentage of the average. Returns `null` if prices are missing for either span.
 */
export function classifyPrice(
  intervals: readonly PriceInterval[],
  now: number,
  settings: ClassificationSettings,
): PriceStatus | null {
  const current = averagePrice(intervals, now, now + HOUR_MS);
  const average = averagePrice(intervals, now - settings.averageWindowHours * HOUR_MS, now);
  if (current === null || average === null) return null;

  const threshold = Math.max(settings.minPriceDiffSekPerKwh, (settings.priceDiffPercent / 100) * Math.abs(average));
  const diff = current - average;
  const level: PriceLevel = diff > threshold ? "expensive" : diff < -threshold ? "cheap" : "normal";

  return { level, currentSekPerKwh: current, averageSekPerKwh: average, thresholdSekPerKwh: threshold };
}
