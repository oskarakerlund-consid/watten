import { TIME_ZONE } from "../../../src/domain/time";

const timeFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Price in whole öre per kWh, e.g. `118 öre/kWh`. */
export const formatPrice = (sekPerKwh: number) => `${Math.round(sekPerKwh * 100)} öre/kWh`;

/**
 * The calendar day after `date` (`YYYY-MM-DD`). Counted in days, not as 24 hours later: a day with a DST change
 * is 23 or 25 hours long.
 */
function nextDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + 1)).toISOString().slice(0, 10);
}

/** Time in Swedish local time, prefixed with "i morgon" when it is on the next local day. */
export function formatTime(instant: Date, now: Date): string {
  const time = timeFormat.format(instant);
  const date = dateFormat.format(instant);
  const today = dateFormat.format(now);
  if (date === today) return time;
  if (date === nextDate(today)) return `i morgon ${time}`;
  return `${date} ${time}`;
}

/** A span like `22:30–00:30`, or `nu–23:30` if it has already started. */
export function formatSpan(start: Date, end: Date, now: Date): string {
  const from = start.getTime() <= now.getTime() + 60_000 ? "nu" : formatTime(start, now);
  return `${from}–${timeFormat.format(end)}`;
}
