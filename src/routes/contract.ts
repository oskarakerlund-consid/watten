/**
 * The JSON bodies of the API. Only types and no imports of runtime-specific code, so the frontend can import them
 * too; the routes check their responses against them with `satisfies`.
 */
import type { PriceStatus } from "../domain/classify";
import type { Zone } from "../domain/types";

/** `GET /api/status` */
export interface PriceStatusResponse extends PriceStatus {
  zone: Zone;
  averageWindowHours: number;
}

/** `GET /api/cheapest`. Times are ISO 8601: UTC, and `…Local` in Swedish time with offset. */
export interface CheapestResponse {
  zone: Zone;
  interval: number;
  period: number;
  start: string;
  end: string;
  startLocal: string;
  endLocal: string;
  averageSekPerKwh: number;
  /** False if prices are only known for part of the period (e.g. tomorrow's are not published yet). */
  complete: boolean;
  knownUntil: string;
  knownUntilLocal: string;
}

/** `GET /api/thunder`. `start`/`end` are null when no thunder is expected. */
export interface ThunderResponse {
  lat: number;
  lon: number;
  hours: number;
  thresholdPercent: number;
  expected: boolean;
  start: string | null;
  end: string | null;
  startLocal: string | null;
  endLocal: string | null;
  maxProbabilityPercent: number;
  forecastFetched: string;
  /** True if MET could not be reached and an older forecast is used. */
  stale: boolean;
}
