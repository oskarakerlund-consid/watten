import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

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
    // Live checks against real APIs run separately with `npm run test:live`.
    exclude: ["**/node_modules/**", "test/live/**"],
  },
});
