import { z } from "zod";

const configSchema = z.object({
  /** Minimum difference from the recent average, in öre/kWh, for a price to count as cheap or expensive. */
  MIN_PRICE_DIFF_ORE_PER_KWH: z.coerce.number().min(0).default(20),
  /** Minimum difference from the recent average, in percent of it, for a price to count as cheap or expensive. */
  PRICE_DIFF_PERCENT: z.coerce.number().min(0).default(20),
  /** Length of the trailing window that "recent average" refers to. Capped so price ingestion stays within limits. */
  AVERAGE_WINDOW_HOURS: z.coerce.number().int().min(1).max(72).default(48),
  /** Probability of thunder, in percent, from which thunder counts as expected in an hour. */
  THUNDER_PROBABILITY_PERCENT: z.coerce.number().min(0).max(100).default(20),
  /** No price alerts from this hour (0–23, Swedish time)... */
  PRICE_ALERT_QUIET_FROM_HOUR: z.coerce.number().int().min(0).max(23).default(22),
  /** ...until this hour. Equal hours mean no quiet time. Thunder alerts are always sent. */
  PRICE_ALERT_QUIET_TO_HOUR: z.coerce.number().int().min(0).max(23).default(7),
  /** Identifying User-Agent required by MET Norway's terms of service. */
  MET_USER_AGENT: z.string().min(1),
});

export interface Config {
  minPriceDiffSekPerKwh: number;
  priceDiffPercent: number;
  averageWindowHours: number;
  thunderProbabilityPercent: number;
  priceAlertQuietFromHour: number;
  priceAlertQuietToHour: number;
  metUserAgent: string;
}

/** Reads tunable values from the Worker's vars (`wrangler.jsonc`). Throws if a value is invalid. */
export function parseConfig(env: Partial<Record<keyof z.input<typeof configSchema>, unknown>>): Config {
  const result = configSchema.safeParse({
    MIN_PRICE_DIFF_ORE_PER_KWH: env.MIN_PRICE_DIFF_ORE_PER_KWH,
    PRICE_DIFF_PERCENT: env.PRICE_DIFF_PERCENT,
    AVERAGE_WINDOW_HOURS: env.AVERAGE_WINDOW_HOURS,
    THUNDER_PROBABILITY_PERCENT: env.THUNDER_PROBABILITY_PERCENT,
    PRICE_ALERT_QUIET_FROM_HOUR: env.PRICE_ALERT_QUIET_FROM_HOUR,
    PRICE_ALERT_QUIET_TO_HOUR: env.PRICE_ALERT_QUIET_TO_HOUR,
    MET_USER_AGENT: env.MET_USER_AGENT,
  });
  if (!result.success) throw new Error(`Invalid Worker vars in wrangler.jsonc:\n${z.prettifyError(result.error)}`);
  const vars = result.data;
  return {
    minPriceDiffSekPerKwh: vars.MIN_PRICE_DIFF_ORE_PER_KWH / 100,
    priceDiffPercent: vars.PRICE_DIFF_PERCENT,
    averageWindowHours: vars.AVERAGE_WINDOW_HOURS,
    thunderProbabilityPercent: vars.THUNDER_PROBABILITY_PERCENT,
    priceAlertQuietFromHour: vars.PRICE_ALERT_QUIET_FROM_HOUR,
    priceAlertQuietToHour: vars.PRICE_ALERT_QUIET_TO_HOUR,
    metUserAgent: vars.MET_USER_AGENT,
  };
}

const pushConfigSchema = z.object({
  /** VAPID public key (base64url, uncompressed P-256 point). Not a secret; the browser needs it to subscribe. */
  VAPID_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9_-]{87}$/, "must be a base64url P-256 public key"),
  /** VAPID private key (base64url, the 32-byte P-256 scalar). A secret, set with `wrangler secret put`. */
  VAPID_PRIVATE_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "must be a base64url P-256 private key"),
  /** Contact for push services, a `mailto:` or `https:` URL. */
  VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)\S+$/, "must start with mailto: or https://"),
});

export interface PushConfig {
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
}

/** Reads the Web Push settings. Returns null if they are missing or invalid, so the rest of the API still works. */
export function parsePushConfig(env: Partial<Record<keyof z.input<typeof pushConfigSchema>, unknown>>): PushConfig | null {
  const result = pushConfigSchema.safeParse({
    VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: env.VAPID_SUBJECT,
  });
  if (!result.success) return null;
  return {
    vapidPublicKey: result.data.VAPID_PUBLIC_KEY,
    vapidPrivateKey: result.data.VAPID_PRIVATE_KEY,
    vapidSubject: result.data.VAPID_SUBJECT,
  };
}
