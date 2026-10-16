import { describe, expect, it } from "vitest";
import { parseConfig } from "./config";

describe("parseConfig", () => {
  it("uses defaults when vars are missing", () => {
    expect(parseConfig({})).toEqual({ minPriceDiffSekPerKwh: 0.5, priceDiffPercent: 20, averageWindowHours: 48 });
  });

  it("converts öre to SEK and accepts numbers given as strings", () => {
    expect(parseConfig({ MIN_PRICE_DIFF_ORE_PER_KWH: "30", PRICE_DIFF_PERCENT: 10, AVERAGE_WINDOW_HOURS: "24" })).toEqual({
      minPriceDiffSekPerKwh: 0.3,
      priceDiffPercent: 10,
      averageWindowHours: 24,
    });
  });

  it.each([
    ["a negative minimum difference", { MIN_PRICE_DIFF_ORE_PER_KWH: -1 }],
    ["a window over 72 hours", { AVERAGE_WINDOW_HOURS: 96 }],
    ["a non-integer window", { AVERAGE_WINDOW_HOURS: 1.5 }],
    ["a non-number", { PRICE_DIFF_PERCENT: "lots" }],
  ])("rejects %s", (_name, vars) => {
    expect(() => parseConfig(vars)).toThrow();
  });
});
