import { Hono } from "hono";
import { z } from "zod";
import { parseConfig } from "../config";
import { loadZoneIntervals } from "../db/prices";
import { classifyPrice } from "../domain/classify";
import { HOUR_MS } from "../domain/time";
import type { AppEnv } from "./types";
import { validQuery, zoneSchema } from "./validation";

export const statusRoute = new Hono<AppEnv>().get("/", validQuery(z.object({ zone: zoneSchema })), async (c) => {
  const { zone } = c.req.valid("query");
  const now = c.get("now");
  const config = parseConfig(c.env);

  const intervals = await loadZoneIntervals(c.env.DB, zone, now - config.averageWindowHours * HOUR_MS, now + HOUR_MS);
  const status = classifyPrice(intervals, now, config);
  if (!status) return c.json({ error: `Prices for ${zone} are not available yet` }, 503);

  return c.json({ zone, averageWindowHours: config.averageWindowHours, ...status });
});
