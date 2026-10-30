import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedHourlyPrices } from "../../test/seedPrices";
import { subscriptionKeys, vapidKeys } from "../../test/pushKeys";
import { parseConfig } from "../config";
import { saveForecast } from "../db/forecastCache";
import { deleteSubscription, saveSubscription } from "../db/subscriptions";
import { HOUR_MS, MINUTE_MS } from "../domain/time";
import type { Zone } from "../domain/types";
import type { HttpFetcher } from "../integrations/http";
import type { Vapid } from "../integrations/webpush";
import { MAX_PUSHES_PER_RUN, sendAlerts } from "./sendAlerts";

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
  await saveSubscription(env.DB, { endpoint: endpoint(n), keys, zone, position }, NOW - HOUR_MS + n);
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

/** A fake push service that answers each endpoint with the next status in `statuses` (default 201). */
function pushService(statuses: Record<string, number[]> = {}) {
  const sent: string[] = [];
  const fetcher: HttpFetcher = async (url) => {
    if (!url.startsWith("https://fcm.googleapis.com/")) throw new Error(`Unexpected request to ${url}`);
    sent.push(url);
    return new Response(null, { status: statuses[url]?.shift() ?? 201 });
  };
  return { fetcher, sent, run: (now = NOW) => sendAlerts(env.DB, fetcher, config, vapid, now) };
}

const sentRows = async () =>
  (await env.DB.prepare("SELECT endpoint, kind, start_utc FROM notifications_sent ORDER BY endpoint, kind").all()).results;

describe("sendAlerts", () => {
  it("does nothing without subscribers", async () => {
    const push = pushService();
    expect(await push.run()).toEqual({ subscriptions: 0, sent: 0, gone: 0, failed: 0, deferred: 0 });
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

  it("retries a failed push on the next run", async () => {
    await seedExpensiveAt17("SE3");
    await seedForecast(59.33, 18.07, Array(4).fill(0));
    await subscribe(1, "SE3");

    const push = pushService({ [endpoint(1)]: [500] });
    expect(await push.run()).toMatchObject({ sent: 0, failed: 1 });
    expect(await sentRows()).toEqual([]);
    expect(await push.run(NOW + 15 * MINUTE_MS)).toMatchObject({ sent: 1 });
  });

  it("skips thunder for a position whose forecast is unavailable", async () => {
    await subscribe(1, "SE3", { lat: 57.7, lon: 11.97 });
    const push = pushService();
    expect(await push.run()).toMatchObject({ sent: 0, failed: 0 });
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
