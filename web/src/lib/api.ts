import type { Zone } from "./zones";

export type PriceLevel = "cheap" | "normal" | "expensive";

export interface PriceStatus {
  zone: Zone;
  level: PriceLevel;
  currentSekPerKwh: number;
  averageSekPerKwh: number;
  thresholdSekPerKwh: number;
  averageWindowHours: number;
}

export interface CheapestWindow {
  start: string;
  end: string;
  averageSekPerKwh: number;
}

export interface ThunderForecast {
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

export const fetchStatus = (zone: Zone) => get<PriceStatus>("/api/status", { zone });

export const fetchCheapest = (zone: Zone, interval: number, period: number) =>
  get<CheapestWindow>("/api/cheapest", { zone, interval, period });

export const fetchThunder = (lat: number, lon: number, hours: number) =>
  get<ThunderForecast>("/api/thunder", { lat, lon, hours });
