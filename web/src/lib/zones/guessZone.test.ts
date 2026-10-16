import { describe, expect, it } from "vitest";
import { guessZone } from "./guessZone";
import zoneData from "./zones.json";

describe("guessZone", () => {
  it.each([
    ["Kiruna", 67.86, 20.23, "SE1"],
    ["Luleå", 65.58, 22.15, "SE1"],
    ["Haparanda", 65.84, 24.14, "SE1"],
    ["Sundsvall", 62.39, 17.31, "SE2"],
    ["Östersund", 63.18, 14.64, "SE2"],
    ["Stockholm", 59.33, 18.07, "SE3"],
    ["Uppsala", 59.86, 17.64, "SE3"],
    ["Göteborg", 57.71, 11.97, "SE3"],
    ["Visby", 57.64, 18.29, "SE3"],
    ["Malmö", 55.61, 13.0, "SE4"],
    ["Karlskrona", 56.16, 15.59, "SE4"],
    ["Ystad", 55.43, 13.82, "SE4"],
  ])("puts %s in the right zone", (_name, lat, lon, zone) => {
    expect(guessZone(zoneData, lat, lon)).toBe(zone);
  });

  it.each([
    ["Oslo", 59.91, 10.75],
    ["Helsinki", 60.17, 24.94],
    ["Copenhagen", 55.68, 12.57],
  ])("returns null for %s", (_name, lat, lon) => {
    expect(guessZone(zoneData, lat, lon)).toBeNull();
  });

  it("uses the nearest zone just outside a polygon", () => {
    const square = [
      [18, 59],
      [18.1, 59],
      [18.1, 59.1],
      [18, 59.1],
      [18, 59],
    ];
    const data = { zones: { SE3: [square] } };

    expect(guessZone(data, 59.05, 18.05)).toBe("SE3"); // inside
    expect(guessZone(data, 59.05, 18.2)).toBe("SE3"); // about 5.7 km east
    expect(guessZone(data, 59.05, 18.3)).toBeNull(); // about 11 km east
    expect(guessZone(data, 59.05, 18.2, 5)).toBeNull();
  });
});
