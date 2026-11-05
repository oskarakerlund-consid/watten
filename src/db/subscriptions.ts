import type { Position } from "../domain/position";
import type { Zone } from "../domain/types";
import type { PushTarget } from "../integrations/webpush";

export interface StoredSubscription extends PushTarget {
  zone: Zone;
  /** Rounded position, or null if the user has not shared one. */
  position: Position | null;
}

export type SaveResult = "created" | "updated" | "full";

/**
 * Stores a subscription, or updates its keys, zone and position if the endpoint is already stored.
 * A new subscription is only stored while there are fewer than `limit`; the count and the insert are one statement.
 * Safe when two requests store the same endpoint at once: one creates it, the other updates it.
 */
export async function saveSubscription(
  db: D1Database,
  subscription: StoredSubscription,
  now: number,
  limit: number,
): Promise<SaveResult> {
  const values = [
    subscription.endpoint,
    subscription.keys.p256dh,
    subscription.keys.auth,
    subscription.zone,
    subscription.position?.lat ?? null,
    subscription.position?.lon ?? null,
  ];
  const update = async () =>
    (
      await db
        .prepare("UPDATE push_subscriptions SET p256dh = ?2, auth = ?3, zone = ?4, lat = ?5, lon = ?6 WHERE endpoint = ?1")
        .bind(...values)
        .run()
    ).meta.changes > 0;
  if (await update()) return "updated";

  const inserted = await db
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, zone, lat, lon, created_utc)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE (SELECT count(*) FROM push_subscriptions) < ?8
       ON CONFLICT (endpoint) DO NOTHING`,
    )
    .bind(...values, now, limit)
    .run();
  if (inserted.meta.changes > 0) return "created";
  // Nothing inserted: either the limit is reached, or a concurrent request stored the same endpoint in between
  // (ON CONFLICT DO NOTHING). Updating again tells the two apart.
  return (await update()) ? "updated" : "full";
}

export async function deleteSubscription(db: D1Database, endpoint: string): Promise<void> {
  await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?1").bind(endpoint).run();
}

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  zone: Zone;
  lat: number | null;
  lon: number | null;
}

export async function loadSubscriptions(db: D1Database): Promise<StoredSubscription[]> {
  const { results } = await db
    .prepare("SELECT endpoint, p256dh, auth, zone, lat, lon FROM push_subscriptions ORDER BY created_utc")
    .all<SubscriptionRow>();
  return results.map((row) => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
    zone: row.zone,
    position: row.lat === null || row.lon === null ? null : { lat: row.lat, lon: row.lon },
  }));
}
