import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import ts from "typescript-eslint";

export default ts.config(
  { ignores: ["node_modules/", ".wrangler/", "web/dist/", "coverage/", "worker-configuration.d.ts"] },
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  {
    // Worker, tests and Node scripts.
    files: ["src/**", "test/**", "scripts/**", "*.ts", "*.js"],
    languageOptions: { globals: { ...globals.serviceworker, ...globals.node } },
  },
  {
    files: ["web/src/**"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["web/public/sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
);
