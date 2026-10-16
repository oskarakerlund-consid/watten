import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { seedHourlyPrices } from "../../test/seedPrices";
import { createApp } from "../app";
import { HOUR_MS } from "../domain/time";

// 2026-10-16 14:00 Swedish time.
const NOW = Date.UTC(2026, 9, 16, 12);
const app = createApp(() => NOW);
const get = (path: string) => app.request(path, {}, env);

beforeEach(async () => {
  await env.DB.exec("DELETE FROM prices");
  // From now: 12 hours, cheapest 2-hour stretch at hours 3–4 (17:00–19:00 local), cheaper hours 9–10 outside 8 h.
  await seedHourlyPrices("SE3", NOW, [5, 4, 3, 1, 1, 6, 7, 8, 9, 0, 0, 9]);
});

describe("GET /api/cheapest", () => {
  it("defaults to a 2-hour interval within 8 hours", async () => {
    const response = await get("/api/cheapest?zone=SE3");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      zone: "SE3",
      interval: 2,
      period: 8,
      start: "2026-10-16T15:00:00.000Z",
      end: "2026-10-16T17:00:00.000Z",
      startLocal: "2026-10-16T17:00:00+02:00",
      endLocal: "2026-10-16T19:00:00+02:00",
      averageSekPerKwh: 1,
    });
  });

  it("uses the given period", async () => {
    // With 12 hours, the two 0-priced hours 9–10 are inside the period.
    const body = await (await get("/api/cheapest?zone=SE3&period=12")).json();
    expect(body).toMatchObject({ period: 12, start: new Date(NOW + 9 * HOUR_MS).toISOString(), averageSekPerKwh: 0 });
  });

  it("uses the given interval", async () => {
    // Three hours: 3, 1, 1 from hour 2 is cheaper than any other stretch within 8 hours.
    const body = await (await get("/api/cheapest?zone=SE3&interval=3")).json();
    expect(body).toMatchObject({ interval: 3, start: new Date(NOW + 2 * HOUR_MS).toISOString() });
    expect((body as { averageSekPerKwh: number }).averageSekPerKwh).toBeCloseTo(5 / 3);
  });

  it("responds 503 when not enough prices are known", async () => {
    const response = await get("/api/cheapest?zone=SE1");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Not enough known prices for SE1 in the next 8 hours" });
  });

  it.each([
    "/api/cheapest",
    "/api/cheapest?zone=SE9",
    "/api/cheapest?zone=SE3&interval=0",
    "/api/cheapest?zone=SE3&interval=7",
    "/api/cheapest?zone=SE3&interval=1.5",
    "/api/cheapest?zone=SE3&period=25",
    "/api/cheapest?zone=SE3&interval=4&period=3",
    "/api/cheapest?zone=SE3&interval=abc",
  ])("responds 400 for %s", async (path) => {
    const response = await get(path);
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  });
});
