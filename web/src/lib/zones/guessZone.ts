/** Closed rings of `[longitude, latitude]` positions. Typed loosely to accept the imported JSON. */
type Ring = number[][];

export interface ZoneData {
  zones: Record<string, Ring[]>;
}

const KM_PER_DEGREE_LAT = 111.32;

/** Ray casting: is `[lon, lat]` inside the ring? */
function isInside(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance in km from a point to the ring's outline, in a local equirectangular projection. */
function distanceToRingKm(lon: number, lat: number, ring: Ring): number {
  const kmX = KM_PER_DEGREE_LAT * Math.cos(lat * (Math.PI / 180));
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const ax = ring[i]![0]!;
    const ay = ring[i]![1]!;
    const bx = ring[i + 1]![0]!;
    const by = ring[i + 1]![1]!;
    const dx = (bx - ax) * kmX;
    const dy = (by - ay) * KM_PER_DEGREE_LAT;
    const px = (lon - ax) * kmX;
    const py = (lat - ay) * KM_PER_DEGREE_LAT;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared));
    best = Math.min(best, Math.hypot(px - t * dx, py - t * dy));
  }
  return best;
}

/**
 * Guesses the price zone for a position: the zone whose polygon contains it, otherwise the nearest zone within
 * `maxDistanceKm` (coasts, islands lost in simplification). Returns `null` if no zone is close enough.
 * The polygons are simplified and unofficial, so the guess can be wrong near zone borders.
 */
export function guessZone(data: ZoneData, lat: number, lon: number, maxDistanceKm = 10): string | null {
  for (const [zone, rings] of Object.entries(data.zones)) {
    if (rings.some((ring) => isInside(lon, lat, ring))) return zone;
  }

  let nearest: string | null = null;
  let nearestDistance = maxDistanceKm;
  for (const [zone, rings] of Object.entries(data.zones)) {
    for (const ring of rings) {
      const distance = distanceToRingKm(lon, lat, ring);
      if (distance <= nearestDistance) {
        nearest = zone;
        nearestDistance = distance;
      }
    }
  }
  return nearest;
}
