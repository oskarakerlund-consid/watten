import { describe, expect, it } from "vitest";
import { toLocationUpdate } from "./geolocation";
import zoneData from "./zones/zones.json";

describe("toLocationUpdate", () => {
  it("stores the position and chooses the guessed zone", () => {
    const position = { lat: 59.33, lon: 18.07 };
    expect(toLocationUpdate({ ok: true, position }, zoneData)).toEqual({ position, zone: "SE3", message: null });
  });

  it("stores the position but asks for a zone when it is outside Sweden", () => {
    const position = { lat: 59.91, lon: 10.75 };
    const update = toLocationUpdate({ ok: true, position }, zoneData);
    expect(update.position).toEqual(position);
    expect(update.zone).toBeNull();
    expect(update.message).toMatch(/utanför Sverige/);
  });

  it("keeps position and zone and passes on the message when locating failed", () => {
    expect(toLocationUpdate({ ok: false, message: "Platsåtkomst nekades." }, zoneData)).toEqual({
      position: null,
      zone: null,
      message: "Platsåtkomst nekades.",
    });
  });
});
