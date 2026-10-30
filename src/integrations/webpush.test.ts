import { describe, expect, it } from "vitest";
import { subscriptionKeys, vapidKeys } from "../../test/pushKeys";
import type { HttpFetcher } from "./http";
import { isPushServiceEndpoint, sendPush } from "./webpush";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";
const NOTIFICATION = { title: "Watten", body: "Test" };

describe("isPushServiceEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/abc",
    "https://wns2-db5p.notify.windows.com/w/?token=abc",
  ])("accepts %s", (endpoint) => {
    expect(isPushServiceEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:8443/fcm/send/abc",
    "https://user@fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com.example.com/abc",
    "https://example.com/abc",
    "https://evilnotify.windows.com/abc",
    "not a url",
  ])("rejects %s", (endpoint) => {
    expect(isPushServiceEndpoint(endpoint)).toBe(false);
  });
});

describe("sendPush", () => {
  async function send(status: number) {
    const keys = await vapidKeys();
    const target = { endpoint: ENDPOINT, keys: await subscriptionKeys() };
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const fetcher: HttpFetcher = async (url, init) => {
      requests.push({ url, init });
      return new Response(null, { status });
    };
    const result = sendPush(fetcher, { ...keys, subject: "https://example.com" }, target, NOTIFICATION, { ttlSeconds: 600, urgency: "high" });
    return { result, requests };
  }

  it("posts an encrypted, VAPID-signed message to the endpoint", async () => {
    const { result, requests } = await send(201);
    expect(await result).toBe("sent");

    expect(requests).toHaveLength(1);
    const [{ url, init }] = requests as [(typeof requests)[number]];
    expect(url).toBe(ENDPOINT);
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    // aes128gcm (RFC 8291) is the only encoding Apple's push service accepts.
    expect(headers.get("Content-Encoding")).toBe("aes128gcm");
    expect(headers.get("TTL")).toBe("600");
    expect(headers.get("Urgency")).toBe("high");
    expect(headers.get("Authorization")).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/);
    // The payload is encrypted, so the plain text never appears in the body.
    const body = new TextDecoder().decode(init?.body as ArrayBuffer);
    expect(body).not.toContain("Test");
  });

  it.each([404, 410])("reports HTTP %i as an expired subscription", async (status) => {
    expect(await (await send(status)).result).toBe("gone");
  });

  it("throws on other errors without revealing the endpoint", async () => {
    const error = await (await send(429)).result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Push service answered HTTP 429");
  });
});
