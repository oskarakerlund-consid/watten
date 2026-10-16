/** Hono environment shared by all routes. `now` is injected so tests can control the clock. */
export interface AppEnv {
  Bindings: Env;
  Variables: { now: number };
}
