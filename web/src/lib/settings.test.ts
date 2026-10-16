import { describe, expect, it } from "vitest";
import { loadSettings, roundPosition, savePosition, saveZone } from "./settings";

/** A minimal in-memory Storage. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
} as unknown as Storage;

describe("settings", () => {
  it("is empty on the first visit", () => {
    expect(loadSettings(memoryStorage())).toEqual({ zone: null, position: null });
  });

  it("saves and loads the zone and a rounded position", () => {
    const storage = memoryStorage();
    saveZone(storage, "SE4");
    savePosition(storage, { lat: 55.604_98, lon: 13.003_82 });

    expect(loadSettings(storage)).toEqual({ zone: "SE4", position: { lat: 55.6, lon: 13 } });
  });

  it("ignores invalid stored values", () => {
    const storage = memoryStorage({ "watten.zone": "SE9", "watten.position": '{"lat":"north"}' });
    expect(loadSettings(storage)).toEqual({ zone: null, position: null });
    expect(loadSettings(memoryStorage({ "watten.position": "not json" })).position).toBeNull();
  });

  it("works when storage is blocked", () => {
    expect(loadSettings(throwingStorage)).toEqual({ zone: null, position: null });
    expect(() => saveZone(throwingStorage, "SE3")).not.toThrow();
  });
});

describe("roundPosition", () => {
  it("rounds to two decimals", () => {
    expect(roundPosition({ lat: 59.329_34, lon: 18.068_63 })).toEqual({ lat: 59.33, lon: 18.07 });
  });
});
