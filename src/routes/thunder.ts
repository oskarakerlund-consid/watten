import { Hono } from "hono";
import { z } from "zod";
import { parseConfig } from "../config";
import { assessThunder } from "../domain/thunder";
import { toStockholmIso } from "../domain/time";
import { getThunderForecast } from "../services/thunderForecast";
import type { AppEnv } from "./types";
import { validQuery } from "./validation";

/** Rounded to about 1 km: protects privacy and lets nearby users share cached forecasts. */
const roundToTwoDecimals = (value: number) => Math.round(value * 100) / 100;

// A bounding box around Sweden. It also includes border areas of Norway, Finland and Denmark.
const querySchema = z.object({
  lat: z.coerce.number().min(55).max(69.1).transform(roundToTwoDecimals),
  lon: z.coerce.number().min(10.9).max(24.2).transform(roundToTwoDecimals),
  hours: z.coerce.number().int().min(1).max(24).default(8),
});

const isoOrNull = (instant: number | null) => (instant === null ? null : new Date(instant).toISOString());
const localOrNull = (instant: number | null) => (instant === null ? null : toStockholmIso(instant));

export const thunderRoute = new Hono<AppEnv>().get("/", validQuery(querySchema), async (c) => {
  const { lat, lon, hours } = c.req.valid("query");
  const now = c.get("now");
  const config = parseConfig(c.env);

  let forecast;
  try {
    forecast = await getThunderForecast(c.env.DB, c.get("fetcher"), config.metUserAgent, lat, lon, now);
  } catch (error) {
    console.error("Thunder forecast unavailable", error);
    return c.json({ error: "The weather forecast is not available right now" }, 503);
  }

  const assessment = assessThunder(forecast.hours, now, hours, config.thunderProbabilityPercent);
  if (!assessment) return c.json({ error: `The forecast does not cover the next ${hours} hours` }, 503);

  return c.json({
    lat,
    lon,
    hours,
    thresholdPercent: config.thunderProbabilityPercent,
    expected: assessment.expected,
    start: isoOrNull(assessment.start),
    end: isoOrNull(assessment.end),
    startLocal: localOrNull(assessment.start),
    endLocal: localOrNull(assessment.end),
    maxProbabilityPercent: assessment.maxProbability,
    forecastFetched: new Date(forecast.fetched).toISOString(),
    stale: forecast.stale,
  });
});
