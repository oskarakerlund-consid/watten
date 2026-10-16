import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { loadIntervals } from "../db/prices";
import { stockholmDayBounds } from "../domain/time";
import { dayPricesUrl, type Fetcher } from "../integrations/elprisetjustnu";
import { ingestPrices } from "./ingestPrices";

// 2026-10-16 12:00 Swedish time. History starts 2026-10-14, tomorrow is 2026-10-17.
const NOW = Date.UTC(2026, 9, 16, 10);
const DAYS = [
  { year: 2026, month: 10, day: 14 },
  { year: 2026, month: 10, day: 15 },
  { year: 2026, month: 10, day: 16 },
  { year: 2026, month: 10, day: 17 },
];

/** A full day of quarter-hour prices in the API's JSON shape, all at `price`. */
function apiDay(date: (typeof DAYS)[number], price: number) {
  const { start, end } = stockholmDayBounds(date);
  const entries = [];
  for (let t = start; t < end; t += 15 * 60_000) {
    entries.push({
      SEK_per_kWh: price,
      EUR_per_kWh: price / 11,
      EXR: 11,
      time_start: new Date(t).toISOString().replace("Z", "+00:00"),
      time_end: new Date(t + 15 * 60_000).toISOString().replace("Z", "+00:00"),
    });
  }
  return entries;
}

/** A fake API that serves the given days for every zone, 404 for anything else, and records requests. */
function fakeApi(published: (typeof DAYS)[number][]) {
  const requested: string[] = [];
  const responses = new Map<string, unknown>();
  for (const zone of ["SE1", "SE2", "SE3", "SE4"] as const) {
    published.forEach((date, i) => responses.set(dayPricesUrl(zone, date), apiDay(date, i + 1)));
  }
  const fetcher: Fetcher = async (url) => {
    requested.push(url);
    const body = responses.get(url);
    return body ? new Response(JSON.stringify(body)) : new Response("not found", { status: 404 });
  };
  return { fetcher, requested };
}

const countByZone = async () =>
  (await env.DB.prepare("SELECT zone, COUNT(*) AS n FROM prices GROUP BY zone ORDER BY zone").all()).results;

beforeEach(async () => {
  await env.DB.exec("DELETE FROM prices");
});

describe("ingestPrices", () => {
  it("backfills history, today and tomorrow for every zone into an empty database", async () => {
    const api = fakeApi(DAYS);
    const result = await ingestPrices(env.DB, api.fetcher, NOW);

    expect(api.requested).toHaveLength(16);
    expect(result.stored).toHaveLength(16);
    expect(result.notAvailable).toEqual([]);
    expect(await countByZone()).toEqual(
      ["SE1", "SE2", "SE3", "SE4"].map((zone) => ({ zone, n: 4 * 96 })),
    );
  });

  it("stores prices that can be read back as UTC intervals", async () => {
    await ingestPrices(env.DB, fakeApi(DAYS).fetcher, NOW);
    const { start, end } = stockholmDayBounds(DAYS[2]!);
    const today = (await loadIntervals(env.DB, start, end)).filter((i) => i.zone === "SE3");

    expect(today).toHaveLength(96);
    expect(today[0]).toEqual({ zone: "SE3", start, end: start + 15 * 60_000, sekPerKwh: 3 });
    expect(today.at(-1)?.end).toBe(end);
  });

  it("only fetches tomorrow on later runs, until it is published", async () => {
    await ingestPrices(env.DB, fakeApi(DAYS.slice(0, 3)).fetcher, NOW);

    const beforePublishing = fakeApi(DAYS.slice(0, 3));
    const first = await ingestPrices(env.DB, beforePublishing.fetcher, NOW);
    expect(beforePublishing.requested).toEqual(["SE1", "SE2", "SE3", "SE4"].map((z) => dayPricesUrl(z as "SE1", DAYS[3]!)));
    expect(first.notAvailable).toHaveLength(4);

    const afterPublishing = fakeApi(DAYS);
    const second = await ingestPrices(env.DB, afterPublishing.fetcher, NOW);
    expect(second.stored).toHaveLength(4);

    const done = fakeApi(DAYS);
    await ingestPrices(env.DB, done.fetcher, NOW);
    expect(done.requested).toEqual([]);
  });

  it("is idempotent", async () => {
    await ingestPrices(env.DB, fakeApi(DAYS).fetcher, NOW);
    await env.DB.prepare("DELETE FROM prices WHERE zone = 'SE1' AND start_utc >= ?1").bind(stockholmDayBounds(DAYS[3]!).start).run();
    await ingestPrices(env.DB, fakeApi(DAYS).fetcher, NOW);

    expect(await countByZone()).toEqual(["SE1", "SE2", "SE3", "SE4"].map((zone) => ({ zone, n: 4 * 96 })));
  });

  it("deletes rows older than the kept history", async () => {
    await ingestPrices(env.DB, fakeApi(DAYS).fetcher, NOW);
    // One day later, 2026-10-14 falls out of the history.
    await ingestPrices(env.DB, fakeApi([...DAYS, { year: 2026, month: 10, day: 18 }]).fetcher, NOW + 24 * 3_600_000);

    const oldest = await env.DB.prepare("SELECT MIN(start_utc) AS t FROM prices").first<{ t: number }>();
    expect(oldest?.t).toBe(stockholmDayBounds(DAYS[1]!).start);
  });

  it("stores what it can and throws when some fetches fail", async () => {
    const api = fakeApi(DAYS);
    const failing: Fetcher = async (url) =>
      url.includes("_SE2") ? new Response("down", { status: 503 }) : api.fetcher(url);

    await expect(ingestPrices(env.DB, failing, NOW)).rejects.toThrow("failed for 4 zone/day(s)");
    expect(await countByZone()).toEqual(["SE1", "SE3", "SE4"].map((zone) => ({ zone, n: 4 * 96 })));
  });
});
