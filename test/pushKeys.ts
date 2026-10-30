/** Test keys for Web Push: a VAPID key pair for the sender and a browser subscription's keys. */

const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKey = base64url((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const { d } = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  if (!d) throw new Error("no private key");
  const privateKey = d;
  return { publicKey, privateKey };
}

export async function subscriptionKeys(): Promise<{ p256dh: string; auth: string }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const p256dh = base64url((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  return { p256dh, auth: base64url(crypto.getRandomValues(new Uint8Array(16))) };
}
