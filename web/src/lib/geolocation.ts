import { type Position, roundPosition } from "./settings";
import { isZone, type Zone } from "./zones";
import { guessZone, type ZoneData } from "./zones/guessZone";

export type LocateResult = { ok: true; position: Position } | { ok: false; message: string };

/** Asks the browser for the current position. Call only from a user action, never on page load. */
export function locate(): Promise<LocateResult> {
  if (!("geolocation" in navigator)) {
    return Promise.resolve({ ok: false, message: "Din webbläsare kan inte dela plats. Välj elområde manuellt." });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ ok: true, position: roundPosition({ lat: coords.latitude, lon: coords.longitude }) }),
      (error) =>
        resolve({
          ok: false,
          message:
            error.code === error.PERMISSION_DENIED
              ? "Platsåtkomst nekades. Välj elområde manuellt."
              : "Kunde inte hämta din plats. Försök igen eller välj elområde manuellt.",
        }),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60_000 },
    );
  });
}

/** What a location attempt changes in the app. */
export interface LocationUpdate {
  /** Position to store, or `null` to keep the current one. */
  position: Position | null;
  /** Zone to choose, or `null` to keep the current one. */
  zone: Zone | null;
  /** Shown to the user when no zone could be chosen automatically. */
  message: string | null;
}

/** Turns a location result into a new position and a guessed zone, or a message asking the user to choose. */
export function toLocationUpdate(result: LocateResult, zones: ZoneData): LocationUpdate {
  if (!result.ok) return { position: null, zone: null, message: result.message };
  const guessed = guessZone(zones, result.position.lat, result.position.lon);
  if (isZone(guessed)) return { position: result.position, zone: guessed, message: null };
  return {
    position: result.position,
    zone: null,
    message: "Din plats verkar ligga utanför Sverige. Välj elområde manuellt.",
  };
}
