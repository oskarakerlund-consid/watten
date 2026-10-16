# Watten

Watten is a small serverless service that helps you decide when to use electricity in Sweden. It shows whether the current electricity price is relatively cheap or expensive, when the cheapest upcoming hours are, and whether thunder is expected, so you can avoid using sensitive equipment or charging an EV during a thunderstorm. Users can subscribe to Web Push notifications.

> **Status:** early development, tech demo, not a commercial product. The overview page and the API work; push notifications are planned. See [`docs/PLAN.md`](docs/PLAN.md) for the implementation plan.

## How it works

A single-screen web app (in Swedish) backed by a JSON API. Everything fits on one screen without scrolling, also on a phone:

- The **background color** shows whether the price for the coming hour is cheap (green), normal (sand) or expensive (red) compared with the recent average. The level is also written out with a symbol, so color is never the only cue.
- The **cheapest 2-hour interval** within the next 8 hours.
- Whether **thunder** is expected within the next 8 hours, and roughly when.
- **Location and zone:** on the first visit you either press *Använd min plats* (the browser asks for your position; it is never requested automatically) or pick a price zone. Your zone is guessed from the position. In the settings you can change the zone and update the position. Both are stored only in your browser (`localStorage`); the position is rounded to about 1 km. Without a position, the thunder forecast is for the zone's largest city.
- _Planned:_ **push notifications** ahead of unusually high or low prices and expected thunder.

The page refreshes its data every 5 minutes and when the tab becomes visible again.

Currently implemented endpoints. All return JSON; invalid parameters give `400` with an `error` message, and missing price data gives `503`. Successful responses may be cached by the browser for 60 seconds.

| Endpoint | Parameters | Returns |
| --- | --- | --- |
| `GET /api/health` | – | `{ "status": "ok" }` |
| `GET /api/status` | `zone` (`SE1`–`SE4`, required) | `level` (`cheap` / `normal` / `expensive`) for the price from now to one hour ahead, plus `currentSekPerKwh`, `averageSekPerKwh` (trailing window), `thresholdSekPerKwh` and `averageWindowHours`. |
| `GET /api/cheapest` | `zone` (required), `interval` hours (1–6, default 2), `period` hours (1–24, default 8, at least `interval`) | The cheapest `interval`-hour window that lies entirely within the next `period` hours: `start`/`end` (UTC), `startLocal`/`endLocal` (Swedish time with offset) and `averageSekPerKwh`. |
| `GET /api/thunder` | `lat`, `lon` (required, within a bounding box around Sweden), `hours` (1–24, default 8) | Whether thunder is `expected` in the next `hours` hours: true if any hour's forecast probability is at or above `thresholdPercent`. `start`/`end` (and `startLocal`/`endLocal`) span the first to the last such hour, `null` if none. Also `maxProbabilityPercent`, `forecastFetched` and `stale` (true if MET could not be reached and an older forecast is used). This is a forecast, not observed lightning. |

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
- A **Cron Trigger** (`*/15 * * * *`) runs the price ingestion every 15 minutes. Each run fetches only days that are missing or incomplete, so most runs just read D1 and do nothing; tomorrow's prices are picked up within 15 minutes of being published (from 13:00 Swedish time), and a new deployment has prices within 15 minutes.
- A **Svelte 5 SPA** (`web/`, built with Vite) is served as Workers static assets by the same Worker: one deploy, one origin, no CORS. Only `/api/*` runs the Worker; all other requests are free static-asset requests, and unknown paths return the app.
- _Planned:_ scheduled weather checks and Web Push with VAPID.

Code layout under `src/`:

| Directory | Responsibility |
| --- | --- |
| `src/index.ts` | Worker entry point: HTTP and scheduled handlers. |
| `src/app.ts` | The Hono app: middleware, route mounting, error handling. |
| `src/routes/` | HTTP routes (Hono) with query validation. Routes only read from D1 and never call upstream APIs. |
| `src/domain/` | Pure business logic, no I/O: zones, Swedish time and DST, time-weighted price averages, cheapest-window search, price classification. |
| `src/config.ts` | Parsing and validation of the Worker vars. |
| `web/` | The Svelte frontend: `src/App.svelte`, `src/components/`, and `src/lib/` (API client, settings, formatting, geolocation). |
| `web/src/lib/zones/` | Price-zone polygons and the zone lookup used by the frontend. |
| `scripts/` | Developer scripts: producing the zone data and looking up a zone for a position. |
| `src/integrations/` | Calls to external data sources, with response validation (Zod). Each client takes a `fetch` function so it can be tested without network. |
| `src/db/` | D1 access. |
| `src/services/` | Combines integrations and storage, e.g. the cached thunder forecast. |
| `src/jobs/` | Scheduled jobs (price ingestion). |
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
| [`wrangler`](https://github.com/cloudflare/workers-sdk) | dev | Local development, type generation and deployment | MIT OR Apache-2.0 |
| [`typescript`](https://github.com/microsoft/TypeScript) | dev | Type checking (version 6, because `svelte-check` does not support 7 yet) | Apache-2.0 |
| [`svelte`](https://github.com/sveltejs/svelte) | dev | Frontend framework (compiled into the static bundle) | MIT |
| [`vite`](https://github.com/vitejs/vite) | dev | Frontend build and dev server | MIT |
| [`@sveltejs/vite-plugin-svelte`](https://github.com/sveltejs/vite-plugin-svelte) | dev | Svelte support in Vite | MIT |
| [`svelte-check`](https://github.com/sveltejs/language-tools) | dev | Type checking of `.svelte` files | MIT |
| [`vitest`](https://github.com/vitest-dev/vitest) | dev | Test runner | MIT |
| [`@cloudflare/vitest-plugin`](https://github.com/cloudflare/workers-sdk) | dev | Runs tests inside the Workers runtime | MIT |

## Free-tier limits

| Limit (Workers Free) | How Watten stays inside it |
| --- | --- |
| 50 subrequests (fetches and D1 queries) per invocation | Price ingestion uses at most 34: one read, up to 16 fetches, up to 16 writes (one SQL statement per zone and day, with the rows passed as one JSON parameter) and one delete. |
| D1: 100,000 rows written per day | About 400 price rows per day (4 zones × 96 quarter-hours), plus a one-off backfill of about 1,500 rows. |
| D1: 5,000,000 rows read per day | Each ingestion run reads about 3,200 rows (stored prices plus the scan for old rows), 96 runs per day: about 300,000 rows. API calls read about 200 rows each. |
| 5 Cron Triggers per account | One trigger so far. |
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
```

To run the price ingestion locally, start `npm run dev` and trigger the cron job with `curl "localhost:8787/cdn-cgi/local/scheduled"`. Inspect the result with `npx wrangler d1 execute watten --local --command "select zone, count(*) from prices group by zone"`.

Local secrets go in `.dev.vars` (git-ignored); see `.dev.vars.example`. None are needed yet.

## Configuration

Tunable values are Worker vars in `wrangler.jsonc`. They are validated in `src/config.ts`. To change one, edit `wrangler.jsonc` and redeploy; values edited in the Cloudflare dashboard are overwritten by the next `wrangler deploy`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MIN_PRICE_DIFF_ORE_PER_KWH` | `20` | Minimum difference from the recent average, in öre/kWh, for a price to count as cheap or expensive. |
| `PRICE_DIFF_PERCENT` | `20` | Minimum difference from the recent average, in percent of it. |
| `AVERAGE_WINDOW_HOURS` | `48` | Length of the trailing window used as the recent average (1–72). Price ingestion keeps enough history to cover it. |
| `THUNDER_PROBABILITY_PERCENT` | `20` | Probability of thunder (%) from which an hour counts as having expected thunder. |
| `MET_USER_AGENT` | – (required) | Identifies the app to MET Norway, as their terms require. If you deploy your own copy, change it to your own app name and contact URL or e-mail. |

**Price classification** (`src/domain/classify.ts`): the average price from now to one hour ahead is compared with the time-weighted average over the trailing window. It is *expensive* if it is above the average by more than the threshold, *cheap* if it is below by more than the threshold, and *normal* otherwise. The threshold is the larger of `MIN_PRICE_DIFF_ORE_PER_KWH` and `PRICE_DIFF_PERCENT` of the average, so the absolute minimum also prevents tiny differences from counting when the average is close to zero or negative. Prices exclude VAT, surcharges and taxes.

`npm run test:live` prints the current classification per zone and how often each level would have occurred over the last 24 hours and the known hours ahead, for the configured values and a few alternatives.

## Deployment

Requires a free Cloudflare account and `npx wrangler login`.

1. Create the database once: `npx wrangler d1 create watten`, and put the returned `database_id` in `wrangler.jsonc` (the ID is not a secret).
2. Apply the schema: `npx wrangler d1 migrations apply watten --remote`. Run it again whenever a new file is added to `migrations/`.
3. Deploy: `npm run deploy` (builds the frontend, then runs `wrangler deploy`). The first deploy may ask you to register a `workers.dev` subdomain; the app is then served on `https://watten.<subdomain>.workers.dev`.
4. Cron Trigger changes can take up to 15 minutes to take effect. The first price ingestion runs at the next quarter-hour after that; until then `/api/status` answers `503`.

Configuration lives in `wrangler.jsonc` (see [Configuration](#configuration)); values edited in the Cloudflare dashboard are overwritten by the next deploy.

## Privacy

No personal data is stored on the server yet. The chosen zone and the rounded position are stored only in the browser's `localStorage`. Positions sent to `/api/thunder` are rounded to two decimals (about 1 km) and only the forecast for that rounded position is cached; the cache does not record who asked.

## License

[MIT](LICENSE).
