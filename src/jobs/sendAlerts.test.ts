import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { failingDb } from "../../test/failingDb";
import { seedHourlyPrices } from "../../test/seedPrices";
import { subscriptionKeys, vapidKeys } from "../../test/pushKeys";
import { parseConfig } from "../config";
import { saveForecast } from "../db/forecastCache";
import { deleteSubscription, saveSubscription } from "../db/subscriptions";
import { HOUR_MS, MINUTE_MS } from "../domain/time";
import type { Zone } from "../domain/types";
import type { HttpFetcher } from "../integrations/http";
import type { Vapid } from "../integrations/webpush";
import { MAX_FORECAST_REFRESHES_PER_RUN, MAX_PUSHES_PER_RUN, sendAlerts } from "./sendAlerts";

// Prices jump at 17:00 Swedish winter time (16:00 UTC); the page turns red at 16:15, so the alert is due from 15:15.
const JUMP = Date.UTC(2026, 9, 30, 16);
// A run first sees the period 45–60 minutes ahead; this one is 55 minutes ahead.
const NOW = JUMP - 100 * MINUTE_MS; // 15:20 Swedish time
const config = parseConfig({ MET_USER_AGENT: "test/1.0" });

let vapid: Vapid;
let keys: { p256dh: string; auth: string };

beforeAll(async () => {
  vapid = { ...(await vapidKeys()), subject: "https://example.com" };
  keys = await subscriptionKeys();
});

beforeEach(async () => {
  await env.DB.exec("DELETE FROM notifications_sent; DELETE FROM push_subscriptions; DELETE FROM prices; DELETE FROM forecast_cache;");
});

const endpoint = (n: number) => `https://fcm.googleapis.com/fcm/send/${n}`;

async function subscribe(n: number, zone: Zone, position: { lat: number; lon: number } | null = null) {
  await saveSubscription(env.DB, { endpoint: endpoint(n), keys, zone, position }, NOW - HOUR_MS + n, 100);
}

/** 50 hours at 1 SEK/kWh, then 3 SEK/kWh from JUMP. */
async function seedExpensiveAt17(zone: Zone) {
  await seedHourlyPrices(zone, JUMP - 50 * HOUR_MS, [...Array(50).fill(1), 3, 3, 3]);
}

/** A cached forecast with the given hourly thunder probabilities from the start of the current hour. */
async function seedForecast(lat: number, lon: number, probabilities: number[]) {
  const from = Math.floor(NOW / HOUR_MS) * HOUR_MS;
  await saveForecast(env.DB, lat, lon, {
    hours: probabilities.map((probability, h) => ({ start: from + h * HOUR_MS, probability })),
    expires: NOW + HOUR_MS,
    lastModified: null,
    fetched: NOW,
  });
}

/** A MET response without thunder, covering the next few hours. */
function metResponse(): Response {
  const from = Math.floor(NOW / HOUR_MS) * HOUR_MS;
  const timeseries = [0, 1, 2, 3, 4].map((h) => ({
    time: new Date(from + h * HOUR_MS).toISOString().replace(".000", ""),
    data: { next_1_hours: { details: { probability_of_thunder: 0 } } },
  }));
  return new Response(JSON.stringify({ properties: { timeseries } }), { headers: { Expires: new Date(NOW + 30 * MINUTE_MS).toUTCString() } });
}

/**
 * A fake push service that answers each endpoint with the next status in `statuses` (default 201),
 * and a fake MET that answers every forecast request.
 */
function pushService(statuses: Record<string, number[]> = {}) {
  const sent: string[] = [];
  const met: string[] = [];
  const fetcher: HttpFetcher = async (url) => {
    if (url.startsWith("https://api.met.no/")) {
      met.push(url);
      return metResponse();
    }
    if (!url.startsWith("https://fcm.googleapis.com/")) throw new Error(`Unexpected request to ${url}`);
    sent.push(url);
    return new Response(null, { status: statuses[url]?.shift() ?? 201 });
  };
  return { fetcher, sent, met, run: (now = NOW) => sendAlerts(env.DB, fetcher, config, vapid, now) };
}

const sentRows = async () =>
  (await env.DB.prepare("SELECT endpoint, kind, start_utc FROM notifications_sent ORDER BY endpoint, kind").all()).results;

describe("sendAlerts", () => {
  it("does nothing without subscribers", async () => {
    const push = pushService();
    expect(await push.run()).toEqual({ subscriptions: 0, sent: 0, gone: 0, failed: 0, deferred: 0, unrecorded: 0 });
  });

  it("sends a price alert once to subscribers in the zone", async () => {
    await seedExpensiveAt17("SE3");
    await seedExpensiveAt17("SE1");
    await seedHourlyPrices("SE4", JUMP - 50 * HOUR_MS, Array(53).fill(1));
    await seedForecast(59.33, 18.07, Array(4).fill(0));
    await seedForecast(55.61, 13.0, Array(4).fill(0));
    await subscribe(1, "SE3");
    await subscribe(2, "SE4");

    const push = pushService();
    expect(await push.run()).toMatchObject({ subscriptions: 2, sent: 1 });
    expect(push.sent).toEqual([endpoint(1)]);
    expect(await sentRows()).toEqual([{ endpoint: endpoint(1), kind: "expensive", start_utc: JUMP - 45 * MINUTE_MS }]);

    // The next run, 15 minutes later, does not repeat it.
    expect(await push.run(NOW + 15 * MINUTE_MS)).toMatchObject({ sent: 0 });
    expect(push.sent).toHaveLength(1);
  });

  it("sends thunder alerts for the subscriber's position, or the zone's city without one", async () => {
    await seedForecast(57.7, 11.97, [0, 40, 0, 0]);
    await seedForecast(65.58, 22.15, [0, 0, 0, 0]);
    await subscribe(1, "SE3", { lat: 57.7, lon: 11.97 });
    await subscribe(2, "SE1");

    const push = pushService();
    expect(await push.run()).toMatchObject({ sent: 1 });
    expect(push.sent).toEqual([endpoint(1)]);
    expect(await sentRows()).toMatchObject([{ endpoint: endpoint(1), kind: "thunder" }]);
  });

  it(`sends at most ${MAX_PUSHES_PER_RUN} pushes per run and the rest on the next run`, async () => {
    await seedExpensiveAt17("SE3");
    await seedForecast(59.33, 18.07, Array(4).fill(0));
    for (let n = 1; n <= 5; n++) await subscribe(n, "SE3");

    const push = pushService();
    expect(await push.run()).toMatchObject({ sent: 3, deferred: 2 });
    expect(await push.run(NOW + 15 * MINUTE_MS)).toMatchObject({ sent: 2, deferred: 0 });
    expect(new Set(push.sent).size).toBe(5);
  });

  it("deletes a subscription the push service reports gone, even after another alert to it in the same run", async () => {
    await seedExpensiveAt17("SE3");
    await seedForecast(59.33, 18.07, [0, 50, 0, 0]);
    await subscribe(1, "SE3");

    const push = pushService({ [endpoint(1)]: [201, 410] });
    expect(await push.run()).toMatchObject({ sent: 1, gone: 1 });
    expect((await env.DB.prepare("SELECT count(*) AS n FROM push_subscriptions").first())?.n).toBe(0);
    expect(await sentRows()).toEqual([]);
  });

  it("still records sent alerts when a gone subscription cannot be deleted", async () => {
    await seedExpensiveAt17("SE3");
    await seedForecast(59.33, 18.07, [0, 50, 0, 0]);
    await subscribe(1, "SE3");

    const { fetcher } = pushService({ [endpoint(1)]: [201, 410] });
    const db = failingDb("DELETE FROM push_subscriptions");
    expect(await sendAlerts(db, fetcher, config, vapid, NOW)).toMatchObject({ sent: 1, gone: 0, failed: 1 });
    expect(await sentRows()).toMatchObject([{ endpoint: endpoint(1), kind: "thunder" }]);
  });

  it("keeps sending when a sent alert cannot be recorded", async () => {
    await seedExpensiveAt17("SE3");
    await seedForecast(59.33, 18.07, Array(4).fill(0));
    await subscribe(1, "SE3");
    await subscribe(2, "SE3");

    const { fetcher, sent } = pushService();
    const db = failingDb("INSERT OR IGNORE INTO notifications_sent");
    expect(await sendAlerts(db, fetcher, config, vapid, NOW)).toMatchObject({ sent: 2, unrecorded: 2 });
    expect(sent).toEqual([endpoint(1), endpoint(2)]);
  });

  it("retries a failed push on the next run", async () => {
    await seedExpensiveAt17("SE3");
    await seedForecast(59.33, 18.07, Array(4).fill(0));
    await subscribe(1, "SE3");

    const push = pushService({ [endpoint(1)]: [500] });
    expect(await push.run()).toMatchObject({ sent: 0, failed: 1 });
    expect(await sentRows()).toEqual([]);
    expect(await push.run(NOW + 15 * MINUTE_MS)).toMatchObject({ sent: 1 });
  });

  it(`refreshes at most ${MAX_FORECAST_REFRESHES_PER_RUN} expired forecasts per run`, async () => {
    for (let n = 1; n <= 4; n++) await subscribe(n, "SE3", { lat: 57 + n / 10, lon: 12 });
    const push = pushService();

    await push.run();
    expect(push.met).toHaveLength(MAX_FORECAST_REFRESHES_PER_RUN);
    await push.run(NOW + 5 * MINUTE_MS);
    expect(new Set(push.met).size).toBe(4);
  });

  it("uses an expired cached forecast for positions not refreshed this run", async () => {
    // Two positions need a refresh first (never fetched), so the expired thunder forecast is used as it is.
    await subscribe(1, "SE3", { lat: 57.1, lon: 12 });
    await subscribe(2, "SE3", { lat: 57.2, lon: 12 });
    await subscribe(3, "SE3", { lat: 57.7, lon: 11.97 });
    await seedForecast(57.7, 11.97, [0, 40, 0, 0]);
    await env.DB.prepare("UPDATE forecast_cache SET expires_utc = ?1").bind(NOW - MINUTE_MS).run();

    const push = pushService();
    expect(await push.run()).toMatchObject({ sent: 1 });
    expect(push.sent).toEqual([endpoint(3)]);
    expect(push.met).not.toContain("https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=57.7&lon=11.97");
  });

  it("deletes sent records together with the subscription", async () => {
    await seedExpensiveAt17("SE3");
    await seedForecast(59.33, 18.07, Array(4).fill(0));
    await subscribe(1, "SE3");
    await pushService().run();
    expect(await sentRows()).toHaveLength(1);

    await deleteSubscription(env.DB, endpoint(1));
    expect(await sentRows()).toEqual([]);
  });
});
