const timeFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" });

/** Price in whole öre per kWh, e.g. `118 öre/kWh`. */
export const formatPrice = (sekPerKwh: number) => `${Math.round(sekPerKwh * 100)} öre/kWh`;

/** Time in Swedish local time, prefixed with "i morgon" when it is on the next local day. */
export function formatTime(instant: Date, now: Date): string {
  const time = timeFormat.format(instant);
  const tomorrow = new Date(now.getTime() + 24 * 3_600_000);
  if (dateFormat.format(instant) === dateFormat.format(now)) return time;
  if (dateFormat.format(instant) === dateFormat.format(tomorrow)) return `i morgon ${time}`;
  return `${dateFormat.format(instant)} ${time}`;
}

/** A span like `22:30–00:30`, or `nu–23:30` if it has already started. */
export function formatSpan(start: Date, end: Date, now: Date): string {
  const from = start.getTime() <= now.getTime() + 60_000 ? "nu" : formatTime(start, now);
  return `${from}–${timeFormat.format(end)}`;
}
