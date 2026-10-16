import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { seedHourlyPrices } from "../../test/seedPrices";
import { createApp } from "../app";
import { HOUR_MS } from "../domain/time";

// 2026-10-16 14:00 Swedish time.
const NOW = Date.UTC(2026, 9, 16, 12);
const app = createApp({ clock: () => NOW });
const get = (path: string) => app.request(path, {}, env);

beforeEach(async () => {
  await env.DB.exec("DELETE FROM prices");
});

describe("GET /api/status", () => {
  it("classifies the next hour against the 48-hour average", async () => {
    // 48 hours at 1 SEK, then the next hour at 1.5 SEK: 0.5 above the average, threshold max(0.2, 20 % of 1) = 0.2.
    await seedHourlyPrices("SE3", NOW - 48 * HOUR_MS, [...Array(48).fill(1), 1.5]);

    const response = await get("/api/status?zone=SE3");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(await response.json()).toEqual({
      zone: "SE3",
      averageWindowHours: 48,
      level: "expensive",
      currentSekPerKwh: 1.5,
      averageSekPerKwh: 1,
      thresholdSekPerKwh: 0.2,
    });
  });

  it("only uses prices for the requested zone", async () => {
    await seedHourlyPrices("SE3", NOW - 48 * HOUR_MS, Array(49).fill(1));
    await seedHourlyPrices("SE4", NOW - 48 * HOUR_MS, [...Array(48).fill(1), 0.5]);

    const body = await (await get("/api/status?zone=SE4")).json();
    expect(body).toMatchObject({ zone: "SE4", level: "cheap", currentSekPerKwh: 0.5 });
  });

  it("responds 503 when prices are missing", async () => {
    await seedHourlyPrices("SE3", NOW - 48 * HOUR_MS, Array(48).fill(1)); // nothing after now

    const response = await get("/api/status?zone=SE3");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Prices for SE3 are not available yet" });
    expect(response.headers.get("Cache-Control")).toBeNull();
  });

  it.each(["/api/status", "/api/status?zone=SE9", "/api/status?zone=se3"])("responds 400 for %s", async (path) => {
    const response = await get(path);
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  });
});
