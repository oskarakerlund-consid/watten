import { describe, expect, it } from "vitest";
import { type Ring, roundRing, simplifyRing, simplifyZone } from "./simplifyGeometry";

// A square of about 11 × 11 km at the equator with a slightly bumped bottom edge.
const square: Ring = [
  [0, 0],
  [0.05, 0.0001],
  [0.1, 0],
  [0.1, 0.1],
  [0, 0.1],
  [0, 0],
];

describe("simplifyRing", () => {
  it("removes points closer than the tolerance and keeps the ring closed", () => {
    expect(simplifyRing(square, 1)).toEqual([
      [0, 0],
      [0.1, 0],
      [0.1, 0.1],
      [0, 0.1],
      [0, 0],
    ]);
  });

  it("keeps points farther away than the tolerance", () => {
    // The bump is about 11 m, so a 5 m tolerance keeps it.
    expect(simplifyRing(square, 0.005)).toEqual(square);
  });

  it("drops rings that collapse", () => {
    const sliver: Ring = [
      [0, 0],
      [0.001, 0.001],
      [0.002, 0],
      [0, 0],
    ];
    expect(simplifyRing(sliver, 1)).toBeNull();
  });

  it("measures longitude distances shrinking with latitude", () => {
    // A point 0.02° of longitude east of a north–south edge: about 2.2 km away at the equator, 1.1 km at 60° N.
    const bump = (lat: number): Ring => [
      [0, lat],
      [1, lat],
      [1.02, lat + 0.5],
      [1, lat + 1],
      [0, lat + 1],
      [0, lat],
    ];
    expect(simplifyRing(bump(0), 1.5)).toContainEqual([1.02, 0.5]);
    expect(simplifyRing(bump(60), 1.5)).not.toContainEqual([1.02, 60.5]);
  });
});

describe("roundRing", () => {
  it("rounds coordinates", () => {
    expect(roundRing([[18.068_63, 59.329_34]], 3)).toEqual([[18.069, 59.329]]);
  });
});

describe("simplifyZone", () => {
  const collection = (coordinates: Ring[][]) => ({
    type: "FeatureCollection" as const,
    features: [{ geometry: { type: "MultiPolygon" as const, coordinates } }],
  });

  it("simplifies and rounds every polygon", () => {
    expect(simplifyZone(collection([[square], [square]]), 1, 1)).toHaveLength(2);
  });

  it("rejects polygons with holes", () => {
    expect(() => simplifyZone(collection([[square, square]]), 1, 3)).toThrow("holes");
  });
});
