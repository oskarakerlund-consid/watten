import { deleteIntervalsBefore, loadIntervals, upsertIntervalsStatement } from "../db/prices";
import { averagePrice } from "../domain/prices";
import { addDays, stockholmDate, stockholmDayBounds, stockholmStartOfDay } from "../domain/time";
import { type LocalDate, ZONES, type Zone } from "../domain/types";
import { fetchDayPrices } from "../integrations/elprisetjustnu";
import type { HttpFetcher } from "../integrations/http";

export interface IngestResult {
  /** Zone/day pairs that were fetched and stored. */
  stored: string[];
  /** Zone/day pairs that are not published yet. */
  notAvailable: string[];
}

const label = (zone: Zone, date: LocalDate) =>
  `${zone} ${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;

/** Full days to keep before today so that a trailing average window of `hours` is always covered. */
export function historyDaysFor(hours: number): number {
  return Math.ceil(hours / 24);
}

/**
 * Makes sure D1 holds complete prices for every zone from `historyDays` days ago up to tomorrow.
 * Only days that are missing or incomplete are fetched, so repeated runs are cheap and idempotent.
 * Rows older than the kept history are deleted. Throws after processing all days if any fetch failed.
 */
export async function ingestPrices(
  db: D1Database,
  fetcher: HttpFetcher,
  now: number,
  historyDays: number,
): Promise<IngestResult> {
  const today = stockholmDate(now);
  const days = Array.from({ length: historyDays + 2 }, (_, i) => addDays(today, i - historyDays));
  const firstDay = days[0]!;
  const lastDay = days.at(-1)!;

  const stored = await loadIntervals(db, stockholmStartOfDay(firstDay), stockholmDayBounds(lastDay).end);

  const result: IngestResult = { stored: [], notAvailable: [] };
  const statements: D1PreparedStatement[] = [];
  const errors: unknown[] = [];

  for (const zone of ZONES) {
    const zoneIntervals = stored.filter((i) => i.zone === zone);
    for (const date of days) {
      const { start, end } = stockholmDayBounds(date);
      if (averagePrice(zoneIntervals, start, end) !== null) continue; // already complete

      try {
        const day = await fetchDayPrices(fetcher, zone, date);
        if (day.status === "not-available") {
          result.notAvailable.push(label(zone, date));
        } else {
          statements.push(upsertIntervalsStatement(db, zone, day.intervals));
          result.stored.push(label(zone, date));
        }
      } catch (error) {
        errors.push(new Error(`Failed to ingest ${label(zone, date)}`, { cause: error }));
      }
    }
  }

  if (statements.length > 0) await db.batch(statements);
  await deleteIntervalsBefore(db, stockholmStartOfDay(firstDay));

  if (errors.length > 0) throw new AggregateError(errors, `Price ingestion failed for ${errors.length} zone/day(s)`);
  return result;
}
