import { type ClassificationSettings, classifyPrice } from "./classify";
import { assessThunder, type ThunderHour } from "./thunder";
import { HOUR_MS, MINUTE_MS, stockholmClock, stockholmTimeOfDay } from "./time";
import type { PriceInterval, Zone } from "./types";

/** A price alert is sent this long before an unusually cheap or expensive period starts. */
export const PRICE_LEAD_MS = HOUR_MS;
/** A thunder alert is sent when thunder is expected within this many hours. */
export const THUNDER_LEAD_HOURS = 2;
/**
 * A subscriber gets at most one alert of each kind for periods starting within this long of each other.
 * It stops repeats when a forecast shifts or a price level flickers between cheap and normal.
 */
export const ALERT_COOLDOWN_MS: Record<AlertKind, number> = { cheap: 3 * HOUR_MS, expensive: 3 * HOUR_MS, thunder: 6 * HOUR_MS };

const STEP_MS = 15 * MINUTE_MS;

export type AlertKind = "cheap" | "expensive" | "thunder";

export interface Alert {
  kind: AlertKind;
  /** Start of the period the alert is about (UTC epoch ms). */
  start: number;
  title: string;
  body: string;
}

const formatSek = (value: number) => value.toFixed(2).replace(".", ",");

export interface PriceAlertSettings extends ClassificationSettings {
  /** No price alerts from this hour (Swedish time)... */
  priceAlertQuietFromHour: number;
  /** ...until this hour. Equal hours mean no quiet time. Thunder alerts are always sent. */
  priceAlertQuietToHour: number;
}

/** True if `now` is within the quiet hours `[fromHour, toHour)` in Swedish time, which may span midnight. */
export function isPriceQuietTime(now: number, fromHour: number, toHour: number): boolean {
  const { hour } = stockholmTimeOfDay(now);
  if (fromHour === toHour) return false;
  return fromHour < toHour ? hour >= fromHour && hour < toHour : hour >= fromHour || hour < toHour;
}

/**
 * The price alert due at `now` for a zone, if any: an unusually cheap or expensive period that starts within
 * the lead time. A period starts at a quarter-hour whose level (as the API would classify it then) is cheap or
 * expensive and differs from the quarter-hour before. Since the classification looks one hour ahead, that is
 * when the page changes color, which can be up to 45 minutes before the price itself changes.
 * Returns null during quiet hours, and for a period whose previous quarter-hour cannot be classified.
 */
export function duePriceAlert(
  zone: Zone,
  intervals: readonly PriceInterval[],
  now: number,
  settings: PriceAlertSettings,
): Alert | null {
  if (isPriceQuietTime(now, settings.priceAlertQuietFromHour, settings.priceAlertQuietToHour)) return null;
  const firstStep = Math.floor(now / STEP_MS) * STEP_MS + STEP_MS;
  let previous = classifyPrice(intervals, firstStep - STEP_MS, settings)?.level ?? null;

  for (let start = firstStep; start <= now + PRICE_LEAD_MS; start += STEP_MS) {
    const status = classifyPrice(intervals, start, settings);
    const level = status?.level ?? null;
    // An unknown previous level (missing prices) is not a change: the period may already have been going on.
    if (status && previous !== null && level !== "normal" && level !== previous) {
      const kind = status.level as "cheap" | "expensive";
      const clock = stockholmClock(start);
      return {
        kind,
        start,
        title: kind === "cheap" ? `Billig el från ca ${clock}` : `Dyr el från ca ${clock}`,
        body: `${zone}: ca ${formatSek(status.currentSekPerKwh)} kr/kWh, jämfört med snittet ${formatSek(status.averageSekPerKwh)} kr/kWh.`,
      };
    }
    previous = level;
  }
  return null;
}

/** The thunder alert due at `now` for a position's forecast, if thunder is expected within the lead time. */
export function dueThunderAlert(hours: readonly ThunderHour[], now: number, thresholdPercent: number): Alert | null {
  const assessment = assessThunder(hours, now, THUNDER_LEAD_HOURS, thresholdPercent);
  if (!assessment?.expected || assessment.start === null) return null;
  const when = assessment.start <= now ? "nu" : `från ca ${stockholmClock(assessment.start)}`;
  return {
    kind: "thunder",
    start: assessment.start,
    title: `Åska väntas ${when}`,
    body: `Upp till ${Math.round(assessment.maxProbability)} % risk. Undvik att ladda elbilen och att använda känslig elektronik.`,
  };
}

/** A previously sent alert, as stored for deduplication. */
export interface SentAlert {
  kind: AlertKind;
  start: number;
}

/** True if a subscriber already got an alert of the same kind for a period close to this one. */
export function alreadySent(alert: Alert, sent: readonly SentAlert[]): boolean {
  const cooldown = ALERT_COOLDOWN_MS[alert.kind];
  return sent.some((s) => s.kind === alert.kind && Math.abs(s.start - alert.start) < cooldown);
}
