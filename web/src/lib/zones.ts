import { ZONES, type Zone } from "../../../src/domain/types";

export { ZONES, type Zone };

export interface ZoneInfo {
  name: string;
  /** Representative position for the thunder forecast when the user has not shared a position. */
  city: string;
  lat: number;
  lon: number;
}

export const ZONE_INFO: Record<Zone, ZoneInfo> = {
  SE1: { name: "Norra Norrland", city: "Luleå", lat: 65.58, lon: 22.15 },
  SE2: { name: "Södra Norrland", city: "Sundsvall", lat: 62.39, lon: 17.31 },
  SE3: { name: "Mellansverige", city: "Stockholm", lat: 59.33, lon: 18.07 },
  SE4: { name: "Södra Sverige", city: "Malmö", lat: 55.61, lon: 13.0 },
};

export const isZone = (value: unknown): value is Zone => ZONES.includes(value as Zone);
