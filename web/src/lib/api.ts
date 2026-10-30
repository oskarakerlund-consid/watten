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

async function get<T>(path: string, params: Record<string, string | number>): Promise<Result<T>> {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  try {
    const response = await fetch(`${path}?${query}`);
    if (response.ok) return { ok: true, data: (await response.json()) as T };
    return { ok: false, message: response.status === 503 ? "Data saknas just nu." : "Något gick fel." };
  } catch {
    return { ok: false, message: "Kunde inte nå tjänsten." };
  }
}

export const fetchStatus = (zone: Zone) => get<PriceStatusResponse>("/api/status", { zone });

export const fetchCheapest = (zone: Zone, interval: number, period: number) =>
  get<CheapestResponse>("/api/cheapest", { zone, interval, period });

export const fetchThunder = (lat: number, lon: number, hours: number) =>
  get<ThunderResponse>("/api/thunder", { lat, lon, hours });

async function send<T>(method: "POST" | "DELETE", path: string, body: unknown): Promise<Result<T | null>> {
  try {
    const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (response.ok) return { ok: true, data: response.status === 204 ? null : ((await response.json()) as T) };
    return { ok: false, message: response.status === 503 ? "Notiser är inte tillgängliga just nu." : "Något gick fel." };
  } catch {
    return { ok: false, message: "Kunde inte nå tjänsten." };
  }
}

/** What the API stores for a push subscription. */
export interface SubscriptionRequest {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  zone: Zone;
  position: { lat: number; lon: number } | null;
}

export const fetchPushKey = () => get<{ publicKey: string }>("/api/push/key", {});

export const saveSubscription = (request: SubscriptionRequest) =>
  send<{ created: boolean; confirmationSent: boolean }>("POST", "/api/push/subscribe", request);

export const removeSubscription = (endpoint: string) => send<null>("DELETE", "/api/push/subscribe", { endpoint });
