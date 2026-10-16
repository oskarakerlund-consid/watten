import { isZone, type Zone } from "./zones";

export interface Position {
  lat: number;
  lon: number;
}

export interface Settings {
  zone: Zone | null;
  position: Position | null;
}

const ZONE_KEY = "watten.zone";
const POSITION_KEY = "watten.position";

/** Rounds to two decimals (about 1 km), so a precise position is never stored or sent. */
export const roundPosition = ({ lat, lon }: Position): Position => ({
  lat: Math.round(lat * 100) / 100,
  lon: Math.round(lon * 100) / 100,
});

function read(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null; // storage can be unavailable, e.g. in private browsing
  }
}

function write(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Settings then only last for this visit.
  }
}

function parsePosition(raw: string | null): Position | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === "object" && value !== null && "lat" in value && "lon" in value) {
      const { lat, lon } = value;
      if (typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon)) {
        return { lat, lon };
      }
    }
  } catch {
    // ignore invalid stored data
  }
  return null;
}

export function loadSettings(storage: Storage): Settings {
  const zone = read(storage, ZONE_KEY);
  return { zone: isZone(zone) ? zone : null, position: parsePosition(read(storage, POSITION_KEY)) };
}

export function saveZone(storage: Storage, zone: Zone): void {
  write(storage, ZONE_KEY, zone);
}

export function savePosition(storage: Storage, position: Position): void {
  write(storage, POSITION_KEY, JSON.stringify(roundPosition(position)));
}
