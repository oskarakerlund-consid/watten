import { describe, expect, it } from "vitest";
import wranglerConfig from "../wrangler.jsonc?raw";
import { ALERTS_CRON, PRICE_CRON } from "./crons";

/** Parses wrangler.jsonc. Its comments are whole lines, so dropping those lines is enough. */
const parseJsonc = (text: string): unknown =>
  JSON.parse(
    text
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n"),
  );

describe("cron triggers", () => {
  it("match the triggers in wrangler.jsonc", () => {
    const config = parseJsonc(wranglerConfig) as { triggers: { crons: string[] } };
    expect(config.triggers.crons).toEqual([PRICE_CRON, ALERTS_CRON]);
  });
});
