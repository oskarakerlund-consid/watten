import { type Position, roundPosition } from "./settings";

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
