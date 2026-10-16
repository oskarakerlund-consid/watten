import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [svelte()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    // `npm run dev:web` serves the frontend with hot reload and forwards API calls to `npm run dev`.
    proxy: { "/api": "http://localhost:8787" },
  },
});
