import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      /** Migrations read in `vitest.config.ts` and applied before each test file. */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
