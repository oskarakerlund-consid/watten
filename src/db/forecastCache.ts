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

export async function loadForecast(db: D1Database, lat: number, lon: number): Promise<CachedForecast | null> {
  const row = await db
    .prepare("SELECT hours, expires_utc, last_modified, fetched_utc FROM forecast_cache WHERE lat = ?1 AND lon = ?2")
    .bind(lat, lon)
    .first<ForecastRow>();
  if (!row) return null;
  return {
    hours: JSON.parse(row.hours) as ThunderHour[],
    expires: row.expires_utc,
    lastModified: row.last_modified,
    fetched: row.fetched_utc,
  };
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

/** Cached forecasts for several (rounded) positions in one query, keyed by `"lat,lon"`. */
export async function loadForecasts(
  db: D1Database,
  positions: readonly { lat: number; lon: number }[],
): Promise<Map<string, CachedForecast>> {
  const { results } = await db
    .prepare(
      `SELECT f.lat, f.lon, f.hours, f.expires_utc, f.last_modified, f.fetched_utc FROM forecast_cache f
       JOIN json_each(?1) p ON f.lat = p.value ->> '$[0]' AND f.lon = p.value ->> '$[1]'`,
    )
    .bind(JSON.stringify(positions.map((p) => [p.lat, p.lon])))
    .all<ForecastRow & { lat: number; lon: number }>();
  return new Map(
    results.map((row) => [
      `${row.lat},${row.lon}`,
      { hours: JSON.parse(row.hours) as ThunderHour[], expires: row.expires_utc, lastModified: row.last_modified, fetched: row.fetched_utc },
    ]),
  );
}
