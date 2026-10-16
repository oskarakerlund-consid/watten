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
  const { zone, interval, period } = c.req.valid("query");
  const now = c.get("now");

  const intervals = await loadZoneIntervals(c.env.DB, zone, now, now + period * HOUR_MS);
  const window = cheapestWindow(intervals, now, interval * HOUR_MS, period * HOUR_MS);
  if (!window) return c.json({ error: `Not enough known prices for ${zone} in the next ${period} hours` }, 503);

  return c.json({
    zone,
    interval,
    period,
    start: new Date(window.start).toISOString(),
    end: new Date(window.end).toISOString(),
    startLocal: toStockholmIso(window.start),
    endLocal: toStockholmIso(window.end),
    averageSekPerKwh: window.averageSekPerKwh,
  });
});
