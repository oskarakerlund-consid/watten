import { buildPushPayload } from "@block65/webcrypto-web-push";
import type { PushTarget } from "../domain/types";
import { type HttpFetcher, upstreamTimeout } from "./http";

/**
 * An uncompressed P-256 public key (65 bytes) as unpadded base64url: the VAPID public key, and a browser
 * subscription's `p256dh` key.
 */
export const P256_PUBLIC_KEY = /^[A-Za-z0-9_-]{87}$/;

/** The VAPID key pair (base64url) and a contact for the push service (`mailto:` or `https:` URL). */
export interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** What the service worker (`web/public/sw.js`) shows. */
export interface PushNotification {
  title: string;
  body: string;
}

export interface PushOptions {
  /** How long the push service may hold the message for an offline device. */
  ttlSeconds: number;
  /** A hint to the device: `low` may wait for a good moment, `high` is delivered at once. */
  urgency?: "low" | "normal" | "high";
}

/** `gone`: the push service no longer knows the subscription, so it should be deleted. */
export type PushResult = "sent" | "gone";

// The push services of Chrome/Edge/Opera (FCM), Firefox, Safari and Windows (WNS).
const PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
const PUSH_HOST_SUFFIXES = [".notify.windows.com"];

/**
 * True if the endpoint is an https URL on a known push service.
 * Without this check anyone could make the Worker send requests to any URL.
 */
export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false;
  return PUSH_HOSTS.includes(url.hostname) || PUSH_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
}

/**
 * Encrypts (RFC 8291, aes128gcm) and sends one notification. Throws if the push service rejects it for another
 * reason than an expired subscription. Error messages never include the endpoint, which is personal data.
 */
export async function sendPush(
  fetcher: HttpFetcher,
  vapid: Vapid,
  target: PushTarget,
  notification: PushNotification,
  { ttlSeconds, urgency = "normal" }: PushOptions,
): Promise<PushResult> {
  const request = await buildPushPayload(
    { data: { ...notification }, options: { ttl: ttlSeconds, urgency } },
    { ...target, expirationTime: null },
    vapid,
  );
  const response = await fetcher(target.endpoint, {
    method: "POST",
    headers: request.headers,
    body: request.body,
    signal: upstreamTimeout(),
  });
  await response.body?.cancel();
  if (response.ok) return "sent";
  if (response.status === 404 || response.status === 410) return "gone";
  throw new Error(`Push service answered HTTP ${response.status}`);
}
