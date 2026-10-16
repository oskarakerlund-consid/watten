import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import type { HttpFetcher } from "../integrations/metno";

// 2026-07-15 14:00 Swedish summer time.
const NOW = Date.UTC(2026, 6, 15, 12);

/** A MET response with hourly probabilities of thunder starting at NOW. */
const metResponse = (probabilities: number[]) =>
  new Response(
    JSON.stringify({
      properties: {
        timeseries: probabilities.map((p, h) => ({
          time: new Date(NOW + h * 3_600_000).toISOString().replace(".000", ""),
          data: { next_1_hours: { details: { probability_of_thunder: p } } },
        })),
      },
    }),
    { headers: { Expires: new Date(NOW + 30 * 60_000).toUTCString() } },
  );

function appWithMet(respond: () => Response) {
  const urls: string[] = [];
  const fetcher: HttpFetcher = async (url) => {
    urls.push(url);
    return respond();
  };
  const app = createApp({ clock: () => NOW, fetcher });
  return { get: (path: string) => app.request(path, {}, env), urls };
}

beforeEach(async () => {
  await env.DB.exec("DELETE FROM forecast_cache");
});

describe("GET /api/thunder", () => {
  it("reports expected thunder with its approximate time", async () => {
    const met = appWithMet(() => metResponse([0, 5, 25, 60, 10, 0, 0, 0, 0, 0]));
    const response = await met.get("/api/thunder?lat=59.3293&lon=18.0686");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      lat: 59.33,
      lon: 18.07,
      hours: 8,
      thresholdPercent: 20,
      expected: true,
      start: "2026-07-15T14:00:00.000Z",
      end: "2026-07-15T16:00:00.000Z",
      startLocal: "2026-07-15T16:00:00+02:00",
      endLocal: "2026-07-15T18:00:00+02:00",
      maxProbabilityPercent: 60,
      forecastFetched: "2026-07-15T12:00:00.000Z",
      stale: false,
    });
  });

  it("reports no thunder below the threshold", async () => {
    const met = appWithMet(() => metResponse(Array(10).fill(5)));
    expect(await (await met.get("/api/thunder?lat=59.33&lon=18.07")).json()).toMatchObject({
      expected: false,
      start: null,
      startLocal: null,
      maxProbabilityPercent: 5,
    });
  });

  it("uses the hours parameter", async () => {
    const met = appWithMet(() => metResponse([...Array(10).fill(0), 80, 0, 0]));
    expect(await (await met.get("/api/thunder?lat=59.33&lon=18.07&hours=8")).json()).toMatchObject({ expected: false });
    expect(await (await met.get("/api/thunder?lat=59.33&lon=18.07&hours=12")).json()).toMatchObject({ expected: true, hours: 12 });
  });

  it("asks MET with the rounded position and serves nearby positions from the same cache entry", async () => {
    const met = appWithMet(() => metResponse(Array(10).fill(0)));
    await met.get("/api/thunder?lat=59.3293&lon=18.0686");
    await met.get("/api/thunder?lat=59.331&lon=18.0712");

    expect(met.urls).toEqual(["https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=59.33&lon=18.07"]);
  });

  it("responds 503 when MET is unavailable and nothing is cached", async () => {
    const met = appWithMet(() => new Response("", { status: 503 }));
    const response = await met.get("/api/thunder?lat=59.33&lon=18.07");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "The weather forecast is not available right now" });
  });

  it("responds 503 when the forecast is too short for the period", async () => {
    const met = appWithMet(() => metResponse([0, 0, 0]));
    expect((await met.get("/api/thunder?lat=59.33&lon=18.07")).status).toBe(503);
  });

  it.each([
    "/api/thunder",
    "/api/thunder?lat=59.33",
    "/api/thunder?lat=48.85&lon=2.35", // Paris
    "/api/thunder?lat=59.33&lon=18.07&hours=0",
    "/api/thunder?lat=59.33&lon=18.07&hours=25",
    "/api/thunder?lat=north&lon=18.07",
  ])("responds 400 for %s", async (path) => {
    const met = appWithMet(() => metResponse([]));
    const response = await met.get(path);
    expect(response.status).toBe(400);
    expect(met.urls).toEqual([]);
  });
});
