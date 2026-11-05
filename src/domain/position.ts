/**
 * A bounding box around Sweden. It also includes border areas of Norway, Finland and Denmark.
 * Shared by the API's validation and the frontend, so the frontend never stores a position the API rejects.
 */
export const SWEDEN_BOUNDS = { minLat: 55, maxLat: 69.1, minLon: 10.9, maxLon: 24.2 } as const;

export function isInSwedenBounds(lat: number, lon: number): boolean {
  const b = SWEDEN_BOUNDS;
  return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon;
}
