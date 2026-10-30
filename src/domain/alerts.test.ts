import { describe, expect, it } from "vitest";
import { alreadySent, duePriceAlert, dueThunderAlert, isPriceQuietTime } from "./alerts";
import { HOUR_MS, MINUTE_MS } from "./time";
import type { PriceInterval } from "./types";

const SETTINGS = { minPriceDiffSekPerKwh: 0.2, priceDiffPercent: 20, averageWindowHours: 48 };
const QUARTER = 15 * MINUTE_MS;

/** Quarter-hour intervals from `start`, one price per hour. */
function hourly(start: number, prices: number[]): PriceInterval[] {
  return prices.flatMap((sekPerKwh, h) =>
    [0, 1, 2, 3].map((q) => ({ start: start + (h * 4 + q) * QUARTER, end: start + (h * 4 + q + 1) * QUARTER, sekPerKwh })),
  );
}

/** 50 hours at 1 SEK/kWh before `jump` (covers the 48-hour average from earlier quarter-hours), then `after` for three hours. */
const pricesJumpingAt = (jump: number, after: number) => [
  ...hourly(jump - 50 * HOUR_MS, Array(50).fill(1)),
  ...hourly(jump, [after, after, after]),
];

// 2026-10-30 is winter time (UTC+1): 17:00 Swedish time is 16:00 UTC.
const JUMP_WINTER = Date.UTC(2026, 9, 30, 16);

describe("duePriceAlert", () => {
  it("alerts when an expensive period starts within the hour", () => {
    // The 1-hour-ahead classification turns expensive at 16:15 Swedish time.
    const alert = duePriceAlert("SE3", pricesJumpingAt(JUMP_WINTER, 3), JUMP_WINTER - 60 * MINUTE_MS, SETTINGS);
    expect(alert).toEqual({
      kind: "expensive",
      start: JUMP_WINTER - 45 * MINUTE_MS,
      title: "Dyr el från ca 16:15",
      body: "SE3: ca 1,50 kr/kWh, jämfört med snittet 1,00 kr/kWh.",
    });
  });

  it("alerts for cheap periods", () => {
    // 1 → 0.2 SEK/kWh: the hour ahead first falls more than 0.2 below the average at 16:30.
    const alert = duePriceAlert("SE4", pricesJumpingAt(JUMP_WINTER, 0.2), JUMP_WINTER - 50 * MINUTE_MS, SETTINGS);
    expect(alert).toMatchObject({ kind: "cheap", title: "Billig el från ca 16:30" });
  });

  it("does not alert more than an hour ahead", () => {
    expect(duePriceAlert("SE3", pricesJumpingAt(JUMP_WINTER, 3), JUMP_WINTER - 106 * MINUTE_MS, SETTINGS)).toBeNull();
  });

  it("does not alert for a period that has already started", () => {
    expect(duePriceAlert("SE3", pricesJumpingAt(JUMP_WINTER, 3), JUMP_WINTER + 5 * MINUTE_MS, SETTINGS)).toBeNull();
  });

  it("does not alert when prices stay normal", () => {
    expect(duePriceAlert("SE3", pricesJumpingAt(JUMP_WINTER, 1.1), JUMP_WINTER - 30 * MINUTE_MS, SETTINGS)).toBeNull();
  });

  it("does not alert without prices", () => {
    expect(duePriceAlert("SE3", [], JUMP_WINTER - 30 * MINUTE_MS, SETTINGS)).toBeNull();
  });

  it("formats the time in summer time", () => {
    // 2026-07-15 17:00 Swedish summer time (UTC+2) is 15:00 UTC.
    const jump = Date.UTC(2026, 6, 15, 15);
    expect(duePriceAlert("SE3", pricesJumpingAt(jump, 3), jump - HOUR_MS, SETTINGS)?.title).toBe("Dyr el från ca 16:15");
  });

  it("stays quiet at night", () => {
    // 02:00 Swedish time, alert would be due at 01:15.
    const jump = Date.UTC(2026, 9, 30, 1);
    expect(duePriceAlert("SE3", pricesJumpingAt(jump, 0.2), jump - HOUR_MS, SETTINGS)).toBeNull();
  });
});

describe("isPriceQuietTime", () => {
  it.each([
    [Date.UTC(2026, 9, 30, 20, 59), false], // 21:59 winter time
    [Date.UTC(2026, 9, 30, 21, 0), true], // 22:00
    [Date.UTC(2026, 9, 30, 5, 59), true], // 06:59
    [Date.UTC(2026, 9, 30, 6, 0), false], // 07:00
    [Date.UTC(2026, 6, 15, 5, 0), false], // 07:00 summer time
    [Date.UTC(2026, 6, 15, 4, 59), true], // 06:59 summer time
  ])("at %i is %s", (now, quiet) => {
    expect(isPriceQuietTime(now)).toBe(quiet);
  });
});

describe("dueThunderAlert", () => {
  const NOW = Date.UTC(2026, 6, 15, 12, 7); // 14:07 summer time
  const forecast = (probabilities: number[]) =>
    probabilities.map((probability, h) => ({ start: Date.UTC(2026, 6, 15, 12) + h * HOUR_MS, probability }));

  it("alerts when thunder is expected within two hours", () => {
    expect(dueThunderAlert(forecast([0, 0, 35, 0]), NOW, 20)).toEqual({
      kind: "thunder",
      start: Date.UTC(2026, 6, 15, 14),
      title: "Åska väntas från ca 16:00",
      body: "Upp till 35 % risk. Undvik att ladda elbilen och att använda känslig elektronik.",
    });
  });

  it("says now when the thunder hour has started", () => {
    expect(dueThunderAlert(forecast([22.6, 0, 0]), NOW, 20)).toMatchObject({ title: "Åska väntas nu", body: expect.stringContaining("23 %") });
  });

  it("does not alert for thunder later than two hours ahead", () => {
    expect(dueThunderAlert(forecast([0, 0, 0, 80]), NOW, 20)).toBeNull();
  });

  it("does not alert below the threshold or without a forecast", () => {
    expect(dueThunderAlert(forecast([10, 15, 19, 0]), NOW, 20)).toBeNull();
    expect(dueThunderAlert([], NOW, 20)).toBeNull();
  });
});

describe("alreadySent", () => {
  const alert = { kind: "expensive" as const, start: JUMP_WINTER, title: "", body: "" };

  it("matches the same kind within the cooldown", () => {
    expect(alreadySent(alert, [{ kind: "expensive", start: JUMP_WINTER }])).toBe(true);
    expect(alreadySent(alert, [{ kind: "expensive", start: JUMP_WINTER - 2 * HOUR_MS }])).toBe(true);
  });

  it("ignores other kinds and alerts outside the cooldown", () => {
    expect(alreadySent(alert, [{ kind: "cheap", start: JUMP_WINTER }])).toBe(false);
    expect(alreadySent(alert, [{ kind: "expensive", start: JUMP_WINTER - 3 * HOUR_MS }])).toBe(false);
  });
});
