import { Hono } from "hono";
import type { HttpFetcher } from "./integrations/http";
import { cheapestRoute } from "./routes/cheapest";
import { statusRoute } from "./routes/status";
import { thunderRoute } from "./routes/thunder";
import type { AppEnv } from "./routes/types";

export interface AppDependencies {
  /** Current time in UTC epoch ms. */
  clock?: () => number;
  /** Outbound HTTP for upstream APIs. */
  fetcher?: HttpFetcher;
}

/** Builds the API. The clock and outbound HTTP are injectable so tests can control them. */
export function createApp({ clock = Date.now, fetcher = (url, init) => fetch(url, init) }: AppDependencies = {}) {
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set("now", clock());
      c.set("fetcher", fetcher);
      await next();
      // The API only returns JSON: never render it as a page or in a frame. Static assets get theirs from web/public/_headers.
      c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
      c.header("X-Content-Type-Options", "nosniff");
      c.header("Referrer-Policy", "no-referrer");
      // Data changes at most every 15 minutes; a short browser cache keeps polling cheap.
      if (c.res.ok && !c.res.headers.has("Cache-Control")) c.header("Cache-Control", "public, max-age=60");
    })
    .get("/api/health", (c) => c.json({ status: "ok" }))
    .route("/api/status", statusRoute)
    .route("/api/cheapest", cheapestRoute)
    .route("/api/thunder", thunderRoute)
    .notFound((c) => c.json({ error: "Not found" }, 404))
    .onError((error, c) => {
      console.error(error);
      return c.json({ error: "Internal error" }, 500);
    });
}
