# Watten

Watten is a small serverless service that helps you decide when to use electricity in Sweden. It shows whether the current electricity price is relatively cheap or expensive, when the cheapest upcoming hours are, and whether thunder is expected, so you can avoid using sensitive equipment or charging an EV during a thunderstorm. Users can subscribe to Web Push notifications.

> **Status:** early development, tech demo, not a commercial product. The overview page, the API and push notifications for price and thunder work. See [`docs/PLAN.md`](docs/PLAN.md) for the implementation plan.

## How it works

A single-screen web app (in Swedish) backed by a JSON API. Everything fits on one screen without scrolling, also on a phone:

- The **background color** shows whether the price for the coming hour is cheap (green), normal (sand) or expensive (red) compared with the recent average. The level is also written out with a symbol, so color is never the only cue.
- The **cheapest 2-hour interval** within the next 8 hours. If tomorrow's prices are not known yet, the card says how far prices are known.
- Whether **thunder** is expected within the next 8 hours, and roughly when.
- **Location and zone:** on the first visit you either press *Använd min plats* (the browser asks for your position; it is never requested automatically) or pick a price zone. Your zone is guessed from the position. In the settings you can change the zone and update the position. Both are stored only in your browser (`localStorage`); the position is rounded to about 1 km. Without a position, the thunder forecast is for the zone's largest city.
- **Push notifications:** the 🔔 button opens a form to turn Web Push on or off. Turning it on sends a confirmation notification right away. The subscription is stored with the current zone and rounded position, and updated when either changes. On iPhone and iPad, Web Push only works after the page has been added to the home screen.
- **Alerts:** subscribers get a notification
  - about **1 hour before an unusually cheap or expensive period** in their zone starts. "Starts" means the moment the page would change color: the level uses the coming hour, so that can be up to 45 minutes before the price itself changes. No price alerts are sent from 22:00 to 07:00 Swedish time (configurable).
  - when **thunder is expected within 2 hours** at their position (or at the zone's largest city if they have not shared one), with the same probability threshold as the API. Thunder alerts are sent at any time of day.

  A subscriber gets at most one alert of each kind per period: a new price alert of the same kind needs a period at least 3 hours from the previous one, and a new thunder alert one at least 6 hours away. This stops repeats when a forecast shifts or a level flickers.

The page refreshes its data every 5 minutes and when the tab becomes visible again.

Currently implemented endpoints. All return JSON; invalid parameters give `400` with an `error` message, and missing price data gives `503`. Successful `GET` responses may be cached by the browser for 60 seconds, except under `/api/push`.

| Endpoint | Parameters | Returns |
| --- | --- | --- |
| `GET /api/health` | – | `{ "status": "ok" }` |
| `GET /api/status` | `zone` (`SE1`–`SE4`, required) | `level` (`cheap` / `normal` / `expensive`) for the price from now to one hour ahead, plus `currentSekPerKwh`, `averageSekPerKwh` (trailing window), `thresholdSekPerKwh` and `averageWindowHours`. |
| `GET /api/cheapest` | `zone` (required), `interval` hours (1–6, default 2), `period` hours (1–24, default 8, at least `interval`) | The cheapest `interval`-hour window that lies entirely within the next `period` hours: `start`/`end` (UTC), `startLocal`/`endLocal` (Swedish time with offset) and `averageSekPerKwh`. `complete` is false when prices are only known for part of the period (tomorrow's are published from 13:00, or the source is down); `knownUntil`/`knownUntilLocal` say how far, and only that part was searched. |
| `GET /api/thunder` | `lat`, `lon` (required, within a bounding box around Sweden), `hours` (1–24, default 8) | Whether thunder is `expected` in the next `hours` hours: true if any hour's forecast probability is at or above `thresholdPercent`. `start`/`end` (and `startLocal`/`endLocal`) span the first to the last such hour, `null` if none. Also `maxProbabilityPercent`, `forecastFetched` and `stale` (true if MET could not be reached and an older forecast is used). This is a forecast, not observed lightning. |
| `GET /api/push/key` | – | `publicKey`: the VAPID public key the browser needs to subscribe. `503` if push is not configured. |
| `POST /api/push/subscribe` | JSON body: `subscription` (`endpoint` and `keys.p256dh`/`keys.auth`, as from `PushSubscription.toJSON()`), `zone`, `position` (`{ lat, lon }` within Sweden, or `null`) | Stores or updates the subscription; the position is rounded to two decimals. A new subscription gets a confirmation push: `201` with `confirmationSent`. A known one is updated: `200`. The endpoint must be `https` on a known push service (Google FCM, Mozilla, Apple, Windows), so the Worker cannot be used to send requests elsewhere. `400` if the push service rejects the subscription. At most 25 subscriptions are stored in total: a new one beyond that gets `409` (existing ones can still be updated). Bodies over 4 KB get `413`. |
| `DELETE /api/push/subscribe` | JSON body: `endpoint` | Deletes the subscription: `204`. |

Example:

```sh
curl "http://localhost:8787/api/cheapest?zone=SE3&interval=2&period=8"
```

```json
{
  "zone": "SE3", "interval": 2, "period": 8,
  "start": "2026-10-16T20:30:00.000Z", "end": "2026-10-16T22:30:00.000Z",
  "startLocal": "2026-10-16T22:30:00+02:00", "endLocal": "2026-10-17T00:30:00+02:00",
  "averageSekPerKwh": 0.6356
}
```

Prices are spot prices in SEK/kWh excluding VAT, surcharges and taxes.

## Architecture

Everything runs on Cloudflare's free tier:

- A single **Cloudflare Worker** written in TypeScript, with [Hono](https://hono.dev/) for API routing.
- **Cloudflare D1** caches thunder forecasts per rounded position and stores electricity prices for all four zones, from two days back up to tomorrow (enough for the 48-hour average). Older rows are deleted automatically.
- Two **Cron Triggers**. `*/15 * * * *` runs the price ingestion every 15 minutes. Each run fetches only days that are missing or incomplete, so most runs just read D1 and do nothing; tomorrow's prices are picked up within 15 minutes of being published (from 13:00 Swedish time), and a new deployment has prices within 15 minutes. `2,7,12,…,57 * * * *` runs the alert job every 5 minutes, starting 2 minutes after each ingestion: it reads the subscriptions, the prices and the cached thunder forecasts (refreshing at most two expired forecasts from MET per run, oldest first; the others use their cached forecast until their turn), sends the alerts that are due and records each one in D1 right after sending it, so it is not repeated. A failed push, record or delete is logged and the run continues.
- A **Svelte 5 SPA** (`web/`, built with Vite) is served as Workers static assets by the same Worker: one deploy, one origin, no CORS. Only `/api/*` runs the Worker; all other requests are free static-asset requests, and unknown paths return the app.
- **Security headers:** the static assets get a strict Content Security Policy (only same-origin scripts, styles and API calls; no framing) and related headers from `web/public/_headers`. Those rules do not apply to Worker responses, so `src/app.ts` sets matching headers on everything under `/api/*`.
- **Web Push** with VAPID (RFC 8030/8291/8292) on Web Crypto, via `@block65/webcrypto-web-push`, which builds the encrypted request (`aes128gcm`, the only encoding Apple's push service accepts); the Worker sends it itself. Subscriptions live in D1. A push service answering `404`/`410` means the subscription is gone, and it is deleted. The browser side is a small service worker (`web/public/sw.js`) that only shows notifications, plus a web app manifest so iOS can install the page.

Code layout under `src/`:

| Directory | Responsibility |
| --- | --- |
| `src/index.ts` | Worker entry point: HTTP and scheduled handlers. |
| `src/app.ts` | The Hono app: middleware, route mounting, error handling. |
| `src/routes/` | HTTP routes (Hono) with request validation. The data routes only read from D1 and never call the price API; the push routes store subscriptions and send the confirmation push. |
| `src/domain/` | Pure business logic, no I/O: zones, Swedish time and DST, time-weighted price averages, cheapest-window search, price classification, which alerts are due, zone fallback positions. |
| `src/config.ts` | Parsing and validation of the Worker vars. |
| `web/` | The Svelte frontend: `src/App.svelte`, `src/components/`, and `src/lib/` (API client, settings, formatting, geolocation, push). `public/` holds the service worker, the manifest and `_headers`. |
| `web/src/lib/zones/` | Price-zone polygons and the zone lookup used by the frontend. |
| `scripts/` | Developer scripts: producing the zone data, looking up a zone for a position, generating VAPID keys. |
| `src/integrations/` | Calls to external data sources, with response validation (Zod). Each client takes a `fetch` function so it can be tested without network. |
| `src/db/` | D1 access. |
| `src/services/` | Combines integrations and storage, e.g. the cached thunder forecast. |
| `src/jobs/` | Scheduled jobs: price ingestion and alerts. |
| `migrations/` | D1 schema migrations. |

## Third-party data and dependencies

### Data sources

- [Elpriset just nu](https://www.elprisetjustnu.se/elpris-api) – electricity prices per price area, free and without API key. Prices exclude VAT, surcharges and taxes. The client is implemented (`src/integrations/elprisetjustnu.ts`) but not yet scheduled. On the day summer time ends, the API reports one interval with a wrong end time; the client caps every interval at the start of the next one. Recorded responses used in tests live in `test/fixtures/elprisetjustnu/`.
- [MET Norway](https://api.met.no/) – weather forecasts from Locationforecast 2.0, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (data from MET Norway). Watten uses the hourly `probability_of_thunder`, available for all of Sweden about 55 hours ahead. Following MET's [terms of service](https://developer.yr.no/doc/TermsOfService/), requests send an identifying `User-Agent`, positions have at most four decimals, and responses are cached in D1 until their `Expires` time and then revalidated with `If-Modified-Since`. If MET cannot be reached, the last cached forecast is served and marked stale. Positions are rounded to two decimals (about 1 km) before they are used, so nearby users share cached forecasts.

### Price-zone data

The frontend guesses the user's price zone (`SE1`–`SE4`) from their position with simplified zone polygons in `web/src/lib/zones/zones.json`. There is no official, openly licensed map of the Swedish price zones, so the polygons are derived from the GeoJSON files in [entsoe-py](https://github.com/EnergieID/entsoe-py) (MIT, see `web/src/lib/zones/LICENSE-entsoe-py`), whose authors redrew the Swedish zones by hand. The guess can therefore be wrong near zone borders, and the user can always change the zone.

How `zones.json` was produced:

1. Download `SE_1.geojson`–`SE_4.geojson` from `entsoe/geo/geojson/` in entsoe-py at commit [`12ce32f`](https://github.com/EnergieID/entsoe-py/tree/12ce32fa56785c744367a1e506a488596d02f17d/entsoe/geo/geojson) (last changed 2022-04-16) into a directory outside the repo.
2. Run `node scripts/simplify-zones.mjs <that directory> 12ce32fa56785c744367a1e506a488596d02f17d 2`. It simplifies every polygon with Douglas–Peucker at a 2 km tolerance (`scripts/simplifyGeometry.ts`), rounds coordinates to three decimals (about 100 m) and writes `zones.json` (863 points, 14 KB, about 5 KB gzipped).
3. Check the result with `npm test` and spot-check positions with `node scripts/guess-zone.mjs <lat> <lon>`.

Compared with the original polygons on a grid of about 19,400 points across Sweden, the simplified data gives a different zone for 2 points (0.01 %). Positions outside every polygon (coasts, small islands) get the nearest zone within 10 km. If Svenska kraftnät changes the zone division, the data must be replaced; the zone list itself lives only in `src/domain/types.ts`.

### Dependencies

| Package | Kind | Why | License |
| --- | --- | --- | --- |
| [`hono`](https://github.com/honojs/hono) | runtime | API routing in the Worker | MIT |
| [`zod`](https://github.com/colinhacks/zod) | runtime | Validation of external data and request parameters | MIT |
| [`@hono/zod-validator`](https://github.com/honojs/middleware) | runtime | Zod validation of request parameters in Hono routes | MIT |
| [`@block65/webcrypto-web-push`](https://github.com/block65/webcrypto-web-push) | runtime | Web Push encryption and VAPID signing with Web Crypto (works on Workers). Depends on [`uint8array-extras`](https://github.com/sindresorhus/uint8array-extras) (MIT) | MIT |
| [`wrangler`](https://github.com/cloudflare/workers-sdk) | dev | Local development, type generation and deployment | MIT OR Apache-2.0 |
| [`typescript`](https://github.com/microsoft/TypeScript) | dev | Type checking (version 6, because `svelte-check` does not support 7 yet) | Apache-2.0 |
| [`svelte`](https://github.com/sveltejs/svelte) | dev | Frontend framework (compiled into the static bundle) | MIT |
| [`vite`](https://github.com/vitejs/vite) | dev | Frontend build and dev server | MIT |
| [`@sveltejs/vite-plugin-svelte`](https://github.com/sveltejs/vite-plugin-svelte) | dev | Svelte support in Vite | MIT |
| [`svelte-check`](https://github.com/sveltejs/language-tools) | dev | Type checking of `.svelte` files | MIT |
| [`vitest`](https://github.com/vitest-dev/vitest) | dev | Test runner | MIT |
| [`@cloudflare/vitest-plugin`](https://github.com/cloudflare/workers-sdk) | dev | Runs tests inside the Workers runtime | MIT |
| [`eslint`](https://github.com/eslint/eslint) | dev | Linting | MIT |
| [`@eslint/js`](https://github.com/eslint/eslint) | dev | ESLint's recommended JavaScript rules | MIT |
| [`typescript-eslint`](https://github.com/typescript-eslint/typescript-eslint) | dev | ESLint parser and rules for TypeScript | MIT |
| [`eslint-plugin-svelte`](https://github.com/sveltejs/eslint-plugin-svelte) | dev | ESLint rules for `.svelte` files | MIT |
| [`globals`](https://github.com/sindresorhus/globals) | dev | Browser, service worker and Node globals for the ESLint config | MIT |

## Free-tier limits

| Limit (Workers Free) | How Watten stays inside it |
| --- | --- |
| 50 subrequests (fetches and D1 queries) per invocation | Price ingestion uses at most 34 in the usual case: one read, up to 16 fetches, up to 16 writes (one SQL statement per zone and day, with the rows passed as one JSON parameter) and one delete. A day that is stored but incomplete is replaced, which costs one more delete for that day; even if all 16 were incomplete the run would stay at 50. |
| D1: 100,000 rows written per day | About 400 price rows per day (4 zones × 96 quarter-hours), plus a one-off backfill of about 1,500 rows. |
| D1: 5,000,000 rows read per day | Each ingestion run reads about 3,200 rows (stored prices plus the scan for old rows), 96 runs per day: about 300,000 rows. API calls read about 200 rows each. Each alert run (288 per day) reads the subscriptions, about 800 price rows and the cached forecasts: about 250,000 rows per day. |
| 5 Cron Triggers per account | Two triggers. |
| 50 subrequests per invocation (alert job) | At most about 20: four D1 reads, two forecast refreshes (up to three subrequests each), three pushes, one write per push (recording the alert, or deleting an expired subscription) and one delete of old records. This does not grow with the number of subscribers, which is capped at 25. |
| 10 ms CPU per invocation | A push send is one encryption and one signature; subscribing sends a single confirmation push. The alert job sends at most three pushes per run and leaves the rest for the next run 5 minutes later. A price period is first seen about an hour ahead, so about 11 runs (33 pushes) fit before it starts, which covers all 25 subscriptions. Measured on the deployed Worker: at most 5 ms per invocation. Workers Logs is enabled (`observability` in `wrangler.jsonc`), so CPU time per invocation can be checked under the Worker's *Logs* tab in the dashboard. |
| Workers Logs: 200,000 events per day, kept 3 days | One event per API call and cron run (96 per day), plus `console` output. |
| 100,000 Worker requests per day | Static assets (the app itself) are free and unlimited; only `/api/*` counts. The page makes three API calls per refresh, every 5 minutes while open, and responses may be cached by the browser for 60 seconds. |

## Getting started

Prerequisites: Node.js 24 and npm.

```sh
npm install
npm run db:migrate:local  # creates the local D1 database schema
npm run dev        # builds the frontend and serves app + API on http://localhost:8787
npm run dev:web    # optional, in a second terminal: frontend with hot reload on http://localhost:5173 (API calls go to :8787)
npm test           # runs the tests in the Workers runtime
npm run test:live  # manual checks against the real upstream APIs (needs network)
npm run typecheck  # generates Worker types, type-checks the Worker and the Svelte app
npm run lint       # ESLint on the Worker, the Svelte app, tests and scripts (eslint.config.js)
```

To run the cron jobs locally, start `npm run dev` and trigger them with `curl "localhost:8787/cdn-cgi/local/scheduled?cron=*/15+*+*+*+*"` (price ingestion) or `curl "localhost:8787/cdn-cgi/local/scheduled?cron=2,7,12,17,22,27,32,37,42,47,52,57+*+*+*+*"` (alerts). The `cron` parameter must match a trigger in `wrangler.jsonc`. Inspect the result with `npx wrangler d1 execute watten --local --command "select zone, count(*) from prices group by zone"`.

Local secrets go in `.dev.vars` (git-ignored); see `.dev.vars.example`. Only Web Push needs one: generate a key pair with `node scripts/vapid-keys.mjs`, put `VAPID_PRIVATE_KEY` in `.dev.vars` and `VAPID_PUBLIC_KEY` in `wrangler.jsonc` (or `.dev.vars`). Without them the push endpoints answer `503` and the rest works. Browsers allow push on `http://localhost`, so it can be tested locally in a desktop browser.

## Configuration

Tunable values are Worker vars in `wrangler.jsonc`. They are validated in `src/config.ts`. To change one, edit `wrangler.jsonc` and redeploy; values edited in the Cloudflare dashboard are overwritten by the next `wrangler deploy`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MIN_PRICE_DIFF_ORE_PER_KWH` | `20` | Minimum difference from the recent average, in öre/kWh, for a price to count as cheap or expensive. |
| `PRICE_DIFF_PERCENT` | `20` | Minimum difference from the recent average, in percent of it. |
| `AVERAGE_WINDOW_HOURS` | `48` | Length of the trailing window used as the recent average (1–72). Price ingestion keeps enough history to cover it. |
| `THUNDER_PROBABILITY_PERCENT` | `20` | Probability of thunder (%) from which an hour counts as having expected thunder. |
| `PRICE_ALERT_QUIET_FROM_HOUR` | `22` | No price alerts from this hour (0–23, Swedish time)… |
| `PRICE_ALERT_QUIET_TO_HOUR` | `7` | …until this hour. The quiet time may span midnight; equal hours mean no quiet time. Thunder alerts are always sent. |
| `MET_USER_AGENT` | – (required) | Identifies the app to MET Norway, as their terms require. If you deploy your own copy, change it to your own app name and contact URL or e-mail. |
| `VAPID_PUBLIC_KEY` | – | VAPID public key (base64url) for Web Push. Not a secret. Generate the pair with `node scripts/vapid-keys.mjs`. |
| `VAPID_SUBJECT` | repo URL | Contact for push services, a `mailto:` or `https://` URL. |
| `VAPID_PRIVATE_KEY` | – (secret) | VAPID private key (base64url). Set with `npx wrangler secret put VAPID_PRIVATE_KEY`, never in `wrangler.jsonc`. |

If the VAPID values are missing or invalid, the push endpoints answer `503` and everything else works. Changing the key pair invalidates every existing subscription; users then have to turn notifications on again.

**Price classification** (`src/domain/classify.ts`): the average price from now to one hour ahead is compared with the time-weighted average over the trailing window. It is *expensive* if it is above the average by more than the threshold, *cheap* if it is below by more than the threshold, and *normal* otherwise. The threshold is the larger of `MIN_PRICE_DIFF_ORE_PER_KWH` and `PRICE_DIFF_PERCENT` of the average, so the absolute minimum also prevents tiny differences from counting when the average is close to zero or negative. Prices exclude VAT, surcharges and taxes.

`npm run test:live` prints the current classification per zone and how often each level would have occurred over the last 24 hours and the known hours ahead, for the configured values and a few alternatives.

## Deployment

Requires a free Cloudflare account and `npx wrangler login`.

1. Create the database once: `npx wrangler d1 create watten`, and put the returned `database_id` in `wrangler.jsonc` (the ID is not a secret).
2. Apply the schema: `npx wrangler d1 migrations apply watten --remote`. Run it again whenever a new file is added to `migrations/`.
3. Web Push, once: run `node scripts/vapid-keys.mjs`, put `VAPID_PUBLIC_KEY` in `wrangler.jsonc`, and set the private key with `npx wrangler secret put VAPID_PRIVATE_KEY` (paste the value when asked).
4. Deploy: `npm run deploy` (builds the frontend, then runs `wrangler deploy`), or let GitHub Actions do it (see below). The first deploy may ask you to register a `workers.dev` subdomain; the app is then served on `https://watten.<subdomain>.workers.dev`.
5. Cron Trigger changes can take up to 15 minutes to take effect. The first price ingestion runs at the next quarter-hour after that; until then `/api/status` answers `503`.

Configuration lives in `wrangler.jsonc` (see [Configuration](#configuration)); values edited in the Cloudflare dashboard are overwritten by the next deploy.

### Continuous integration and deployment

`.github/workflows/ci.yml` runs on every push to `main` and every pull request against `main`:

- **check** (all runs): `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run build:web`. Any failing step fails the run. The live API tests are not run in CI.
- **deploy** (only pushes to `main`, after **check** passes): builds the frontend, applies new D1 migrations (`wrangler d1 migrations apply watten --remote`) and runs `wrangler deploy`. Deploys never run in parallel.

The deploy job uses the GitHub environment `production` (Settings → Environments). Restrict its deployment branches to `main` and add two environment secrets there; only the deploy job can read them:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | A custom Cloudflare API token limited to your account, with *Account → Workers Scripts → Edit* (deploy) and *Account → D1 → Edit* (migrations). If the deploy fails with an authentication error, add *Account → Account Settings → Read*. |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (shown in the dashboard's Workers overview). |

`VAPID_PRIVATE_KEY` stays a Worker secret in Cloudflare (step 3 above); `wrangler deploy` keeps it and it is never needed in GitHub. Steps 1 and 3 above are still done once by hand.

## Privacy

The only personal data stored on the server is a push subscription, and only while notifications are on: the browser's push endpoint and encryption keys, the zone and the rounded position (or none). Which alerts it has been sent (kind and period start) is stored with it, to avoid repeats, and deleted after a day. All of it is deleted when the user turns notifications off, or when the push service reports the subscription as gone. It is never logged. Otherwise, the chosen zone and the rounded position are stored only in the browser's `localStorage`. Positions sent to `/api/thunder` are rounded to two decimals (about 1 km) and only the forecast for that rounded position is cached; the cache does not record who asked.

## License

[MIT](LICENSE).
