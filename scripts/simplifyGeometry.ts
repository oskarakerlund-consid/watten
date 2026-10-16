/** A position as `[longitude, latitude]` in degrees (GeoJSON order). */
export type Position = [number, number];
/** A closed ring: the first and last positions are equal. */
export type Ring = Position[];

const KM_PER_DEGREE_LAT = 111.32;

/** Squared distance in km² from `p` to the segment `a`–`b`, using a local equirectangular projection. */
function squaredSegmentDistanceKm(p: Position, a: Position, b: Position, cosLat: number): number {
  const toKm = ([lon, lat]: Position) => [lon * KM_PER_DEGREE_LAT * cosLat, lat * KM_PER_DEGREE_LAT] as const;
  const [px, py] = toKm(p);
  const [ax, ay] = toKm(a);
  const [bx, by] = toKm(b);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

/**
 * Douglas–Peucker simplification of a closed ring. Points closer than `toleranceKm` to the simplified outline are
 * removed. Returns `null` if the ring collapses to fewer than four positions (a closed triangle).
 */
export function simplifyRing(ring: Ring, toleranceKm: number): Ring | null {
  if (ring.length < 4) return null;
  const cosLat = Math.cos((ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length) * (Math.PI / 180));
  const toleranceSquared = toleranceKm * toleranceKm;
  const keep = new Array<boolean>(ring.length).fill(false);
  keep[0] = true;
  keep[ring.length - 1] = true;

  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let farthestDistance = toleranceSquared;
    for (let i = first + 1; i < last; i++) {
      const distance = squaredSegmentDistanceKm(ring[i]!, ring[first]!, ring[last]!, cosLat);
      if (distance > farthestDistance) {
        farthest = i;
        farthestDistance = distance;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = true;
      stack.push([first, farthest], [farthest, last]);
    }
  }

  const simplified = ring.filter((_, i) => keep[i]);
  return simplified.length >= 4 ? simplified : null;
}

/** Rounds every coordinate to `decimals` decimals (3 decimals ≈ 100 m). */
export function roundRing(ring: Ring, decimals: number): Ring {
  const factor = 10 ** decimals;
  return ring.map(([lon, lat]) => [Math.round(lon * factor) / factor, Math.round(lat * factor) / factor]);
}

interface GeoJsonMultiPolygonCollection {
  type: "FeatureCollection";
  features: { geometry: { type: "MultiPolygon"; coordinates: Ring[][] } }[];
}

/**
 * Turns one zone's GeoJSON FeatureCollection of MultiPolygons into simplified, rounded outer rings.
 * Throws if the input has holes, since the zone lookup does not support them.
 */
export function simplifyZone(geojson: GeoJsonMultiPolygonCollection, toleranceKm: number, decimals: number): Ring[] {
  const rings: Ring[] = [];
  for (const feature of geojson.features) {
    if (feature.geometry.type !== "MultiPolygon") throw new Error(`Unsupported geometry ${feature.geometry.type}`);
    for (const polygon of feature.geometry.coordinates) {
      if (polygon.length !== 1) throw new Error("Polygons with holes are not supported");
      const simplified = simplifyRing(polygon[0]!, toleranceKm);
      if (simplified) rings.push(roundRing(simplified, decimals));
    }
  }
  return rings;
}
