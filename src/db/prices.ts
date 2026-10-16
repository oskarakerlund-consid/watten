import type { PriceInterval, Zone } from "../domain/types";

export interface StoredInterval extends PriceInterval {
  zone: Zone;
}

interface PriceRow {
  zone: Zone;
  start_utc: number;
  end_utc: number;
  sek_per_kwh: number;
}

/** All stored intervals that start within `[from, to)`, ordered by zone and start. */
export async function loadIntervals(db: D1Database, from: number, to: number): Promise<StoredInterval[]> {
  const { results } = await db
    .prepare(
      "SELECT zone, start_utc, end_utc, sek_per_kwh FROM prices WHERE start_utc >= ?1 AND start_utc < ?2 ORDER BY zone, start_utc",
    )
    .bind(from, to)
    .all<PriceRow>();

  return results.map((row) => ({ zone: row.zone, start: row.start_utc, end: row.end_utc, sekPerKwh: row.sek_per_kwh }));
}

/** Stored intervals for one zone that overlap `[from, to)`, ordered by start. */
export async function loadZoneIntervals(db: D1Database, zone: Zone, from: number, to: number): Promise<PriceInterval[]> {
  const { results } = await db
    .prepare(
      "SELECT start_utc, end_utc, sek_per_kwh FROM prices WHERE zone = ?1 AND start_utc < ?3 AND end_utc > ?2 ORDER BY start_utc",
    )
    .bind(zone, from, to)
    .all<Omit<PriceRow, "zone">>();

  return results.map((row) => ({ start: row.start_utc, end: row.end_utc, sekPerKwh: row.sek_per_kwh }));
}

// One statement per zone and day: the rows are passed as a single JSON parameter, which keeps us far below the
// 100 bound parameters per query and the per-invocation query limit.
const UPSERT_SQL = `
  INSERT INTO prices (zone, start_utc, end_utc, sek_per_kwh)
  SELECT ?1, value ->> '$[0]', value ->> '$[1]', value ->> '$[2]' FROM json_each(?2) WHERE true
  ON CONFLICT (zone, start_utc) DO UPDATE SET end_utc = excluded.end_utc, sek_per_kwh = excluded.sek_per_kwh`;

/** Statement that inserts or replaces the given intervals for a zone. Run it with `db.batch()`. */
export function upsertIntervalsStatement(db: D1Database, zone: Zone, intervals: readonly PriceInterval[]) {
  const rows = intervals.map((i) => [i.start, i.end, i.sekPerKwh]);
  return db.prepare(UPSERT_SQL).bind(zone, JSON.stringify(rows));
}

/** Deletes all intervals that start before `cutoff`. */
export async function deleteIntervalsBefore(db: D1Database, cutoff: number): Promise<void> {
  await db.prepare("DELETE FROM prices WHERE start_utc < ?1").bind(cutoff).run();
}
