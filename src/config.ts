import { z } from "zod";
import type { AlertKind } from "./domain/alerts";

const HOUR_MS = 3_600_000;

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
  /**
   * Minutes before an unusually cheap or expensive period that its alert is sent. At least an hour, so the alert
   * job (a few pushes per run) reaches every subscriber before the period starts.
   */
  PRICE_ALERT_LEAD_MINUTES: z.coerce.number().int().min(60).max(240).default(60),
  /** A thunder alert is sent when thunder is expected within this many hours. */
  THUNDER_ALERT_LEAD_HOURS: z.coerce.number().int().min(1).max(12).default(2),
  /** At most one price alert of the same kind for periods starting within this many hours of each other. */
  PRICE_ALERT_COOLDOWN_HOURS: z.coerce.number().int().min(1).max(12).default(3),
  /** At most one thunder alert for periods starting within this many hours of each other. */
  THUNDER_ALERT_COOLDOWN_HOURS: z.coerce.number().int().min(1).max(12).default(6),
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
  priceAlertLeadMs: number;
  thunderAlertLeadHours: number;
  alertCooldownMs: Record<AlertKind, number>;
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
    PRICE_ALERT_LEAD_MINUTES: env.PRICE_ALERT_LEAD_MINUTES,
    THUNDER_ALERT_LEAD_HOURS: env.THUNDER_ALERT_LEAD_HOURS,
    PRICE_ALERT_COOLDOWN_HOURS: env.PRICE_ALERT_COOLDOWN_HOURS,
    THUNDER_ALERT_COOLDOWN_HOURS: env.THUNDER_ALERT_COOLDOWN_HOURS,
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
    priceAlertLeadMs: vars.PRICE_ALERT_LEAD_MINUTES * 60_000,
    thunderAlertLeadHours: vars.THUNDER_ALERT_LEAD_HOURS,
    alertCooldownMs: {
      cheap: vars.PRICE_ALERT_COOLDOWN_HOURS * HOUR_MS,
      expensive: vars.PRICE_ALERT_COOLDOWN_HOURS * HOUR_MS,
      thunder: vars.THUNDER_ALERT_COOLDOWN_HOURS * HOUR_MS,
    },
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
