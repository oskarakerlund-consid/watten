import { isInSwedenBounds, type Position, roundPosition } from "../../../src/domain/position";

export { type Position, roundPosition };
import { isZone, type Zone } from "./zones";

export interface Settings {
  zone: Zone | null;
  position: Position | null;
}

const ZONE_KEY = "watten.zone";
const POSITION_KEY = "watten.position";

/**
 * The browser's `localStorage`, or null if it is blocked. Some browsers throw already when the property is read,
 * e.g. when the user blocks all site data.
 */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null; // storage can be unavailable, e.g. in private browsing
  }
}

function write(storage: Storage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
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
      // Positions outside Sweden (stored by older versions) are dropped: the API rejects them.
      if (typeof lat === "number" && typeof lon === "number" && isInSwedenBounds(lat, lon)) {
        return { lat, lon };
      }
    }
  } catch {
    // ignore invalid stored data
  }
  return null;
}

export function loadSettings(storage: Storage | null): Settings {
  const zone = read(storage, ZONE_KEY);
  return { zone: isZone(zone) ? zone : null, position: parsePosition(read(storage, POSITION_KEY)) };
}

export function saveZone(storage: Storage | null, zone: Zone): void {
  write(storage, ZONE_KEY, zone);
}

export function savePosition(storage: Storage | null, position: Position): void {
  write(storage, POSITION_KEY, JSON.stringify(roundPosition(position)));
}
