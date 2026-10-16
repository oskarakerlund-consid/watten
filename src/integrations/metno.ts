import { z } from "zod";
import type { ThunderHour } from "../domain/thunder";

const BASE_URL = "https://api.met.no/weatherapi/locationforecast/2.0/complete";

/** Fallback cache lifetime when MET does not send a usable `Expires` header. */
const DEFAULT_TTL_MS = 30 * 60_000;

const responseSchema = z.object({
  properties: z.object({
    timeseries: z.array(
      z.object({
        time: z.iso.datetime(),
        data: z.object({
          next_1_hours: z.object({ details: z.object({ probability_of_thunder: z.number().min(0).max(100).optional() }) }).optional(),
        }),
      }),
    ),
  }),
});

export type HttpFetcher = (url: string, init: RequestInit) => Promise<Response>;

export type ForecastResult =
  | { status: "ok"; hours: ThunderHour[]; expires: number; lastModified: string | null }
  | { status: "not-modified"; expires: number };

/** MET requires at most 4 decimals; more gives HTTP 403. */
const toFourDecimals = (value: number) => Math.round(value * 10_000) / 10_000;

export function forecastUrl(lat: number, lon: number): string {
  return `${BASE_URL}?lat=${toFourDecimals(lat)}&lon=${toFourDecimals(lon)}`;
}

function expiresAt(response: Response, now: number): number {
  const expires = Date.parse(response.headers.get("Expires") ?? "");
  return Number.isNaN(expires) || expires <= now ? now + DEFAULT_TTL_MS : expires;
}

/**
 * Fetches MET Norway's complete forecast for a position and extracts the hourly probability of thunder.
 * Sends the identifying `User-Agent` MET requires and `If-Modified-Since` when given.
 * Throws on HTTP errors (including 429) and invalid data.
 */
export async function fetchThunderForecast(
  fetcher: HttpFetcher,
  userAgent: string,
  lat: number,
  lon: number,
  now: number,
  ifModifiedSince?: string,
): Promise<ForecastResult> {
  const url = forecastUrl(lat, lon);
  const headers: Record<string, string> = { "User-Agent": userAgent };
  if (ifModifiedSince) headers["If-Modified-Since"] = ifModifiedSince;

  const response = await fetcher(url, { headers });
  if (response.status === 304) return { status: "not-modified", expires: expiresAt(response, now) };
  if (!response.ok) throw new Error(`MET Norway responded ${response.status} for ${url}`);

  const body = responseSchema.parse(await response.json());
  const hours: ThunderHour[] = [];
  for (const step of body.properties.timeseries) {
    const probability = step.data.next_1_hours?.details.probability_of_thunder;
    if (probability !== undefined) hours.push({ start: Date.parse(step.time), probability });
  }

  return { status: "ok", hours, expires: expiresAt(response, now), lastModified: response.headers.get("Last-Modified") };
}

