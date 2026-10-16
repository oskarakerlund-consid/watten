import type { LocalDate } from "./types";

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

const TIME_ZONE = "Europe/Stockholm";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

function localParts(instant: number): Record<string, number> {
  const parts: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return parts;
}

/** Offset of Swedish local time from UTC at `instant`, in milliseconds (+1 h in winter, +2 h in summer). */
export function stockholmOffset(instant: number): number {
  const p = localParts(instant);
  const localAsUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return localAsUtc - Math.floor(instant / 1000) * 1000;
}

/** The Swedish calendar date that `instant` falls on. */
export function stockholmDate(instant: number): LocalDate {
  const p = localParts(instant);
  return { year: p.year!, month: p.month!, day: p.day! };
}

/** ISO 8601 timestamp in Swedish local time with its UTC offset, e.g. `2026-10-16T14:00:00+02:00`. */
export function toStockholmIso(instant: number): string {
  const p = localParts(instant);
  const offsetMinutes = stockholmOffset(instant) / MINUTE_MS;
  const pad = (n: number) => String(n).padStart(2, "0");
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offset = `${sign}${pad(Math.floor(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`;
  return `${p.year}-${pad(p.month!)}-${pad(p.day!)}T${pad(p.hour!)}:${pad(p.minute!)}:${pad(p.second!)}${offset}`;
}

/** Adds `days` calendar days to a local date. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** The UTC instant of 00:00 Swedish time on `date`. */
export function stockholmStartOfDay(date: LocalDate): number {
  const midnightAsUtc = Date.UTC(date.year, date.month - 1, date.day);
  // DST changes happen at 02:00/03:00, so the offset found near midnight is the one at midnight.
  const guess = midnightAsUtc - stockholmOffset(midnightAsUtc);
  return midnightAsUtc - stockholmOffset(guess);
}

/** Start (inclusive) and end (exclusive) of a Swedish calendar day as UTC instants. 23, 24 or 25 hours long. */
export function stockholmDayBounds(date: LocalDate): { start: number; end: number } {
  return { start: stockholmStartOfDay(date), end: stockholmStartOfDay(addDays(date, 1)) };
}
