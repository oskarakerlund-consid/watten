import { deleteIntervalsBefore, loadIntervals, type StoredInterval, upsertIntervalsStatement } from "../db/prices";
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

export interface ZoneDay {
  zone: Zone;
  date: LocalDate;
}

const dayLabel = ({ zone, date }: ZoneDay) =>
  `${zone} ${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;

/** Full days to keep before today so that a trailing average window of `hours` is always covered. */
export function historyDaysFor(hours: number): number {
  return Math.ceil(hours / 24);
}

/** The Swedish calendar days to hold prices for, oldest first: `historyDays` days before today, today and tomorrow. */
export function daysToKeep(today: LocalDate, historyDays: number): LocalDate[] {
  const days: LocalDate[] = [];
  for (let offset = -historyDays; offset <= 1; offset++) days.push(addDays(today, offset));
  return days;
}

/** True if `intervals` cover the whole Swedish calendar day without gaps. */
function coversDay(intervals: readonly StoredInterval[], date: LocalDate): boolean {
  const { start, end } = stockholmDayBounds(date);
  return averagePrice(intervals, start, end) !== null;
}

/** Zone/day pairs among `days` whose prices are missing or incomplete in `existing`. */
export function missingDays(existing: readonly StoredInterval[], days: readonly LocalDate[]): ZoneDay[] {
  return ZONES.flatMap((zone) => {
    const zoneIntervals = existing.filter((i) => i.zone === zone);
    return days.filter((date) => !coversDay(zoneIntervals, date)).map((date) => ({ zone, date }));
  });
}

/**
 * Makes sure D1 holds complete prices for every zone from `historyDays` days ago up to tomorrow.
 * Only days that are missing or incomplete are fetched, so repeated runs are cheap and idempotent.
 * Rows older than the kept history are deleted. Throws after processing all days if anything failed.
 */
export async function ingestPrices(
  db: D1Database,
  fetcher: HttpFetcher,
  now: number,
  historyDays: number,
): Promise<IngestResult> {
  const days = daysToKeep(stockholmDate(now), historyDays);
  const keepFrom = stockholmStartOfDay(days[0]!);
  const existing = await loadIntervals(db, keepFrom, stockholmDayBounds(days.at(-1)!).end);

  const result: IngestResult = { stored: [], notAvailable: [] };
  const statements: D1PreparedStatement[] = [];
  const errors: unknown[] = [];

  for (const zoneDay of missingDays(existing, days)) {
    try {
      const day = await fetchDayPrices(fetcher, zoneDay.zone, zoneDay.date);
      if (day.status === "not-available") {
        result.notAvailable.push(dayLabel(zoneDay));
      } else {
        statements.push(upsertIntervalsStatement(db, zoneDay.zone, day.intervals));
        result.stored.push(dayLabel(zoneDay));
      }
    } catch (error) {
      errors.push(new Error(`Failed to ingest ${dayLabel(zoneDay)}`, { cause: error }));
    }
  }

  // Store what was fetched even if some fetches failed, and keep those errors if storing fails too.
  try {
    if (statements.length > 0) await db.batch(statements);
    await deleteIntervalsBefore(db, keepFrom);
  } catch (error) {
    errors.push(new Error("Failed to store prices", { cause: error }));
  }

  if (errors.length > 0) throw new AggregateError(errors, `Price ingestion failed with ${errors.length} error(s)`);
  return result;
}
