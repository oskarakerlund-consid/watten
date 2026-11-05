import { env } from "cloudflare:workers";
import { upsertIntervalsStatement } from "../src/db/prices";
import { QUARTER_HOUR_MS } from "../src/domain/time";
import type { PriceInterval, Zone } from "../src/domain/types";

/** Stores quarter-hour prices for `zone`, starting at `start`, one price per hour (repeated four times). */
export async function seedHourlyPrices(zone: Zone, start: number, hourlyPrices: number[]): Promise<void> {
  const intervals: PriceInterval[] = hourlyPrices.flatMap((sekPerKwh, h) =>
    [0, 1, 2, 3].map((q) => {
      const s = start + (h * 4 + q) * QUARTER_HOUR_MS;
      return { start: s, end: s + QUARTER_HOUR_MS, sekPerKwh };
    }),
  );
  await env.DB.batch([upsertIntervalsStatement(env.DB, zone, intervals)]);
}
