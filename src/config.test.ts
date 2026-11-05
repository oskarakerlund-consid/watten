import { describe, expect, it } from "vitest";
import { parseConfig, parsePushConfig } from "./config";

const UA = { MET_USER_AGENT: "test/1.0" };

describe("parseConfig", () => {
  it("uses defaults when optional vars are missing", () => {
    expect(parseConfig(UA)).toEqual({
      minPriceDiffSekPerKwh: 0.2,
      priceDiffPercent: 20,
      averageWindowHours: 48,
      thunderProbabilityPercent: 20,
      priceAlertQuietFromHour: 22,
      priceAlertQuietToHour: 7,
      metUserAgent: "test/1.0",
    });
  });

  it("requires the MET User-Agent", () => {
    expect(() => parseConfig({})).toThrow(/Invalid Worker vars[\s\S]*MET_USER_AGENT/);
  });

  it("converts öre to SEK and accepts numbers given as strings", () => {
    expect(
      parseConfig({ ...UA, MIN_PRICE_DIFF_ORE_PER_KWH: "30", PRICE_DIFF_PERCENT: 10, AVERAGE_WINDOW_HOURS: "24" }),
    ).toMatchObject({ minPriceDiffSekPerKwh: 0.3, priceDiffPercent: 10, averageWindowHours: 24 });
  });

  it.each([
    ["a negative minimum difference", { MIN_PRICE_DIFF_ORE_PER_KWH: -1 }],
    ["a window over 72 hours", { AVERAGE_WINDOW_HOURS: 96 }],
    ["a non-integer window", { AVERAGE_WINDOW_HOURS: 1.5 }],
    ["a non-number", { PRICE_DIFF_PERCENT: "lots" }],
    ["a thunder probability over 100 %", { THUNDER_PROBABILITY_PERCENT: 101 }],
    ["a quiet hour of 24", { PRICE_ALERT_QUIET_FROM_HOUR: 24 }],
  ])("rejects %s", (_name, vars) => {
    expect(() => parseConfig({ ...UA, ...vars })).toThrow();
  });
});

describe("parsePushConfig", () => {
  const valid = {
    VAPID_PUBLIC_KEY: `B${"a".repeat(86)}`,
    VAPID_PRIVATE_KEY: "b".repeat(43),
    VAPID_SUBJECT: "https://example.com",
  };

  it("reads the VAPID settings", () => {
    expect(parsePushConfig(valid)).toEqual({
      vapidPublicKey: valid.VAPID_PUBLIC_KEY,
      vapidPrivateKey: valid.VAPID_PRIVATE_KEY,
      vapidSubject: "https://example.com",
    });
    expect(parsePushConfig({ ...valid, VAPID_SUBJECT: "mailto:someone@example.com" })).not.toBeNull();
  });

  it.each([
    ["no keys", { VAPID_SUBJECT: valid.VAPID_SUBJECT }],
    ["an empty public key", { ...valid, VAPID_PUBLIC_KEY: "" }],
    ["a malformed private key", { ...valid, VAPID_PRIVATE_KEY: "not a key" }],
    ["a subject that is not mailto: or https:", { ...valid, VAPID_SUBJECT: "http://example.com" }],
  ])("returns null for %s", (_name, env) => {
    expect(parsePushConfig(env)).toBeNull();
  });
});
