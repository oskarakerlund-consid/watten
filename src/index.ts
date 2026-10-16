import { Hono } from "hono";
import { parseConfig } from "./config";
import { historyDaysFor, ingestPrices } from "./jobs/ingestPrices";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ status: "ok" }));

export default {
  fetch: app.fetch,

  async scheduled(controller, env) {
    const config = parseConfig(env);
    const historyDays = historyDaysFor(config.averageWindowHours);
    const result = await ingestPrices(env.DB, (url) => fetch(url), controller.scheduledTime, historyDays);
    console.log("Price ingestion", JSON.stringify(result));
  },
} satisfies ExportedHandler<Env>;
