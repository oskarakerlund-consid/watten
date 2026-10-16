import { describe, expect, it } from "vitest";
import { classifyPrice } from "./classify";
import { HOUR_MS } from "./time";
import type { PriceInterval } from "./types";

const NOW = Date.UTC(2026, 9, 16, 12);
const SETTINGS = { minPriceDiffSekPerKwh: 0.5, priceDiffPercent: 20, averageWindowHours: 48 };

/** Hourly intervals: `history` covers the 48 h before NOW at one price, then `upcoming` hours from NOW. */
function series(historyPrice: number, upcoming: number[]): PriceInterval[] {
  const intervals: PriceInterval[] = [];
  for (let h = -48; h < 0; h++) {
    intervals.push({ start: NOW + h * HOUR_MS, end: NOW + (h + 1) * HOUR_MS, sekPerKwh: historyPrice });
  }
  upcoming.forEach((sekPerKwh, h) => intervals.push({ start: NOW + h * HOUR_MS, end: NOW + (h + 1) * HOUR_MS, sekPerKwh }));
  return intervals;
}

describe("classifyPrice", () => {
  it("is normal on a flat price", () => {
    expect(classifyPrice(series(1, [1]), NOW, SETTINGS)).toEqual({
      level: "normal",
      currentSekPerKwh: 1,
      averageSekPerKwh: 1,
      thresholdSekPerKwh: 0.5,
    });
  });

  it("is expensive or cheap beyond the absolute minimum", () => {
    expect(classifyPrice(series(1, [1.51]), NOW, SETTINGS)?.level).toBe("expensive");
    expect(classifyPrice(series(1, [0.49]), NOW, SETTINGS)?.level).toBe("cheap");
  });

  it("is normal at exactly the threshold", () => {
    expect(classifyPrice(series(1, [1.5]), NOW, SETTINGS)?.level).toBe("normal");
  });

  it("uses the percentage when it is larger than the absolute minimum", () => {
    // 20 % of 4 SEK = 0.8 SEK > 0.5 SEK.
    const status = classifyPrice(series(4, [4.7]), NOW, SETTINGS);
    expect(status?.thresholdSekPerKwh).toBeCloseTo(0.8);
    expect(status?.level).toBe("normal");
    expect(classifyPrice(series(4, [4.9]), NOW, SETTINGS)?.level).toBe("expensive");
  });

  it("uses the absolute minimum when the average is near zero or negative", () => {
    expect(classifyPrice(series(0, [0.3]), NOW, SETTINGS)?.level).toBe("normal");
    expect(classifyPrice(series(-0.2, [-0.8]), NOW, SETTINGS)?.level).toBe("cheap");
    expect(classifyPrice(series(-0.2, [0.4]), NOW, SETTINGS)?.level).toBe("expensive");
  });

  it("averages the next hour, not just the current interval", () => {
    // Now is mid-hour: half an hour at 3 and half an hour at 1 gives 2, which is expensive versus 1.
    const now = NOW + HOUR_MS / 2;
    const intervals = series(1, [1, 3, 1]);
    expect(classifyPrice(intervals, now, { ...SETTINGS, averageWindowHours: 1 })?.currentSekPerKwh).toBe(2);
  });

  it("returns null when the next hour or the history is incomplete", () => {
    expect(classifyPrice(series(1, []), NOW, SETTINGS)).toBeNull();
    expect(classifyPrice(series(1, [1]).slice(1), NOW, SETTINGS)).toBeNull();
  });

  it("respects the configured window length", () => {
    // The last 24 h are at 2, the 24 h before at 0: a 24 h window sees average 2, a 48 h window sees 1.
    const intervals = series(0, [2]).map((i) => (i.start >= NOW - 24 * HOUR_MS ? { ...i, sekPerKwh: 2 } : i));
    expect(classifyPrice(intervals, NOW, { ...SETTINGS, averageWindowHours: 24 })?.averageSekPerKwh).toBe(2);
    expect(classifyPrice(intervals, NOW, SETTINGS)?.averageSekPerKwh).toBe(1);
  });
});
