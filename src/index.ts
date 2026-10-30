import { createApp } from "./app";
import { parseConfig, parsePushConfig } from "./config";
import { historyDaysFor, ingestPrices } from "./jobs/ingestPrices";
import { sendAlerts } from "./jobs/sendAlerts";

const app = createApp();

/** Must match `triggers.crons` in wrangler.jsonc. Alerts run 7 minutes after each price ingestion. */
const PRICE_CRON = "*/15 * * * *";
const ALERTS_CRON = "7,22,37,52 * * * *";

export default {
  fetch: app.fetch,

  async scheduled(controller, env) {
    const config = parseConfig(env);
    const fetcher = (url: string, init?: RequestInit) => fetch(url, init);

    if (controller.cron === PRICE_CRON) {
      const historyDays = historyDaysFor(config.averageWindowHours);
      const result = await ingestPrices(env.DB, fetcher, controller.scheduledTime, historyDays);
      console.log("Price ingestion", JSON.stringify(result));
    } else if (controller.cron === ALERTS_CRON) {
      const push = parsePushConfig(env);
      if (!push) {
        console.log("Alerts skipped: push is not configured");
        return;
      }
      const vapid = { publicKey: push.vapidPublicKey, privateKey: push.vapidPrivateKey, subject: push.vapidSubject };
      const result = await sendAlerts(env.DB, fetcher, config, vapid, controller.scheduledTime);
      console.log("Alerts", JSON.stringify(result));
    } else {
      throw new Error(`Unknown cron trigger: ${controller.cron}`);
    }
  },
} satisfies ExportedHandler<Env>;
