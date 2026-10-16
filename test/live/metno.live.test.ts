import { env } from "cloudflare:workers";
import { it } from "vitest";
import { parseConfig } from "../../src/config";
import { extendForecast } from "../../src/db/forecastCache";
import { HOUR_MS, toStockholmIso } from "../../src/domain/time";
import type { HttpFetcher } from "../../src/integrations/http";
import { getThunderForecast } from "../../src/services/thunderForecast";

const PLACES: [string, number, number][] = [
  ["Kiruna", 67.86, 20.23],
  ["Sundsvall", 62.39, 17.31],
  ["Stockholm", 59.33, 18.07],
  ["Malmö", 55.61, 13.0],
];

it("fetches and caches thunder forecasts from MET Norway", async () => {
  const { metUserAgent } = parseConfig(env);
  const statuses: number[] = [];
  const fetcher: HttpFetcher = async (url, init) => {
    const response = await fetch(url, init);
    statuses.push(response.status);
    return response;
  };

  const now = Date.now();
  const lines = [`User-Agent: ${metUserAgent}`, ""];
  for (const [name, lat, lon] of PLACES) {
    statuses.length = 0;
    const first = await getThunderForecast(env.DB, fetcher, metUserAgent, lat, lon, now);
    const hours = first.hours.filter((h) => h.start + HOUR_MS > now);
    const next24 = hours.filter((h) => h.start < now + 24 * HOUR_MS);
    const max = next24.reduce((best, h) => (h.probability > best.probability ? h : best), next24[0]!);
    lines.push(
      `${name.padEnd(10)} hourly thunder data ${String(hours.length).padStart(2)} h ahead, ` +
        `max next 24 h ${max.probability.toFixed(1).padStart(4)} % at ${toStockholmIso(max.start)}`,
    );

    // Second call within the expiry: served from D1 without contacting MET.
    await getThunderForecast(env.DB, fetcher, metUserAgent, lat, lon, now);
    // Third call after forcing expiry: conditional request with If-Modified-Since (304 if unchanged).
    await extendForecast(env.DB, lat, lon, now - 1);
    await getThunderForecast(env.DB, fetcher, metUserAgent, lat, lon, now);
    lines.push(`           MET responses: first ${statuses[0]}, cached call none, after expiry ${statuses[1]}`);
  }
  console.log(lines.join("\n"));
});
