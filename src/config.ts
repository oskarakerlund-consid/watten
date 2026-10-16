import { z } from "zod";

const configSchema = z.object({
  /** Minimum difference from the recent average, in öre/kWh, for a price to count as cheap or expensive. */
  MIN_PRICE_DIFF_ORE_PER_KWH: z.coerce.number().min(0).default(50),
  /** Minimum difference from the recent average, in percent of it, for a price to count as cheap or expensive. */
  PRICE_DIFF_PERCENT: z.coerce.number().min(0).default(20),
  /** Length of the trailing window that "recent average" refers to. Capped so price ingestion stays within limits. */
  AVERAGE_WINDOW_HOURS: z.coerce.number().int().min(1).max(72).default(48),
});

export interface Config {
  minPriceDiffSekPerKwh: number;
  priceDiffPercent: number;
  averageWindowHours: number;
}

/** Reads tunable values from the Worker's vars (`wrangler.jsonc`). Throws if a value is invalid. */
export function parseConfig(env: Partial<Record<keyof z.input<typeof configSchema>, unknown>>): Config {
  const vars = configSchema.parse({
    MIN_PRICE_DIFF_ORE_PER_KWH: env.MIN_PRICE_DIFF_ORE_PER_KWH,
    PRICE_DIFF_PERCENT: env.PRICE_DIFF_PERCENT,
    AVERAGE_WINDOW_HOURS: env.AVERAGE_WINDOW_HOURS,
  });
  return {
    minPriceDiffSekPerKwh: vars.MIN_PRICE_DIFF_ORE_PER_KWH / 100,
    priceDiffPercent: vars.PRICE_DIFF_PERCENT,
    averageWindowHours: vars.AVERAGE_WINDOW_HOURS,
  };
}
