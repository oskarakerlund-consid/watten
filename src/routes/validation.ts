import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ZONES } from "../domain/types";

export const zoneSchema = z.enum(ZONES);

/** Rounded to about 1 km: protects privacy and lets nearby users share cached forecasts. */
const roundToTwoDecimals = (value: number) => Math.round(value * 100) / 100;

// A bounding box around Sweden. It also includes border areas of Norway, Finland and Denmark.
// Takes the number schema so query strings can coerce and JSON bodies cannot.
export const latSchema = (number: z.ZodNumber) => number.min(55).max(69.1).transform(roundToTwoDecimals);
export const lonSchema = (number: z.ZodNumber) => number.min(10.9).max(24.2).transform(roundToTwoDecimals);

/** Validates query parameters and responds 400 with a readable message when they are invalid. */
export const validQuery = <T extends z.ZodType>(schema: T) =>
  zValidator("query", schema, (result, c) => {
    if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
  });

/** Validates a JSON request body and responds 400 with a readable message when it is invalid. */
export const validJson = <T extends z.ZodType>(schema: T) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
  });
