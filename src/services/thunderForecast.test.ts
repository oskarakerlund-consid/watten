import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { loadForecast, saveForecast } from "../db/forecastCache";
import type { HttpFetcher } from "../integrations/metno";
import { getThunderForecast } from "./thunderForecast";

const NOW = Date.UTC(2026, 9, 16, 17);
const UA = "watten-test/1.0";
const LAT = 59.33;
const LON = 18.07;

const metBody = (probability: number) => ({
  properties: {
    timeseries: [{ time: "2026-10-16T17:00:00Z", data: { next_1_hours: { details: { probability_of_thunder: probability } } } }],
  },
});

/** A fake MET that returns the given responses in order and records request headers. */
function fakeMet(...responses: (() => Response)[]) {
  const requests: Headers[] = [];
  const fetcher: HttpFetcher = async (_url, init) => {
    requests.push(new Headers(init.headers));
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return next();
  };
  return { fetcher, requests };
}

const ok = (probability: number, expires: number) => () =>
  new Response(JSON.stringify(metBody(probability)), {
    headers: { Expires: new Date(expires).toUTCString(), "Last-Modified": "Fri, 16 Oct 2026 16:00:00 GMT" },
  });

beforeEach(async () => {
  await env.DB.exec("DELETE FROM forecast_cache");
});

describe("getThunderForecast", () => {
  it("fetches and caches a forecast", async () => {
    const met = fakeMet(ok(5, NOW + 30 * 60_000));
    const forecast = await getThunderForecast(env.DB, met.fetcher, UA, LAT, LON, NOW);

    expect(forecast).toEqual({ hours: [{ start: NOW, probability: 5 }], fetched: NOW, stale: false });
    expect(await loadForecast(env.DB, LAT, LON)).toMatchObject({ expires: NOW + 30 * 60_000, lastModified: "Fri, 16 Oct 2026 16:00:00 GMT" });
  });

  it("serves the cache without contacting MET until it expires", async () => {
    await getThunderForecast(env.DB, fakeMet(ok(5, NOW + 30 * 60_000)).fetcher, UA, LAT, LON, NOW);

    const met = fakeMet();
    const forecast = await getThunderForecast(env.DB, met.fetcher, UA, LAT, LON, NOW + 29 * 60_000);
    expect(met.requests).toHaveLength(0);
    expect(forecast.hours).toEqual([{ start: NOW, probability: 5 }]);
  });

  it("revalidates an expired cache with If-Modified-Since and keeps it on 304", async () => {
    await getThunderForecast(env.DB, fakeMet(ok(5, NOW + 30 * 60_000)).fetcher, UA, LAT, LON, NOW);

    const later = NOW + 31 * 60_000;
    const met = fakeMet(() => new Response(null, { status: 304, headers: { Expires: new Date(later + 30 * 60_000).toUTCString() } }));
    const forecast = await getThunderForecast(env.DB, met.fetcher, UA, LAT, LON, later);

    expect(met.requests[0]?.get("If-Modified-Since")).toBe("Fri, 16 Oct 2026 16:00:00 GMT");
    expect(forecast).toEqual({ hours: [{ start: NOW, probability: 5 }], fetched: NOW, stale: false });
    expect((await loadForecast(env.DB, LAT, LON))?.expires).toBe(later + 30 * 60_000);
  });

  it("replaces an expired cache with new data", async () => {
    await getThunderForecast(env.DB, fakeMet(ok(5, NOW + 30 * 60_000)).fetcher, UA, LAT, LON, NOW);
    const later = NOW + 31 * 60_000;
    const forecast = await getThunderForecast(env.DB, fakeMet(ok(40, later + 30 * 60_000)).fetcher, UA, LAT, LON, later);
    expect(forecast).toEqual({ hours: [{ start: NOW, probability: 40 }], fetched: later, stale: false });
  });

  it("serves a stale forecast and backs off when MET fails", async () => {
    await getThunderForecast(env.DB, fakeMet(ok(5, NOW + 30 * 60_000)).fetcher, UA, LAT, LON, NOW);

    const later = NOW + 31 * 60_000;
    const forecast = await getThunderForecast(env.DB, fakeMet(() => new Response("", { status: 429 })).fetcher, UA, LAT, LON, later);
    expect(forecast).toEqual({ hours: [{ start: NOW, probability: 5 }], fetched: NOW, stale: true });
    expect((await loadForecast(env.DB, LAT, LON))?.expires).toBe(later + 10 * 60_000);
  });

  it("throws when MET fails and nothing is cached", async () => {
    await expect(
      getThunderForecast(env.DB, fakeMet(() => new Response("", { status: 503 })).fetcher, UA, LAT, LON, NOW),
    ).rejects.toThrow("responded 503");
  });

  it("caches positions separately", async () => {
    await saveForecast(env.DB, 55.6, 13, { hours: [{ start: NOW, probability: 80 }], expires: NOW + 60_000, lastModified: null, fetched: NOW });
    const forecast = await getThunderForecast(env.DB, fakeMet(ok(5, NOW + 30 * 60_000)).fetcher, UA, LAT, LON, NOW);
    expect(forecast.hours[0]?.probability).toBe(5);
  });
});
