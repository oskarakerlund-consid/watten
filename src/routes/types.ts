import type { HttpFetcher } from "../integrations/metno";

/** Hono environment shared by all routes. `now` and `fetcher` are injected so tests can control them. */
export interface AppEnv {
  Bindings: Env;
  Variables: { now: number; fetcher: HttpFetcher };
}
