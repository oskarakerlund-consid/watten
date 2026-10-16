import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Manual checks against the real upstream APIs. Not part of `npm test`; run with `npm run test:live`.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { TEST_MIGRATIONS: await readD1Migrations("./migrations") },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/applyMigrations.ts"],
    include: ["test/live/**/*.live.test.ts"],
  },
});
