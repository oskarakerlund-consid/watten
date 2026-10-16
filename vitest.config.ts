import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    // Live checks against real APIs run separately with `npm run test:live`.
    exclude: ["**/node_modules/**", "test/live/**"],
  },
});
