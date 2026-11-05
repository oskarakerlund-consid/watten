/**
 * The Cron Triggers. Must match `triggers.crons` in wrangler.jsonc, which `src/crons.test.ts` checks.
 * Alerts run every 5 minutes, 2 minutes after each price ingestion.
 */
export const PRICE_CRON = "*/15 * * * *";
export const ALERTS_CRON = "2,7,12,17,22,27,32,37,42,47,52,57 * * * *";
