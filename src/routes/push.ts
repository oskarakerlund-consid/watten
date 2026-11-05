import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { parsePushConfig } from "../config";
import { deleteSubscription, saveSubscription } from "../db/subscriptions";
import { isPushServiceEndpoint, P256_PUBLIC_KEY, sendPush } from "../integrations/webpush";
import { MAX_SUBSCRIPTIONS } from "../limits";
import type { SubscribeRequest } from "./contract";
import type { AppEnv } from "./types";
import { latSchema, lonSchema, validJson, zoneSchema } from "./validation";

const endpointSchema = z.string().max(2048).refine(isPushServiceEndpoint, "must be an https URL on a known push service");
// Browsers send the keys as unpadded base64url: p256dh is a 65-byte P-256 point, auth a 16-byte secret.
const keysSchema = z.object({
  p256dh: z.string().regex(P256_PUBLIC_KEY),
  auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
});

const subscribeSchema = z.object({
  subscription: z.object({ endpoint: endpointSchema, keys: keysSchema }),
  zone: zoneSchema,
  position: z.object({ lat: latSchema(z.number()), lon: lonSchema(z.number()) }).nullable(),
}) satisfies z.ZodType<SubscribeRequest, SubscribeRequest>;

const unsubscribeSchema = z.object({ endpoint: endpointSchema });

/** A confirmation that is useless later, so push services may drop it after an hour. */
const CONFIRMATION_TTL_SECONDS = 3600;

/** A subscription request is well under 1 KB; anything much larger is rejected before it is parsed. */
const MAX_BODY_BYTES = 4 * 1024;

const notConfigured = { error: "Push notifications are not configured" } as const;

export const pushRoute = new Hono<AppEnv>()
  .use(async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  })
  .use(bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: "Request body too large" }, 413) }))
  .get("/key", (c) => {
    const config = parsePushConfig(c.env);
    if (!config) return c.json(notConfigured, 503);
    return c.json({ publicKey: config.vapidPublicKey });
  })
  .post("/subscribe", validJson(subscribeSchema), async (c) => {
    const config = parsePushConfig(c.env);
    if (!config) return c.json(notConfigured, 503);
    const { subscription, zone, position } = c.req.valid("json");
    const now = c.get("now");

    const saved = await saveSubscription(c.env.DB, { ...subscription, zone, position }, now, MAX_SUBSCRIPTIONS);
    if (saved === "full") return c.json({ error: "The maximum number of subscriptions has been reached" }, 409);
    if (saved === "updated") return c.json({ created: false, confirmationSent: false });

    // A first push confirms that notifications reach the device.
    const vapid = { publicKey: config.vapidPublicKey, privateKey: config.vapidPrivateKey, subject: config.vapidSubject };
    let result;
    try {
      result = await sendPush(
        c.get("fetcher"),
        vapid,
        subscription,
        { title: "Watten", body: "Notiser är påslagna." },
        { ttlSeconds: CONFIRMATION_TTL_SECONDS },
      );
    } catch (error) {
      console.error("Confirmation push failed", error);
      return c.json({ created: true, confirmationSent: false }, 201);
    }
    if (result === "gone") {
      await deleteSubscription(c.env.DB, subscription.endpoint);
      return c.json({ error: "The push service does not accept this subscription" }, 400);
    }
    return c.json({ created: true, confirmationSent: true }, 201);
  })
  .delete("/subscribe", validJson(unsubscribeSchema), async (c) => {
    await deleteSubscription(c.env.DB, c.req.valid("json").endpoint);
    return c.body(null, 204);
  });
