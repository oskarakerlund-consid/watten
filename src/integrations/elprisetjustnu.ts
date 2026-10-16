import { z } from "zod";
import type { LocalDate, PriceInterval, Zone } from "../domain/types";
import type { HttpFetcher } from "./http";

const BASE_URL = "https://www.elprisetjustnu.se/api/v1/prices";

const responseSchema = z
  .array(
    z.object({
      SEK_per_kWh: z.number(),
      time_start: z.iso.datetime({ offset: true }),
      time_end: z.iso.datetime({ offset: true }),
    }),
  )
  .min(1);

export type DayPricesResult = { status: "ok"; intervals: PriceInterval[] } | { status: "not-available" };

const pad = (n: number) => String(n).padStart(2, "0");

export function dayPricesUrl(zone: Zone, date: LocalDate): string {
  return `${BASE_URL}/${date.year}/${pad(date.month)}-${pad(date.day)}_${zone}.json`;
}

/**
 * Fetches the prices for one Swedish calendar day and zone.
 * Returns `not-available` when the day is not published yet (HTTP 404); throws on other errors or invalid data.
 */
export async function fetchDayPrices(fetcher: HttpFetcher, zone: Zone, date: LocalDate): Promise<DayPricesResult> {
  const url = dayPricesUrl(zone, date);
  const response = await fetcher(url);

  if (response.status === 404) return { status: "not-available" };
  if (!response.ok) throw new Error(`Elpriset just nu responded ${response.status} for ${url}`);

  const entries = responseSchema.parse(await response.json());
  const sorted = entries
    .map((entry) => ({
      start: Date.parse(entry.time_start),
      end: Date.parse(entry.time_end),
      sekPerKwh: entry.SEK_per_kWh,
    }))
    .sort((a, b) => a.start - b.start);

  // On the day summer time ends, the API reports the 02:45 interval as ending at 03:00+01:00 instead of
  // 02:00+01:00, overlapping the next hour. The start times are correct, so cap each end at the next start.
  const intervals = sorted.map((interval, i) => {
    const nextStart = sorted[i + 1]?.start;
    return nextStart === undefined ? interval : { ...interval, end: Math.min(interval.end, nextStart) };
  });

  if (intervals.some((i) => i.end <= i.start)) {
    throw new Error(`Elpriset just nu returned an interval that ends before it starts for ${url}`);
  }

  return { status: "ok", intervals };
}
