import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { roundCoordinate, SWEDEN_BOUNDS } from "../domain/position";
import { ZONES } from "../domain/types";

export const zoneSchema = z.enum(ZONES);

// Within SWEDEN_BOUNDS. Takes the number schema so query strings can coerce and JSON bodies cannot.
export const latSchema = (number: z.ZodNumber) =>
  number.min(SWEDEN_BOUNDS.minLat).max(SWEDEN_BOUNDS.maxLat).transform(roundCoordinate);
export const lonSchema = (number: z.ZodNumber) =>
  number.min(SWEDEN_BOUNDS.minLon).max(SWEDEN_BOUNDS.maxLon).transform(roundCoordinate);

/** Validates the request's query parameters or JSON body, and responds 400 with a readable message when invalid. */
const valid = <Target extends "query" | "json", T extends z.ZodType>(target: Target, schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
  });

export const validQuery = <T extends z.ZodType>(schema: T) => valid("query", schema);
export const validJson = <T extends z.ZodType>(schema: T) => valid("json", schema);
