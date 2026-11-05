import type { Position } from "../../../src/domain/position";
import type { Zone } from "./zones";

export type PriceLevel = "cheap" | "normal" | "expensive";

export interface PriceStatusResponse {
  zone: Zone;
  level: PriceLevel;
  currentSekPerKwh: number;
  averageSekPerKwh: number;
  thresholdSekPerKwh: number;
  averageWindowHours: number;
}

export interface CheapestResponse {
  start: string;
  end: string;
  averageSekPerKwh: number;
  /** False if prices are only known for part of the period (e.g. tomorrow's are not published yet). */
  complete: boolean;
  knownUntil: string;
}

export interface ThunderResponse {
  expected: boolean;
  start: string | null;
  end: string | null;
  maxProbabilityPercent: number;
  stale: boolean;
}

/** Either the data or a message to show instead. */
export type Result<T> = { ok: true; data: T } | { ok: false; message: string };

/** Longer than the API's own upstream timeout, so its error response arrives first. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Fetches JSON from the API. A failed request (offline, server unreachable) and a response that is not the
 * expected JSON get different messages, so the user can tell whether to check their connection.
 */
async function request<T>(url: string, init: RequestInit, errorMessage: (status: number) => string): Promise<Result<T>> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { ok: false, message: "Tjänsten svarade inte i tid. Försök igen om en stund." };
    }
    return { ok: false, message: "Kunde inte nå tjänsten. Kontrollera din internetanslutning." };
  }
  if (!response.ok) return { ok: false, message: errorMessage(response.status) };
  if (response.status === 204) return { ok: true, data: null as T };
  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, message: "Tjänsten gav ett oväntat svar. Försök igen om en stund." };
  }
}

/** Messages for the error statuses an endpoint is expected to answer; any other status gets `GENERIC_ERROR`. */
type ErrorMessages = Partial<Record<number, string>>;

const GENERIC_ERROR = "Något gick fel. Försök igen om en stund.";

function get<T>(path: string, params: Record<string, string | number>, messages: ErrorMessages): Promise<Result<T>> {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  return request<T>(`${path}?${query}`, {}, (status) => messages[status] ?? GENERIC_ERROR);
}

export const fetchStatus = (zone: Zone) =>
  get<PriceStatusResponse>("/api/status", { zone }, { 503: `Priserna för ${zone} är inte hämtade än. Försök igen om en stund.` });

export const fetchCheapest = (zone: Zone, interval: number, period: number) =>
  get<CheapestResponse>(
    "/api/cheapest",
    { zone, interval, period },
    { 503: `Priserna för ${zone} de kommande ${period} timmarna är inte kända än. Försök igen om en stund.` },
  );

export const fetchThunder = (lat: number, lon: number, hours: number) =>
  get<ThunderResponse>(
    "/api/thunder",
    { lat, lon, hours },
    {
      400: "Åskprognosen finns bara för platser i Sverige. Uppdatera din plats i inställningarna.",
      503: "Åskprognosen kunde inte hämtas just nu. Försök igen om en stund.",
    },
  );

function send<T>(method: "POST" | "DELETE", path: string, body: unknown, messages: ErrorMessages): Promise<Result<T | null>> {
  const init = { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  return request<T | null>(path, init, (status) => messages[status] ?? GENERIC_ERROR);
}

/** What the API stores for a push subscription. */
export interface SubscriptionRequest {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  zone: Zone;
  position: Position | null;
}

export const fetchPushKey = () => get<{ publicKey: string }>("/api/push/key", {}, { 503: "Notiser är inte tillgängliga just nu." });

export const saveSubscription = (request: SubscriptionRequest) =>
  send<{ created: boolean; confirmationSent: boolean }>("POST", "/api/push/subscribe", request, {
    400: "Webbläsarens push-tjänst stöds inte, eller så avvisade den prenumerationen. Prova en annan webbläsare.",
    409: "Tjänsten har nått max antal prenumerationer.",
    413: "Webbläsaren skickade en för stor prenumeration.",
    503: "Notiser är inte tillgängliga just nu.",
  });

export const removeSubscription = (endpoint: string) =>
  send<null>("DELETE", "/api/push/subscribe", { endpoint }, { 400: "Webbläsarens push-tjänst stöds inte, så prenumerationen kunde inte tas bort." });
