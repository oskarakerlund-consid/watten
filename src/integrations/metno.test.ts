import { describe, expect, it } from "vitest";
import stockholm from "../../test/fixtures/metno/2026-10-16_stockholm_complete.json";
import type { HttpFetcher } from "./http";
import { fetchThunderForecast, forecastUrl } from "./metno";

const NOW = Date.UTC(2026, 9, 16, 17);
const UA = "watten-test/1.0 (https://example.com)";

function respond(body: unknown, init: ResponseInit = {}): HttpFetcher {
  return async () => new Response(typeof body === "string" ? body : JSON.stringify(body), init);
}

describe("forecastUrl", () => {
  it("uses at most four decimals", () => {
    expect(forecastUrl(59.329_345_6, 18.068_61)).toBe(
      "https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=59.3293&lon=18.0686",
    );
  });
});

describe("fetchThunderForecast", () => {
  it("extracts the hourly probability of thunder from a real response", async () => {
    const result = await fetchThunderForecast(
      respond(stockholm, { headers: { Expires: "Fri, 16 Oct 2026 17:54:28 GMT", "Last-Modified": "Fri, 16 Oct 2026 17:24:22 GMT" } }),
      UA,
      59.33,
      18.07,
      NOW,
    );
    if (result.status !== "ok") throw new Error("expected ok");

    // The real response has hourly steps with probability_of_thunder for 55 hours.
    expect(result.hours).toHaveLength(55);
    expect(result.hours[0]).toEqual({ start: Date.UTC(2026, 9, 16, 17), probability: expect.any(Number) });
    expect(result.hours.at(-1)?.start).toBe(Date.UTC(2026, 9, 18, 23));
    expect(result.expires).toBe(Date.UTC(2026, 9, 16, 17, 54, 28));
    expect(result.lastModified).toBe("Fri, 16 Oct 2026 17:24:22 GMT");
  });

  it("sends the User-Agent and If-Modified-Since headers", async () => {
    const seen: Headers[] = [];
    await fetchThunderForecast(
      async (_url, init) => {
        seen.push(new Headers(init?.headers));
        return new Response(null, { status: 304 });
      },
      UA,
      59.33,
      18.07,
      NOW,
      "Fri, 16 Oct 2026 17:24:22 GMT",
    );
    expect(seen[0]?.get("User-Agent")).toBe(UA);
    expect(seen[0]?.get("If-Modified-Since")).toBe("Fri, 16 Oct 2026 17:24:22 GMT");
  });

  it("reports 304 Not Modified with the new expiry", async () => {
    const result = await fetchThunderForecast(
      respond("", { status: 304, headers: { Expires: "Fri, 16 Oct 2026 18:30:00 GMT" } }),
      UA,
      59.33,
      18.07,
      NOW,
      "x",
    );
    expect(result).toEqual({ status: "not-modified", expires: Date.UTC(2026, 9, 16, 18, 30) });
  });

  it("falls back to 30 minutes when Expires is missing or in the past", async () => {
    const missing = await fetchThunderForecast(respond(stockholm), UA, 59.33, 18.07, NOW);
    const past = await fetchThunderForecast(
      respond(stockholm, { headers: { Expires: "Thu, 01 Jan 2026 00:00:00 GMT" } }),
      UA,
      59.33,
      18.07,
      NOW,
    );
    expect(missing.expires).toBe(NOW + 30 * 60_000);
    expect(past.expires).toBe(NOW + 30 * 60_000);
  });

  it("skips steps without probability_of_thunder", async () => {
    const body = {
      properties: {
        timeseries: [
          { time: "2026-10-16T17:00:00Z", data: { next_1_hours: { details: { probability_of_thunder: 12.5 } } } },
          { time: "2026-10-16T18:00:00Z", data: { next_6_hours: { details: {} } } },
        ],
      },
    };
    const result = await fetchThunderForecast(respond(body), UA, 59.33, 18.07, NOW);
    expect(result).toMatchObject({ status: "ok", hours: [{ start: Date.UTC(2026, 9, 16, 17), probability: 12.5 }] });
  });

  it.each([429, 500, 403])("throws on HTTP %i", async (status) => {
    await expect(fetchThunderForecast(respond("", { status }), UA, 59.33, 18.07, NOW)).rejects.toThrow(`responded ${status}`);
  });

  it("throws on invalid data", async () => {
    const body = { properties: { timeseries: [{ time: "yesterday", data: {} }] } };
    await expect(fetchThunderForecast(respond(body), UA, 59.33, 18.07, NOW)).rejects.toThrow();
  });
});
