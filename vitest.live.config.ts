import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Manual checks against the real upstream APIs. Not part of `npm test`; run with `npm run test:live`.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    include: ["test/live/**/*.live.test.ts"],
  },
});
