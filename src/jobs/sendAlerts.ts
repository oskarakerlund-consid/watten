import type { Config } from "../config";
import { deleteSentBefore, loadSentAlerts, recordSentStatement } from "../db/notifications";
import { loadIntervals } from "../db/prices";
import { deleteSubscription, loadSubscriptions, type StoredSubscription } from "../db/subscriptions";
import { type Alert, alreadySent, duePriceAlert, dueThunderAlert, PRICE_LEAD_MS, THUNDER_LEAD_HOURS } from "../domain/alerts";
import { HOUR_MS, MINUTE_MS } from "../domain/time";
import type { Zone } from "../domain/types";
import { ZONE_INFO } from "../domain/zones";
import type { HttpFetcher } from "../integrations/http";
import { type PushOptions, sendPush, type Vapid } from "../integrations/webpush";
import { getThunderForecast } from "../services/thunderForecast";

/**
 * Each push costs a few ms of CPU, and a Free-plan invocation may use 10 ms. Alerts left over are sent on the next
 * run, 15 minutes later, which is still before the period starts (the lead times are 1 and 2 hours).
 */
export const MAX_PUSHES_PER_RUN = 3;

/** How far back stored alerts are read: longer than any cooldown, and covers thunder that has already started. */
const SENT_LOOKBACK_MS = 12 * HOUR_MS;
/** Records of alerts for periods older than this are deleted. */
const SENT_RETENTION_MS = 24 * HOUR_MS;

export interface AlertRunResult {
  subscriptions: number;
  sent: number;
  /** Subscriptions the push service no longer knows; they were deleted. */
  gone: number;
  failed: number;
  /** Due alerts left for the next run because of `MAX_PUSHES_PER_RUN`. */
  deferred: number;
}

/** The position a subscriber's thunder forecast is for: their own, or the zone's representative city. */
function thunderPosition(subscription: StoredSubscription): { lat: number; lon: number } {
  return subscription.position ?? ZONE_INFO[subscription.zone];
}

const positionKey = ({ lat, lon }: { lat: number; lon: number }) => `${lat},${lon}`;

function pushOptions(alert: Alert, now: number): PushOptions {
  if (alert.kind === "thunder") return { ttlSeconds: THUNDER_LEAD_HOURS * 3600, urgency: "high" };
  // A price alert is useless once the period has started.
  return { ttlSeconds: Math.max(60, Math.round((alert.start - now) / 1000)) };
}

/**
 * Sends the price and thunder alerts that are due at `now` to every subscriber, at most once per period.
 * Prices are read from D1; thunder forecasts come from the shared forecast cache (MET is asked only when the
 * cached forecast has expired). A failed forecast or push is logged and retried on the next run.
 */
export async function sendAlerts(db: D1Database, fetcher: HttpFetcher, config: Config, vapid: Vapid, now: number): Promise<AlertRunResult> {
  const subscriptions = await loadSubscriptions(db);
  const result: AlertRunResult = { subscriptions: subscriptions.length, sent: 0, gone: 0, failed: 0, deferred: 0 };
  if (subscriptions.length === 0) return result;

  // Enough prices to classify every quarter-hour up to the lead time, including the trailing average window.
  const intervals = await loadIntervals(
    db,
    now - config.averageWindowHours * HOUR_MS - 15 * MINUTE_MS,
    now + PRICE_LEAD_MS + HOUR_MS + 15 * MINUTE_MS,
  );
  const priceAlerts = new Map<Zone, Alert | null>();
  for (const zone of new Set(subscriptions.map((s) => s.zone))) {
    const zoneIntervals = intervals.filter((i) => i.zone === zone);
    priceAlerts.set(zone, duePriceAlert(zone, zoneIntervals, now, config));
  }

  const thunderAlerts = new Map<string, Alert | null>();
  for (const subscription of subscriptions) {
    const position = thunderPosition(subscription);
    const key = positionKey(position);
    if (thunderAlerts.has(key)) continue;
    try {
      const forecast = await getThunderForecast(db, fetcher, config.metUserAgent, position.lat, position.lon, now);
      thunderAlerts.set(key, dueThunderAlert(forecast.hours, now, config.thunderProbabilityPercent));
    } catch (error) {
      console.error("Thunder forecast unavailable for alerts", error);
      thunderAlerts.set(key, null);
    }
  }

  const sentBefore = await loadSentAlerts(db, now - SENT_LOOKBACK_MS);
  const delivered: { endpoint: string; alert: Alert }[] = [];
  const goneEndpoints = new Set<string>();
  let pushes = 0;

  for (const subscription of subscriptions) {
    const sent = sentBefore.get(subscription.endpoint) ?? [];
    // Thunder first: it matters more if the push budget runs out.
    const due = [thunderAlerts.get(positionKey(thunderPosition(subscription))), priceAlerts.get(subscription.zone)].filter(
      (alert): alert is Alert => alert != null && !alreadySent(alert, sent),
    );

    for (const alert of due) {
      if (pushes >= MAX_PUSHES_PER_RUN) {
        result.deferred++;
        continue;
      }
      pushes++;
      let outcome;
      try {
        outcome = await sendPush(fetcher, vapid, subscription, { title: alert.title, body: alert.body }, pushOptions(alert, now));
      } catch (error) {
        console.error("Alert push failed", error);
        result.failed++;
        continue;
      }
      if (outcome === "gone") {
        await deleteSubscription(db, subscription.endpoint);
        goneEndpoints.add(subscription.endpoint);
        result.gone++;
        break;
      }
      delivered.push({ endpoint: subscription.endpoint, alert });
      result.sent++;
    }
  }

  // A subscription deleted above takes its records with it, so none may be inserted for it.
  const records = delivered
    .filter(({ endpoint }) => !goneEndpoints.has(endpoint))
    .map(({ endpoint, alert }) => recordSentStatement(db, endpoint, alert, now));
  if (records.length > 0) await db.batch(records);
  await deleteSentBefore(db, now - SENT_RETENTION_MS);
  return result;
}
