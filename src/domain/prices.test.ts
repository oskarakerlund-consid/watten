import { describe, expect, it } from "vitest";
import { averagePrice, cheapestWindow } from "./prices";
import { HOUR_MS, MINUTE_MS } from "./time";
import type { PriceInterval } from "./types";

const QUARTER_MS = 15 * MINUTE_MS;
const T0 = Date.UTC(2026, 9, 16, 0);

/** Consecutive quarter-hour intervals starting at T0 with the given prices. */
function quarters(prices: number[]): PriceInterval[] {
  return prices.map((sekPerKwh, i) => ({
    start: T0 + i * QUARTER_MS,
    end: T0 + (i + 1) * QUARTER_MS,
    sekPerKwh,
  }));
}

/** Consecutive hours, each as four equal quarter-hour intervals. */
function hours(prices: number[]): PriceInterval[] {
  return quarters(prices.flatMap((p) => [p, p, p, p]));
}

describe("averagePrice", () => {
  it("averages whole intervals", () => {
    expect(averagePrice(quarters([1, 2, 3, 4]), T0, T0 + HOUR_MS)).toBe(2.5);
  });

  it("weights partially covered intervals by overlap", () => {
    // Half of the first quarter (price 1) and all of the second (price 4): (0.5 * 1 + 1 * 4) / 1.5 = 3
    expect(averagePrice(quarters([1, 4]), T0 + QUARTER_MS / 2, T0 + 2 * QUARTER_MS)).toBe(3);
  });

  it("handles hourly intervals (data before 2025-10-01)", () => {
    const hourly: PriceInterval[] = [
      { start: T0, end: T0 + HOUR_MS, sekPerKwh: 1 },
      { start: T0 + HOUR_MS, end: T0 + 2 * HOUR_MS, sekPerKwh: 3 },
    ];
    expect(averagePrice(hourly, T0 + 30 * MINUTE_MS, T0 + 90 * MINUTE_MS)).toBe(2);
  });

  it("returns null when the span is not fully covered", () => {
    const withGap = [...quarters([1]), ...quarters([1, 1, 1]).slice(2)];
    expect(averagePrice(withGap, T0, T0 + HOUR_MS)).toBeNull();
    expect(averagePrice(quarters([1, 1]), T0, T0 + HOUR_MS)).toBeNull();
  });

  it("returns null for an empty span", () => {
    expect(averagePrice(quarters([1]), T0, T0)).toBeNull();
  });

  it("handles negative prices", () => {
    expect(averagePrice(quarters([-1, -3]), T0, T0 + 2 * QUARTER_MS)).toBe(-2);
  });
});

describe("cheapestWindow", () => {
  it("finds the cheapest 2-hour window within 8 hours", () => {
    const prices = hours([5, 4, 3, 1, 1, 6, 7, 8, 0]);
    expect(cheapestWindow(prices, T0, 2 * HOUR_MS, 8 * HOUR_MS)).toEqual({
      start: T0 + 3 * HOUR_MS,
      end: T0 + 5 * HOUR_MS,
      averageSekPerKwh: 1,
    });
  });

  it("does not use prices outside the period", () => {
    // The 0-priced hour 8 is outside an 8-hour period starting at T0.
    const prices = hours([5, 5, 5, 5, 5, 5, 5, 5, 0, 0]);
    expect(cheapestWindow(prices, T0, 2 * HOUR_MS, 8 * HOUR_MS)?.averageSekPerKwh).toBe(5);
  });

  it("can start on a quarter-hour boundary", () => {
    const prices = quarters([9, 1, 1, 1, 1, 1, 1, 1, 1, 9, 9, 9]);
    expect(cheapestWindow(prices, T0, 2 * HOUR_MS, 3 * HOUR_MS)?.start).toBe(T0 + QUARTER_MS);
  });

  it("can start now, in the middle of an interval", () => {
    const now = T0 + 5 * MINUTE_MS;
    const prices = quarters([1, 1, 1, 1, 1, 9, 9, 9, 9, 9, 9, 9]);
    const window = cheapestWindow(prices, now, HOUR_MS, 2 * HOUR_MS);
    expect(window?.start).toBe(now);
    expect(window?.end).toBe(now + HOUR_MS);
  });

  it("prefers the earliest window on ties", () => {
    const prices = hours([2, 2, 2, 2]);
    expect(cheapestWindow(prices, T0, HOUR_MS, 4 * HOUR_MS)?.start).toBe(T0);
  });

  it("only considers fully covered windows", () => {
    // Prices are only known for 3 hours of an 8-hour period.
    const prices = hours([3, 1, 2]);
    expect(cheapestWindow(prices, T0, 2 * HOUR_MS, 8 * HOUR_MS)).toEqual({
      start: T0 + HOUR_MS,
      end: T0 + 3 * HOUR_MS,
      averageSekPerKwh: 1.5,
    });
  });

  it("returns null when no window fits", () => {
    expect(cheapestWindow(hours([1]), T0, 2 * HOUR_MS, 8 * HOUR_MS)).toBeNull();
    expect(cheapestWindow(hours([1, 1, 1]), T0, 3 * HOUR_MS, 2 * HOUR_MS)).toBeNull();
    expect(cheapestWindow([], T0, HOUR_MS, 8 * HOUR_MS)).toBeNull();
  });

  it("works across the day summer time ends", () => {
    // 2026-10-25 local day has 100 quarter-hours.
    const start = Date.UTC(2026, 9, 24, 22);
    const prices: PriceInterval[] = Array.from({ length: 100 }, (_, i) => ({
      start: start + i * QUARTER_MS,
      end: start + (i + 1) * QUARTER_MS,
      sekPerKwh: i >= 96 ? 0 : 1,
    }));
    expect(cheapestWindow(prices, start, HOUR_MS, 25 * HOUR_MS)?.start).toBe(start + 24 * HOUR_MS);
  });
});
