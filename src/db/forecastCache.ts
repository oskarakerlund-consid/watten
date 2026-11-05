import { z } from "zod";
import type { Position } from "../domain/position";
import type { ThunderHour } from "../domain/thunder";

export interface CachedForecast {
  hours: ThunderHour[];
  expires: number;
  lastModified: string | null;
  fetched: number;
}

interface ForecastRow {
  hours: string;
  expires_utc: number;
  last_modified: string | null;
  fetched_utc: number;
}

const hoursSchema = z.array(z.object({ start: z.number(), probability: z.number() }));

/**
 * The stored hours, or null if the row is corrupt (invalid JSON or an unexpected shape). A corrupt row is then
 * treated as not cached, so a fresh forecast is fetched and overwrites it instead of failing on every request.
 */
function parseHours(raw: string): ThunderHour[] | null {
  try {
    const result = hoursSchema.safeParse(JSON.parse(raw));
    if (result.success) return result.data;
  } catch {
    // invalid JSON, handled below
  }
  console.error("Ignoring a corrupt cached forecast");
  return null;
}

/** The forecast stored in a row, or null if the row is corrupt. */
function toCachedForecast(row: ForecastRow): CachedForecast | null {
  const hours = parseHours(row.hours);
  return hours && { hours, expires: row.expires_utc, lastModified: row.last_modified, fetched: row.fetched_utc };
}

export async function loadForecast(db: D1Database, lat: number, lon: number): Promise<CachedForecast | null> {
  const row = await db
    .prepare("SELECT hours, expires_utc, last_modified, fetched_utc FROM forecast_cache WHERE lat = ?1 AND lon = ?2")
    .bind(lat, lon)
    .first<ForecastRow>();
  return row && toCachedForecast(row);
}

export async function saveForecast(db: D1Database, lat: number, lon: number, forecast: CachedForecast): Promise<void> {
  await db
    .prepare(
      `INSERT INTO forecast_cache (lat, lon, hours, expires_utc, last_modified, fetched_utc) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (lat, lon) DO UPDATE SET hours = excluded.hours, expires_utc = excluded.expires_utc,
         last_modified = excluded.last_modified, fetched_utc = excluded.fetched_utc`,
    )
    .bind(lat, lon, JSON.stringify(forecast.hours), forecast.expires, forecast.lastModified, forecast.fetched)
    .run();
}

/** Extends the lifetime of a cached forecast (after a 304, or to back off after an error). */
export async function extendForecast(db: D1Database, lat: number, lon: number, expires: number): Promise<void> {
  await db.prepare("UPDATE forecast_cache SET expires_utc = ?3 WHERE lat = ?1 AND lon = ?2").bind(lat, lon, expires).run();
}

/**
 * Cached forecasts for several (rounded) positions in one query, keyed by `"lat,lon"`.
 * The positions are passed as one JSON array of `[lat, lon]` pairs and joined with `json_each`. The join compares
 * REAL values for equality, which is exact because every stored and requested position is rounded the same way
 * (two decimals, `src/routes/validation.ts`) before it reaches the database.
 */
export async function loadForecasts(
  db: D1Database,
  positions: readonly Position[],
): Promise<Map<string, CachedForecast>> {
  const { results } = await db
    .prepare(
      `SELECT f.lat, f.lon, f.hours, f.expires_utc, f.last_modified, f.fetched_utc FROM forecast_cache f
       JOIN json_each(?1) p ON f.lat = p.value ->> '$[0]' AND f.lon = p.value ->> '$[1]'`,
    )
    .bind(JSON.stringify(positions.map((p) => [p.lat, p.lon])))
    .all<ForecastRow & { lat: number; lon: number }>();
  const forecasts = new Map<string, CachedForecast>();
  for (const row of results) {
    const forecast = toCachedForecast(row);
    if (forecast) forecasts.set(`${row.lat},${row.lon}`, forecast);
  }
  return forecasts;
}
