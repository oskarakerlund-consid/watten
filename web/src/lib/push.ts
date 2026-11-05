import { fetchPushKey, removeSubscription, saveSubscription, type SubscriptionRequest } from "./api";
import type { Position } from "./settings";
import type { Zone } from "./zones";

/** Either done, or a message to show. */
export type PushOutcome = { ok: true } | { ok: false; message: string };

/** Web Push needs a service worker, the Push API and notifications. iOS has them only for sites added to the home screen. */
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Decodes unpadded base64url, the format of the VAPID public key. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** The request body for a browser subscription, or null if the browser left out the encryption keys. */
export function subscriptionRequest(json: PushSubscriptionJSON, zone: Zone, position: Position | null): SubscriptionRequest | null {
  const { endpoint, keys } = json;
  if (!endpoint || !keys?.p256dh || !keys.auth) return null;
  return { subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, zone, position };
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function save(subscription: PushSubscription, zone: Zone, position: Position | null): Promise<PushOutcome> {
  const request = subscriptionRequest(subscription.toJSON(), zone, position);
  if (!request) return { ok: false, message: "Webbläsaren gav ingen giltig prenumeration." };
  const saved = await saveSubscription(request);
  return saved.ok ? { ok: true } : saved;
}

/** A message for a failed `register()` or `subscribe()`, by the DOMException's name. */
export function subscribeErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : null;
  if (name === "NotAllowedError") return "Notiser är blockerade. Tillåt dem i webbläsarens inställningar för den här sidan.";
  // E.g. the browser's push service is turned off or unreachable (Brave without Google services).
  if (name === "AbortError") return "Webbläsarens push-tjänst svarade inte. Försök igen senare eller prova en annan webbläsare.";
  return "Kunde inte slå på notiser i den här webbläsaren.";
}

/** Asks for permission, subscribes the browser and stores the subscription with the zone and position. */
export async function enablePush(zone: Zone, position: Position | null): Promise<PushOutcome> {
  if ((await Notification.requestPermission()) !== "granted") {
    return { ok: false, message: "Notiser är blockerade. Tillåt dem i webbläsarens inställningar för den här sidan." };
  }
  const key = await fetchPushKey();
  if (!key.ok) return key;

  let subscription: PushSubscription;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key.data.publicKey) }));
  } catch (error) {
    console.error("Could not subscribe to push", error);
    return { ok: false, message: subscribeErrorMessage(error) };
  }

  const saved = await save(subscription, zone, position);
  if (!saved.ok) await subscription.unsubscribe();
  return saved;
}

/** Unsubscribes the browser and deletes the stored subscription. */
export async function disablePush(): Promise<PushOutcome> {
  const subscription = await currentSubscription();
  if (!subscription) return { ok: true };
  const removed = await removeSubscription(subscription.endpoint);
  // Unsubscribe even if the server could not be reached: the push service then reports the subscription gone,
  // and the server deletes it on its next send.
  await subscription.unsubscribe();
  return removed.ok ? { ok: true } : { ok: false, message: "Notiserna är avstängda här, men servern kunde inte nås." };
}

/** Updates the stored zone and position, if notifications are on. Never rejects. */
export async function syncPush(zone: Zone, position: Position | null): Promise<PushOutcome> {
  if (!pushSupported()) return { ok: true };
  try {
    const subscription = await currentSubscription();
    const saved = subscription ? await save(subscription, zone, position) : ({ ok: true } as const);
    return saved.ok ? saved : { ok: false, message: `Notiserna kunde inte uppdateras. ${saved.message}` };
  } catch (error) {
    console.error("Could not update the push subscription", error);
    return { ok: false, message: "Notiserna kunde inte uppdateras." };
  }
}
