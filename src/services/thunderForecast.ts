import { type CachedForecast, extendForecast, loadForecast, saveForecast } from "../db/forecastCache";
import type { ThunderHour } from "../domain/thunder";
import type { HttpFetcher } from "../integrations/http";
import { type ForecastResult, fetchThunderForecast } from "../integrations/metno";

/** How long to wait before asking MET again after a failed request, when an older forecast can be served. */
const RETRY_AFTER_ERROR_MS = 10 * 60_000;

export interface ThunderForecast {
  hours: ThunderHour[];
  /** When the forecast was fetched from MET. */
  fetched: number;
  /** True if MET could not be reached and an expired cached forecast is returned. */
  stale: boolean;
}

/**
 * Returns the thunder forecast for a (rounded) position, using the D1 cache as MET's terms require:
 * cached data is used until it expires, then refreshed with `If-Modified-Since`.
 * If MET fails, an expired cached forecast is returned as stale; without one, the error is thrown.
 * Database errors are never treated as MET failures.
 */
export async function getThunderForecast(
  db: D1Database,
  fetcher: HttpFetcher,
  userAgent: string,
  lat: number,
  lon: number,
  now: number,
): Promise<ThunderForecast> {
  const cached = await loadForecast(db, lat, lon);
  if (cached && cached.expires > now) return { hours: cached.hours, fetched: cached.fetched, stale: false };

  let result: ForecastResult;
  try {
    result = await fetchThunderForecast(fetcher, userAgent, lat, lon, now, cached?.lastModified ?? undefined);
  } catch (error) {
    if (!cached) throw error;
    console.error("Serving stale thunder forecast", error);
    await extendForecast(db, lat, lon, now + RETRY_AFTER_ERROR_MS);
    return { hours: cached.hours, fetched: cached.fetched, stale: true };
  }

  if (result.status === "ok") {
    const fresh: CachedForecast = { hours: result.hours, expires: result.expires, lastModified: result.lastModified, fetched: now };
    await saveForecast(db, lat, lon, fresh);
    return { hours: fresh.hours, fetched: now, stale: false };
  }
  if (!cached) throw new Error("MET Norway answered 304 Not Modified without a cached forecast");
  await extendForecast(db, lat, lon, result.expires);
  return { hours: cached.hours, fetched: cached.fetched, stale: false };
}
