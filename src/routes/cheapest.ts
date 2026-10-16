import { Hono } from "hono";
import { z } from "zod";
import { loadZoneIntervals } from "../db/prices";
import { cheapestWindow } from "../domain/prices";
import { HOUR_MS, toStockholmIso } from "../domain/time";
import type { AppEnv } from "./types";
import { validQuery, zoneSchema } from "./validation";

const querySchema = z
  .object({
    zone: zoneSchema,
    interval: z.coerce.number().int().min(1).max(6).default(2),
    period: z.coerce.number().int().min(1).max(24).default(8),
  })
  .refine((q) => q.interval <= q.period, { message: "interval must not be longer than period", path: ["interval"] });

export const cheapestRoute = new Hono<AppEnv>().get("/", validQuery(querySchema), async (c) => {
  const { zone, interval: intervalHours, period: periodHours } = c.req.valid("query");
  const now = c.get("now");

  const prices = await loadZoneIntervals(c.env.DB, zone, now, now + periodHours * HOUR_MS);
  const cheapest = cheapestWindow(prices, now, intervalHours * HOUR_MS, periodHours * HOUR_MS);
  if (!cheapest) return c.json({ error: `Not enough known prices for ${zone} in the next ${periodHours} hours` }, 503);

  return c.json({
    zone,
    interval: intervalHours,
    period: periodHours,
    start: new Date(cheapest.start).toISOString(),
    end: new Date(cheapest.end).toISOString(),
    startLocal: toStockholmIso(cheapest.start),
    endLocal: toStockholmIso(cheapest.end),
    averageSekPerKwh: cheapest.averageSekPerKwh,
  });
});
