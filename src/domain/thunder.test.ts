import { describe, expect, it } from "vitest";
import { assessThunder, type ThunderHour } from "./thunder";
import { HOUR_MS } from "./time";

const T0 = Date.UTC(2026, 6, 15, 12); // 14:00 Swedish summer time

/** Hourly forecast starting at T0 with the given probabilities. */
const forecast = (probabilities: number[]): ThunderHour[] =>
  probabilities.map((probability, h) => ({ start: T0 + h * HOUR_MS, probability }));

describe("assessThunder", () => {
  it("reports no thunder when every hour is below the threshold", () => {
    expect(assessThunder(forecast([1, 5, 19, 2, 0, 0, 0, 0]), T0, 8, 20)).toEqual({
      expected: false,
      start: null,
      end: null,
      maxProbability: 19,
    });
  });

  it("reports the span from the first to the last hour at or above the threshold", () => {
    expect(assessThunder(forecast([0, 5, 20, 45, 10, 30, 0, 0]), T0, 8, 20)).toEqual({
      expected: true,
      start: T0 + 2 * HOUR_MS,
      end: T0 + 6 * HOUR_MS,
      maxProbability: 45,
    });
  });

  it("ignores hours after the period", () => {
    expect(assessThunder(forecast([0, 0, 0, 0, 90]), T0, 4, 20)?.expected).toBe(false);
  });

  it("includes the current hour when now is in the middle of it", () => {
    const result = assessThunder(forecast([50, 0, 0]), T0 + 30 * 60_000, 2, 20);
    expect(result).toMatchObject({ expected: true, start: T0 });
  });

  it("returns null when the forecast does not cover the period", () => {
    expect(assessThunder(forecast([0, 0, 0]), T0, 8, 20)).toBeNull();
    expect(assessThunder(forecast([0, 0, 0]).slice(1), T0, 2, 20)).toBeNull();
    expect(assessThunder([...forecast([0]), ...forecast([0, 0, 0]).slice(2)], T0, 3, 20)).toBeNull();
    expect(assessThunder([], T0, 1, 20)).toBeNull();
  });

  it("does not depend on the order of the hours", () => {
    expect(assessThunder(forecast([0, 30, 0]).reverse(), T0, 3, 20)).toMatchObject({ start: T0 + HOUR_MS });
  });
});
