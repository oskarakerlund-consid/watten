# Watten

Watten is a small serverless service that helps you decide when to use electricity in Sweden. It shows whether the current electricity price is relatively cheap or expensive, when the cheapest upcoming hours are, and whether thunder is expected, so you can avoid using sensitive equipment or charging an EV during a thunderstorm. Users can subscribe to Web Push notifications.

> **Status:** early development, tech demo, not a commercial product. Only the project scaffold exists so far; the features below are planned. See [`docs/PLAN.md`](docs/PLAN.md) for the implementation plan.

## How it works

_Planned._ A single-screen web app backed by a JSON API:

- **Price status** per price area (`SE1`–`SE4`): cheap, normal or expensive, relative to the recent average.
- **Cheapest interval:** the cheapest N-hour interval within the next P hours.
- **Thunder forecast** for a position, a number of hours ahead.
- **Push notifications** ahead of unusually high or low prices and expected thunder.

Currently implemented endpoints. All return JSON; invalid parameters give `400` with an `error` message, and missing price data gives `503`. Successful responses may be cached by the browser for 60 seconds.

| Endpoint | Parameters | Returns |
| --- | --- | --- |
| `GET /api/health` | – | `{ "status": "ok" }` |
| `GET /api/status` | `zone` (`SE1`–`SE4`, required) | `level` (`cheap` / `normal` / `expensive`) for the price from now to one hour ahead, plus `currentSekPerKwh`, `averageSekPerKwh` (trailing window), `thresholdSekPerKwh` and `averageWindowHours`. |
| `GET /api/cheapest` | `zone` (required), `interval` hours (1–6, default 2), `period` hours (1–24, default 8, at least `interval`) | The cheapest `interval`-hour window that lies entirely within the next `period` hours: `start`/`end` (UTC), `startLocal`/`endLocal` (Swedish time with offset) and `averageSekPerKwh`. |

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
- A **Cron Trigger** (`*/15 11-14 * * *`, UTC) runs the price ingestion every 15 minutes around 13:00 Swedish time, when tomorrow's prices are published. Each run fetches only days that are missing or incomplete, so once tomorrow's prices are stored, the remaining runs that day do nothing.
- _Planned:_ weather checks, a Svelte SPA served as Workers static assets from the same Worker, and Web Push with VAPID.

Code layout under `src/`:

| Directory | Responsibility |
| --- | --- |
| `src/index.ts` | Worker entry point: HTTP and scheduled handlers. |
| `src/app.ts` | The Hono app: middleware, route mounting, error handling. |
| `src/routes/` | HTTP routes (Hono) with query validation. Routes only read from D1 and never call upstream APIs. |
| `src/domain/` | Pure business logic, no I/O: zones, Swedish time and DST, time-weighted price averages, cheapest-window search, price classification. |
| `src/config.ts` | Parsing and validation of the Worker vars. |
| `src/integrations/` | Calls to external data sources, with response validation (Zod). Each client takes a `fetch` function so it can be tested without network. |
| `src/db/` | D1 access. |
| `src/services/` | Combines integrations and storage, e.g. the cached thunder forecast. |
| `src/jobs/` | Scheduled jobs (price ingestion). |
| `migrations/` | D1 schema migrations. |

## Third-party data and dependencies

### Data sources

- [Elpriset just nu](https://www.elprisetjustnu.se/elpris-api) – electricity prices per price area, free and without API key. Prices exclude VAT, surcharges and taxes. The client is implemented (`src/integrations/elprisetjustnu.ts`) but not yet scheduled. On the day summer time ends, the API reports one interval with a wrong end time; the client caps every interval at the start of the next one. Recorded responses used in tests live in `test/fixtures/elprisetjustnu/`.
- [MET Norway](https://api.met.no/) – weather forecasts from Locationforecast 2.0, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (data from MET Norway). Watten uses the hourly `probability_of_thunder`, available for all of Sweden about 55 hours ahead. Following MET's [terms of service](https://developer.yr.no/doc/TermsOfService/), requests send an identifying `User-Agent`, positions have at most four decimals, and responses are cached in D1 until their `Expires` time and then revalidated with `If-Modified-Since`. If MET cannot be reached, the last cached forecast is served and marked stale. The client is implemented (`src/integrations/metno.ts`, `src/services/thunderForecast.ts`) but not yet exposed through the API.

### Dependencies

| Package | Kind | Why | License |
| --- | --- | --- | --- |
| [`hono`](https://github.com/honojs/hono) | runtime | API routing in the Worker | MIT |
| [`zod`](https://github.com/colinhacks/zod) | runtime | Validation of external data and request parameters | MIT |
| [`@hono/zod-validator`](https://github.com/honojs/middleware) | runtime | Zod validation of request parameters in Hono routes | MIT |
| [`wrangler`](https://github.com/cloudflare/workers-sdk) | dev | Local development, type generation and deployment | MIT OR Apache-2.0 |
| [`typescript`](https://github.com/microsoft/TypeScript) | dev | Type checking | Apache-2.0 |
| [`vitest`](https://github.com/vitest-dev/vitest) | dev | Test runner | MIT |
| [`@cloudflare/vitest-plugin`](https://github.com/cloudflare/workers-sdk) | dev | Runs tests inside the Workers runtime | MIT |

## Free-tier limits

| Limit (Workers Free) | How Watten stays inside it |
| --- | --- |
| 50 subrequests (fetches and D1 queries) per invocation | Price ingestion uses at most 34: one read, up to 16 fetches, up to 16 writes (one SQL statement per zone and day, with the rows passed as one JSON parameter) and one delete. |
| D1: 100,000 rows written per day | About 400 price rows per day (4 zones × 96 quarter-hours), plus a one-off backfill of about 1,500 rows. |
| D1: 5,000,000 rows read per day | Each ingestion run reads at most ~1,600 rows, 16 runs per day. |
| 5 Cron Triggers per account | One trigger so far. |

## Getting started

Prerequisites: Node.js 24 and npm.

```sh
npm install
npm run db:migrate:local  # creates the local D1 database schema
npm run dev        # starts the Worker locally on http://localhost:8787
npm test           # runs the tests in the Workers runtime
npm run test:live  # manual checks against the real upstream APIs (needs network)
npm run typecheck  # generates Worker types and runs the TypeScript compiler
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
| `MET_USER_AGENT` | – (required) | Identifies the app to MET Norway, as their terms require. If you deploy your own copy, change it to your own app name and contact URL or e-mail. |

**Price classification** (`src/domain/classify.ts`): the average price from now to one hour ahead is compared with the time-weighted average over the trailing window. It is *expensive* if it is above the average by more than the threshold, *cheap* if it is below by more than the threshold, and *normal* otherwise. The threshold is the larger of `MIN_PRICE_DIFF_ORE_PER_KWH` and `PRICE_DIFF_PERCENT` of the average, so the absolute minimum also prevents tiny differences from counting when the average is close to zero or negative. Prices exclude VAT, surcharges and taxes.

`npm run test:live` prints the current classification per zone and how often each level would have occurred over the last 24 hours and the known hours ahead, for the configured values and a few alternatives.

## Deployment

_To be documented._

## Privacy

_To be documented._ No personal data is stored yet.

## License

[MIT](LICENSE).
