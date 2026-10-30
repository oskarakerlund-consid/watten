import { ZONES, type Zone } from "../../../src/domain/types";

export { ZONES, type Zone };
export { ZONE_INFO, type ZoneInfo } from "../../../src/domain/zones";

export const isZone = (value: unknown): value is Zone => ZONES.includes(value as Zone);
