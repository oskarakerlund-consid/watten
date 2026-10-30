import { describe, expect, it } from "vitest";
import { base64UrlToBytes, subscriptionRequest } from "./push";

describe("base64UrlToBytes", () => {
  it("decodes unpadded base64url", () => {
    expect([...base64UrlToBytes("-_8")]).toEqual([0xfb, 0xff]);
    expect([...base64UrlToBytes("AQIDBA")]).toEqual([1, 2, 3, 4]);
  });

  it("decodes a 65-byte public key", () => {
    expect(base64UrlToBytes(`B${"A".repeat(86)}`)).toHaveLength(65);
  });
});

describe("subscriptionRequest", () => {
  const json = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", expirationTime: null, keys: { p256dh: "p", auth: "a" } };

  it("builds the request with zone and position", () => {
    expect(subscriptionRequest(json, "SE3", { lat: 59.33, lon: 18.07 })).toEqual({
      subscription: { endpoint: json.endpoint, keys: { p256dh: "p", auth: "a" } },
      zone: "SE3",
      position: { lat: 59.33, lon: 18.07 },
    });
  });

  it("returns null without encryption keys", () => {
    expect(subscriptionRequest({ endpoint: json.endpoint }, "SE3", null)).toBeNull();
  });
});
