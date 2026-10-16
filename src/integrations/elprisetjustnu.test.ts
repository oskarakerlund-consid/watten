import { describe, expect, it } from "vitest";
import fallBackDay from "../../test/fixtures/elprisetjustnu/2025-10-26_SE3.json";
import hourlyDay from "../../test/fixtures/elprisetjustnu/2025-09-30_SE3.json";
import springForwardDay from "../../test/fixtures/elprisetjustnu/2026-03-29_SE3.json";
import normalDay from "../../test/fixtures/elprisetjustnu/2026-10-15_SE3.json";
import { stockholmDayBounds } from "../domain/time";
import type { LocalDate } from "../domain/types";
import { dayPricesUrl, fetchDayPrices } from "./elprisetjustnu";
import type { HttpFetcher } from "./http";

const respondWith =
  (body: unknown, status = 200): HttpFetcher =>
  async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

async function fetchOk(body: unknown, date: LocalDate) {
  const result = await fetchDayPrices(respondWith(body), "SE3", date);
  if (result.status !== "ok") throw new Error("expected ok");
  return result.intervals;
}

describe("dayPricesUrl", () => {
  it("zero-pads month and day", () => {
    expect(dayPricesUrl("SE1", { year: 2026, month: 3, day: 9 })).toBe(
      "https://www.elprisetjustnu.se/api/v1/prices/2026/03-09_SE1.json",
    );
  });
});

describe("fetchDayPrices", () => {
  it("requests the URL for the zone and date", async () => {
    const requested: string[] = [];
    await fetchDayPrices(
      async (url) => {
        requested.push(url);
        return new Response(JSON.stringify(normalDay));
      },
      "SE3",
      { year: 2026, month: 10, day: 15 },
    );
    expect(requested).toEqual(["https://www.elprisetjustnu.se/api/v1/prices/2026/10-15_SE3.json"]);
  });

  it("maps a normal day to 96 quarter-hours covering the local day", async () => {
    const date = { year: 2026, month: 10, day: 15 };
    const intervals = await fetchOk(normalDay, date);
    const { start, end } = stockholmDayBounds(date);

    expect(intervals).toHaveLength(96);
    expect(intervals[0]).toEqual({ start, end: start + 15 * 60_000, sekPerKwh: 1.14724 });
    expect(intervals.at(-1)?.end).toBe(end);
  });

  it.each([
    ["spring forward", springForwardDay, { year: 2026, month: 3, day: 29 }, 92],
    ["fall back", fallBackDay, { year: 2025, month: 10, day: 26 }, 100],
    ["hourly data before 2025-10-01", hourlyDay, { year: 2025, month: 9, day: 30 }, 24],
  ])("covers the whole local day on %s", async (_name, body, date, count) => {
    const intervals = await fetchOk(body, date);
    const { start, end } = stockholmDayBounds(date);

    expect(intervals).toHaveLength(count);
    expect(intervals[0]?.start).toBe(start);
    expect(intervals.at(-1)?.end).toBe(end);
    intervals.slice(1).forEach((interval, i) => expect(interval.start).toBe(intervals[i]?.end));
  });

  it("returns not-available when the day is not published yet", async () => {
    const result = await fetchDayPrices(
      respondWith("<p>404: Data not found or not ready yet</p>", 404),
      "SE3",
      { year: 2026, month: 10, day: 30 },
    );
    expect(result).toEqual({ status: "not-available" });
  });

  it("throws on other HTTP errors", async () => {
    await expect(fetchDayPrices(respondWith("oops", 500), "SE3", { year: 2026, month: 10, day: 15 })).rejects.toThrow(
      "responded 500",
    );
  });

  it.each([
    ["an empty list", []],
    ["a missing price", [{ time_start: "2026-10-15T00:00:00+02:00", time_end: "2026-10-15T00:15:00+02:00" }]],
    ["a timestamp without offset", [{ SEK_per_kWh: 1, time_start: "2026-10-15T00:00:00", time_end: "2026-10-15T00:15:00" }]],
    ["an interval ending before it starts", [{ SEK_per_kWh: 1, time_start: "2026-10-15T00:15:00+02:00", time_end: "2026-10-15T00:00:00+02:00" }]],
  ])("throws on %s", async (_name, body) => {
    await expect(fetchDayPrices(respondWith(body), "SE3", { year: 2026, month: 10, day: 15 })).rejects.toThrow();
  });
});
