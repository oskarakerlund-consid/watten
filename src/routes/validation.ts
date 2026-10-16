import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ZONES } from "../domain/types";

export const zoneSchema = z.enum(ZONES);

/** Validates query parameters and responds 400 with a readable message when they are invalid. */
export const validQuery = <T extends z.ZodType>(schema: T) =>
  zValidator("query", schema, (result, c) => {
    if (!result.success) return c.json({ error: z.prettifyError(result.error) }, 400);
  });
