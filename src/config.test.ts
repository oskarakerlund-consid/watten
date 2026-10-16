import { describe, expect, it } from "vitest";
import { parseConfig } from "./config";

const UA = { MET_USER_AGENT: "test/1.0" };

describe("parseConfig", () => {
  it("uses defaults when optional vars are missing", () => {
    expect(parseConfig(UA)).toEqual({
      minPriceDiffSekPerKwh: 0.2,
      priceDiffPercent: 20,
      averageWindowHours: 48,
      thunderProbabilityPercent: 20,
      metUserAgent: "test/1.0",
    });
  });

  it("requires the MET User-Agent", () => {
    expect(() => parseConfig({})).toThrow();
  });

  it("converts öre to SEK and accepts numbers given as strings", () => {
    expect(
      parseConfig({ ...UA, MIN_PRICE_DIFF_ORE_PER_KWH: "30", PRICE_DIFF_PERCENT: 10, AVERAGE_WINDOW_HOURS: "24" }),
    ).toMatchObject({ minPriceDiffSekPerKwh: 0.3, priceDiffPercent: 10, averageWindowHours: 24 });
  });

  it.each([
    ["a negative minimum difference", { MIN_PRICE_DIFF_ORE_PER_KWH: -1 }],
    ["a window over 72 hours", { AVERAGE_WINDOW_HOURS: 96 }],
    ["a non-integer window", { AVERAGE_WINDOW_HOURS: 1.5 }],
    ["a non-number", { PRICE_DIFF_PERCENT: "lots" }],
    ["a thunder probability over 100 %", { THUNDER_PROBABILITY_PERCENT: 101 }],
  ])("rejects %s", (_name, vars) => {
    expect(() => parseConfig({ ...UA, ...vars })).toThrow();
  });
});
