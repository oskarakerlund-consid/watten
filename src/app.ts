import { Hono } from "hono";
import { cheapestRoute } from "./routes/cheapest";
import { statusRoute } from "./routes/status";
import type { AppEnv } from "./routes/types";

/** Builds the API. `clock` is injectable so tests can fix the current time. */
export function createApp(clock: () => number = Date.now) {
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set("now", clock());
      await next();
      // Prices change at most every 15 minutes; a short browser cache keeps polling cheap.
      if (c.res.ok && !c.res.headers.has("Cache-Control")) c.header("Cache-Control", "public, max-age=60");
    })
    .get("/api/health", (c) => c.json({ status: "ok" }))
    .route("/api/status", statusRoute)
    .route("/api/cheapest", cheapestRoute)
    .notFound((c) => c.json({ error: "Not found" }, 404))
    .onError((error, c) => {
      console.error(error);
      return c.json({ error: "Internal error" }, 500);
    });
}
