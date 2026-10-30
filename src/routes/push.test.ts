import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { subscriptionKeys, vapidKeys } from "../../test/pushKeys";
import { createApp } from "../app";
import type { HttpFetcher } from "../integrations/http";

const NOW = Date.UTC(2026, 9, 30, 12);
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";

let pushEnv: Env;
let keys: { p256dh: string; auth: string };

beforeAll(async () => {
  const vapid = await vapidKeys();
  // wrangler.jsonc ships an empty public key, so its generated type is the literal "".
  pushEnv = { ...env, VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey } as Env;
  keys = await subscriptionKeys();
});

beforeEach(async () => {
  await env.DB.exec("DELETE FROM push_subscriptions");
});

/** The app with a fake push service that answers `status`, recording where it was asked to send. */
function appWithPushService(status = 201, workerEnv: Env = pushEnv) {
  const sent: string[] = [];
  const fetcher: HttpFetcher = async (url) => {
    sent.push(url);
    return new Response(null, { status });
  };
  const app = createApp({ clock: () => NOW, fetcher });
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, workerEnv);
  return { send, sent };
}

const subscribeBody = (overrides: Record<string, unknown> = {}) => ({
  subscription: { endpoint: ENDPOINT, keys },
  zone: "SE3",
  position: { lat: 59.3293, lon: 18.0686 },
  ...overrides,
});

const storedRows = async () => (await env.DB.prepare("SELECT * FROM push_subscriptions").all()).results;

describe("GET /api/push/key", () => {
  it("returns the VAPID public key", async () => {
    const response = await appWithPushService().send("GET", "/api/push/key");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publicKey: pushEnv.VAPID_PUBLIC_KEY });
  });

  it("answers 503 when push is not configured", async () => {
    const response = await appWithPushService(201, { ...env, VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "" }).send("GET", "/api/push/key");
    expect(response.status).toBe(503);
  });
});

describe("POST /api/push/subscribe", () => {
  it("stores the subscription with a rounded position and sends a confirmation", async () => {
    const push = appWithPushService();
    const response = await push.send("POST", "/api/push/subscribe", subscribeBody());

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ created: true, confirmationSent: true });
    expect(push.sent).toEqual([ENDPOINT]);
    expect(await storedRows()).toEqual([
      { endpoint: ENDPOINT, p256dh: keys.p256dh, auth: keys.auth, zone: "SE3", lat: 59.33, lon: 18.07, created_utc: NOW },
    ]);
  });

  it("stores a subscription without position", async () => {
    await appWithPushService().send("POST", "/api/push/subscribe", subscribeBody({ position: null }));
    expect(await storedRows()).toMatchObject([{ lat: null, lon: null }]);
  });

  it("updates zone and position of a known subscription without a new confirmation", async () => {
    const push = appWithPushService();
    await push.send("POST", "/api/push/subscribe", subscribeBody());
    const response = await push.send("POST", "/api/push/subscribe", subscribeBody({ zone: "SE1", position: null }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ created: false, confirmationSent: false });
    expect(push.sent).toHaveLength(1);
    expect(await storedRows()).toMatchObject([{ zone: "SE1", lat: null, lon: null, created_utc: NOW }]);
  });

  it("deletes the subscription if the push service says it is gone", async () => {
    const response = await appWithPushService(410).send("POST", "/api/push/subscribe", subscribeBody());
    expect(response.status).toBe(400);
    expect(await storedRows()).toEqual([]);
  });

  it("keeps the subscription if the confirmation fails for another reason", async () => {
    const response = await appWithPushService(500).send("POST", "/api/push/subscribe", subscribeBody());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ created: true, confirmationSent: false });
    expect(await storedRows()).toHaveLength(1);
  });

  it.each([
    ["an endpoint on an unknown host", { subscription: { endpoint: "https://example.com/push", keys: { p256dh: "x", auth: "y" } } }],
    ["an http endpoint", { subscription: { endpoint: "http://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "x", auth: "y" } } }],
    ["malformed keys", { subscription: { endpoint: ENDPOINT, keys: { p256dh: "short", auth: "short" } } }],
    ["an unknown zone", { zone: "SE5" }],
    ["a position outside Sweden", { position: { lat: 48.85, lon: 2.35 } }],
    ["a position given as strings", { position: { lat: "59.33", lon: "18.07" } }],
  ])("rejects %s without contacting anyone", async (_name, overrides) => {
    const push = appWithPushService();
    const response = await push.send("POST", "/api/push/subscribe", subscribeBody(overrides));
    expect(response.status).toBe(400);
    expect(push.sent).toEqual([]);
    expect(await storedRows()).toEqual([]);
  });

  it("answers 503 and stores nothing when push is not configured", async () => {
    const push = appWithPushService(201, { ...env, VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "" });
    expect((await push.send("POST", "/api/push/subscribe", subscribeBody())).status).toBe(503);
    expect(await storedRows()).toEqual([]);
  });
});

describe("DELETE /api/push/subscribe", () => {
  it("deletes the subscription", async () => {
    const push = appWithPushService();
    await push.send("POST", "/api/push/subscribe", subscribeBody());
    const response = await push.send("DELETE", "/api/push/subscribe", { endpoint: ENDPOINT });

    expect(response.status).toBe(204);
    expect(await storedRows()).toEqual([]);
  });

  it("succeeds for an unknown subscription", async () => {
    const response = await appWithPushService().send("DELETE", "/api/push/subscribe", { endpoint: ENDPOINT });
    expect(response.status).toBe(204);
  });
});
