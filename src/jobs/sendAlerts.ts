import type { Config } from "../config";
import { loadForecasts } from "../db/forecastCache";
import { deleteSentBefore, loadSentAlerts, recordSent } from "../db/notifications";
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
 * run, 5 minutes later. A price period is first seen about an hour ahead, so about 11 runs (33 pushes) fit before
 * it starts, which covers MAX_SUBSCRIPTIONS (25).
 */
export const MAX_PUSHES_PER_RUN = 3;

/**
 * Expired forecasts refreshed from MET per run, oldest first. Each refresh is up to three subrequests and a few ms
 * of CPU to parse. Other positions use their cached forecast until their turn, a few runs later.
 */
export const MAX_FORECAST_REFRESHES_PER_RUN = 2;

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
  /** Alerts that were sent but could not be recorded, so they will be sent again. */
  unrecorded: number;
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
  const result: AlertRunResult = { subscriptions: subscriptions.length, sent: 0, gone: 0, failed: 0, deferred: 0, unrecorded: 0 };
  if (subscriptions.length === 0) return result;

  // Enough prices to classify every quarter-hour `duePriceAlert` looks at. It classifies from the quarter-hour
  // that has started (at most 15 minutes ago) up to the lead time, and each classification needs the trailing
  // average window before it and one hour after it.
  const intervals = await loadIntervals(
    db,
    // The trailing window of the earliest quarter-hour, which starts up to 15 minutes before `now`.
    now - config.averageWindowHours * HOUR_MS - 15 * MINUTE_MS,
    // The hour after the latest quarter-hour (at the lead time), plus one quarter-hour of margin.
    now + PRICE_LEAD_MS + HOUR_MS + 15 * MINUTE_MS,
  );
  const priceAlerts = new Map<Zone, Alert | null>();
  for (const zone of new Set(subscriptions.map((s) => s.zone))) {
    const zoneIntervals = intervals.filter((i) => i.zone === zone);
    priceAlerts.set(zone, duePriceAlert(zone, zoneIntervals, now, config));
  }

  // One D1 query for all cached forecasts; only a few expired ones are refreshed from MET per run.
  const positions = new Map(subscriptions.map((s) => [positionKey(thunderPosition(s)), thunderPosition(s)]));
  const cached = await loadForecasts(db, [...positions.values()]);
  const thunderAlerts = new Map<string, Alert | null>();
  const expiresAt = (key: string) => cached.get(key)?.expires ?? 0; // 0: not cached yet, refreshed first
  const expired = [...positions].filter(([key]) => expiresAt(key) <= now).sort(([a], [b]) => expiresAt(a) - expiresAt(b));
  const toRefresh = new Set(expired.slice(0, MAX_FORECAST_REFRESHES_PER_RUN).map(([key]) => key));

  for (const [key, position] of positions) {
    let hours = cached.get(key)?.hours ?? null;
    if (toRefresh.has(key)) {
      try {
        hours = (await getThunderForecast(db, fetcher, config.metUserAgent, position.lat, position.lon, now)).hours;
      } catch (error) {
        console.error("Thunder forecast unavailable for alerts", error);
      }
    }
    thunderAlerts.set(key, hours ? dueThunderAlert(hours, now, config.thunderProbabilityPercent) : null);
  }

  const sentBefore = await loadSentAlerts(db, now - SENT_LOOKBACK_MS);
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
        // A failed delete must not stop the run. The subscription is kept, so the push service reports it gone
        // again on a later run. Deleting it also deletes the records of alerts sent to it.
        try {
          await deleteSubscription(db, subscription.endpoint);
          result.gone++;
        } catch (error) {
          console.error("Could not delete a gone subscription", error);
          result.failed++;
        }
        break;
      }
      result.sent++;
      // Recorded at once, so a failure later in the run cannot lose it. If recording fails, the alert is sent again
      // on the next run: a repeat is better than stopping the run and leaving the other subscribers without alerts.
      try {
        await recordSent(db, subscription.endpoint, alert, now);
      } catch (error) {
        console.error("Could not record a sent alert", error);
        result.unrecorded++;
      }
    }
  }

  await deleteSentBefore(db, now - SENT_RETENTION_MS);
  return result;
}
