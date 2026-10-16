# Watten – implementation plan

Status: **draft v3, awaiting review. Nothing is implemented yet.**

This is a living document. `CLAUDE.md` holds the fixed decisions, requirements and rules; this file holds the order of work. Tick off steps as they are finished and update the plan when decisions change.

Each step is small, independently verifiable and (unless noted) leaves the repo in a working state. **Every step also updates `README.md`** for what it adds (the repo is public); a step is not done until the README matches the code. Every step also has a **manual check** you can run yourself to see the result. Work happens on a feature branch with conventional commits; nothing is committed to `main` without asking, and nothing is deployed by the agent.

## Verified platform facts

Checked against Cloudflare / MET Norway / Elpriset just nu docs on 2026-10-15. Re-check before relying on them for design decisions.

| Area | Fact | Consequence |
| --- | --- | --- |
| Workers Free | 100,000 requests/day, **10 ms CPU per request and per cron invocation** (waiting on network does not count), 50 subrequests per invocation, 5 cron triggers per account | Keep handlers light. Push fan-out is the main risk (step 11). Use at most 2 cron triggers. |
| Static assets | Requests served directly from assets are free and unlimited. With `run_worker_first`, matching requests invoke the Worker, count against Workers limits, and get a 429 once the free limit is exceeded | Only run the Worker first for `/api/*`. |
| D1 Free | 5 M rows read/day, 100 k rows written/day, 5 GB total, 500 MB/database. Exceeding read/write limits **stops all queries** until 00:00 UTC | Ample for a handful of users if writes stay deliberate (no per-request writes). |
| Cron Triggers | Always UTC. Changes can take up to 15 min to propagate. Local testing via `GET /cdn-cgi/local/scheduled` on `wrangler dev` (`?cron=` selects the pattern) | Schedules are written in UTC; Swedish local time shifts with DST, so handlers must not assume a fixed local hour. |
| Elpriset just nu | Free, no key. 15-min intervals since 2025-10-01, hourly before. Tomorrow's prices no earlier than 13:00 Swedish time. History back to 2022-11-01. Prices exclude VAT/surcharges/taxes. No documented rate limit or SLA | Cache in D1. Retry when tomorrow's data is missing. Backfill history from the API. |
| MET Norway | `symbol_code` is in `compact.json` and `complete.json`. `probability_of_thunder` is **only in `complete.json`**, only in `next_1_hours`, and only in the Nordic short-range forecast (1 h steps). Requires identifying `User-Agent`, respect for `Expires`/`If-Modified-Since`, 4-decimal coordinates, CC BY 4.0 attribution, max 20 req/s per application | Thunder detection looks feasible, but coverage and forecast horizon must be checked in step 7. |

Not yet verified (checked in the step that needs it): per-send CPU cost of Web Push on Workers, behaviour of the candidate Web Push libraries, which `symbol_code` values mean thunder, whether the MET Nordic short-range domain covers all of Sweden and how many hours ahead it reaches.

## Decisions

Resolved:

- **Users:** anyone in Sweden may use the service and subscribe; expected audience is a handful of people, tech demo, not commercial.
- **Price classification (D2):** relative to the average price over the **last 48 hours**. A deviation must exceed both **20 öre/kWh** and **20 %** of the average to count as cheap or expensive (chosen in step 5 from real data; the initial 50 öre made SE1/SE2 always "normal"). The window, the minimum difference and the percentage threshold are configuration (see Configuration), not hard-coded.
- **Validation:** Zod (+ `@hono/zod-validator`).
- **Layout:** one root `package.json`; Worker in `src/`; Svelte + Vite app in `web/` with its own Vite config; `web/dist` is the Wrangler assets directory.
- **Location (D8) and zone (D10 = option B):** if no position is stored, the frontend shows a "use my location" button that requests the browser position (never automatically on load). The position is rounded to 2 decimals (~1 km) in the browser, stored in `localStorage`, and sent as `lat`/`lon` to `/api/thunder`. The zone is guessed from the position with bundled, simplified polygons derived from `entsoe-py`, without asking for confirmation. Afterwards the user can change the zone manually and reload the GPS position; reloading re-guesses the zone and overwrites a manual choice (D11). Both are stored in `localStorage`.
- **Polygon simplification (D12):** a small dependency-free script, `scripts/simplify-zones.mjs` with the logic in `scripts/simplifyGeometry.ts` (Douglas–Peucker), run once by hand; the procedure is documented in `README.md`. Done in step 9a. Without a position (denied, unavailable), the user picks the zone and a fixed representative point per zone is used for thunder.
- **Thunder horizon (D9):** default 8 hours, maximum 24, additionally capped by the real forecast horizon found in step 7.
- **Web Push (D4):** spike one Workers-compatible library (`web-push-neo`, `web-push-browser` or `PushForge`; none reviewed yet) in step 11; fall back to hand-rolled Web Crypto.
- **License (D13):** MIT, in `LICENSE` from step 1.
- **Frontend hosting (D6):** Workers static assets (locked): the built Svelte files are served by the same Worker as the API, one deploy and one origin.

Open (needed before the step that depends on them; proposals are not decisions):

| # | Question | Needed by | Proposal |
| --- | --- | --- | --- |
| D7 | Push fan-out beyond the 50-subrequest limit | Step 12 | Not a concern for a handful of users. If it ever is, spread sends over cron ticks. Queues would be a new service, so ask first. |

### D10 research (2026-10-15) – decided: option B

- **No official, openly licensed SE1–SE4 geometry found.** Svenska kraftnät's open dataset only has rough bounding boxes. No GIS download from Svenska kraftnät, ENTSO-E or Energimarknadsinspektionen was found (Ei's concession maps appear only as PDF appendices).
- **Zones are formally tied to grid areas (nätområden), not to geography.** Nätområden.se (run by a private company, Internaut) lists which elområde each grid area belongs to, but offers no map download or license.
- **Best available geometry:** `entsoe-py` (MIT-licensed repo) has `SE_1.geojson`–`SE_4.geojson` (~200 KB in total, before simplification). Its README says the Swedish zones were **manually redrawn** from natomraden.se because the direct download "gives weird shapes". So the data is unofficial, its accuracy near borders is unknown, and the license of the underlying data is unclear.
- **The zones may change.** The government has asked Svenska kraftnät to analyse a new zone division, with the report due 2027-01-29. Earlier proposals included removing the SE3/SE4 border, a separate Stockholm zone and merging SE1/SE2. Implementation is expected to take years, but any bundled geometry would then be wrong.

Options:

- **A. Manual selection.** The user picks SE1–SE4 once (a short hint such as "Norrbotten → SE1, Skåne → SE4" plus a link to the electricity supplier's info), stored in `localStorage`. No data to maintain, never wrong because of geometry, no licensing question.
- **B. Guess a zone from the `entsoe-py` geometry (chosen).** Simplify to a few KB, bundle as static data with attribution (MIT notice), run point-in-polygon in the browser. The guess is applied without confirmation, the current zone is always visible, and the user can change it. Costs: unofficial data, unclear upstream license, must be updated if the zones change.

## Dependencies proposed (require approval before install)

Nothing is installed until you approve the list for the step that needs it.

- Step 1 (installed): `typescript`, `wrangler`, `hono`, `vitest`, `@cloudflare/vitest-plugin` (successor of the deprecated `@cloudflare/vitest-pool-workers`)
- Step 3 (installed): `zod`
- Step 6 (installed): `@hono/zod-validator`
- Step 9b (installed): `svelte`, `vite`, `@sveltejs/vite-plugin-svelte`, `svelte-check`; TypeScript downgraded from 7 to 6 because `svelte-check` crashes with 7 (your decision)
- Step 11: Web Push library (D4), if not hand-rolled

## Cloudflare and third-party setup (user actions)

| When | Action | Notes |
| --- | --- | --- |
| Before step 4 | Create a free Cloudflare account (if you don't have one) and run `npx wrangler login` | Opens a browser. In WSL2 this has to be completed on the Windows host. |
| Step 4 | `npx wrangler d1 create watten`, then paste the returned `database_id` into `wrangler.jsonc` (agent prepares everything else) | One D1 database. The ID is not a secret. |
| Step 7 | Choose a contact for the MET `User-Agent`, e.g. `watten/0.1 (your-email-or-github-url)` | Required by MET terms; fake or random values count as abuse. Appears in the repo's config, so pick something you are happy to publish. |
| Step 10 | `npx wrangler deploy` (you run it) and `npx wrangler d1 migrations apply watten --remote` | You deploy; the agent does not. Served on `https://watten.<your-subdomain>.workers.dev`. If prompted, register a `workers.dev` subdomain. No custom domain needed. |
| Step 11 | Generate a VAPID key pair (agent provides the command). Set the private key with `npx wrangler secret put VAPID_PRIVATE_KEY`. Put the public key in `wrangler.jsonc` vars and in `.dev.vars` for local runs. Choose a VAPID `subject` (`mailto:` or https URL) | Private key never goes in git or the frontend. HTTPS is required by Web Push; `localhost` is exempt during development. |
| Elpriset just nu | Nothing to register | Credit them in the UI (requested, not required). |
| MET Norway | Nothing to register | Credit MET Norway (CC BY 4.0) in the UI. |

## Configuration

Tunable values live in Wrangler `vars` (`wrangler.jsonc`), are parsed and defaulted in one place with Zod (`src/config.ts`), and are never hard-coded in logic. Initial values:

| Variable | Initial | Meaning |
| --- | --- | --- |
| `MIN_PRICE_DIFF_ORE_PER_KWH` | `20` | Minimum difference to the recent average for cheap/expensive. |
| `AVERAGE_WINDOW_HOURS` | `48` | Length of the trailing window used as "recent average". |
| `PRICE_DIFF_PERCENT` | `20` | Percentage deviation also required for cheap/expensive. |

To change a value: edit `wrangler.jsonc` and run `wrangler deploy` (you deploy anyway). Wrangler treats the config file as the source of truth, so a value edited in the Cloudflare dashboard is **overwritten on the next deploy** unless `keep_vars = true` is set (verified in Wrangler docs). The plan uses the config file only, to avoid two places holding the same value. Prices from Elpriset just nu exclude VAT.

## API (as planned)

All `GET` endpoints return JSON, read from D1 or a short-lived cache, and validate and bound every parameter with Zod. Defaults in parentheses.

| Endpoint | Parameters | Answers |
| --- | --- | --- |
| `GET /api/status` | `zone` (`SE1`–`SE4`, required) | Class (`cheap` / `normal` / `expensive`) of the current price and the next hour, the prices behind it, the recent average used. |
| `GET /api/cheapest` | `zone` (required), `interval` hours (2; bounded 1–6), `period` hours (8; bounded up to the known price horizon, max 24) | Start/end (UTC instants plus Swedish local time) and average price of the cheapest `interval`-long window that lies entirely within the next `period` hours. |
| `GET /api/thunder` | `lat`, `lon` (GPS position; Sweden only; rounded to 2 decimals in the browser and again server-side), `hours` (8; max 24, capped by forecast horizon) | Whether thunder is expected within `hours`, and the approximate time of the first/strongest occurrence. A forecast, not observed lightning strikes. |
| `POST /api/push/subscribe`, `DELETE /api/push/subscribe` | Push subscription + zone + rounded location | Enable / disable notifications. |

## README

`README.md` is created in step 1 and grown by every step. Planned sections:

1. **Watten** – one-paragraph purpose, screenshot (from step 9), status (tech demo, not commercial).
2. **How it works** – the overview screen, the API endpoints with parameters, push notifications.
3. **Architecture** – a small diagram and text: Worker (Hono API + cron) → D1; Elpriset just nu and MET Norway as upstreams; Svelte SPA served as static assets; Web Push. Plus the `src/` layering (routes / domain / integrations / db).
4. **Third-party data and dependencies** – data sources with terms and attribution (Elpriset just nu, MET Norway CC BY 4.0, `entsoe-py` zone geometry under MIT and how it was simplified); runtime and dev dependencies with a one-line reason each.
5. **Free-tier limits** – which Cloudflare limits matter and how the design stays inside them.
6. **Getting started** – prerequisites, install, `.dev.vars`, local D1 migrations, `npm run dev`, tests and typecheck.
7. **Configuration** – the Wrangler vars (thresholds, window) and secrets (VAPID), how to change them.
8. **Deployment** – creating D1, setting secrets, remote migrations, `wrangler deploy`.
9. **Privacy** – what is stored (push subscription, rounded position) and when it is deleted; position is otherwise only kept in the browser.
10. **License** – MIT (D13).

Public-repo consequences, applied throughout: `.dev.vars` and other secret files are git-ignored and only `.dev.vars.example` is committed; the D1 `database_id` and the MET `User-Agent` contact end up public (neither is a secret, but choose a contact you are happy to publish); no personal or private tooling is referenced.

## Steps

Each step lists: goal, files touched, consequences, and how to verify. File paths are proposals. `README.md` is touched in every step and therefore not repeated in each list.

### Step 1 – Project scaffold ✅

**Goal:** an empty but working TypeScript Worker with Hono, tests and typechecking.

**Files:** `package.json`, `package-lock.json`, `tsconfig.json` (strict), `wrangler.jsonc`, `vitest.config.ts`, `.gitignore` (`node_modules`, `.wrangler`, `.dev.vars`, `web/dist`), `.dev.vars.example`, `src/index.ts` (Hono app, `GET /api/health`), `src/index.test.ts`, `README.md` (skeleton with all planned sections, filled where already true), `LICENSE` (D13).

**Consequences:** Adds the Step 1 dependencies. Establishes the `src/` layering used throughout: `src/routes/` (Hono), `src/domain/` (pure logic), `src/integrations/` (network), `src/db/` (D1). Sets scripts: `dev`, `test`, `typecheck`, `deploy`, `cf-typegen`. `worker-configuration.d.ts` (~600 KB) is generated by `wrangler types` as part of `typecheck` and git-ignored.

**Verify:** `npm run typecheck` and `npm test` pass; `npx wrangler dev` then `curl localhost:8787/api/health` returns 200.

**Manual check (you):** `npm run dev`, open <http://localhost:8787/api/health> → `{"status":"ok"}`.

### Step 2 – Time and price domain (pure logic) ✅

**Goal:** correct handling of 15-minute (and older hourly) intervals and the Swedish time zone/DST. No network, no DB.

**Files:** `src/domain/types.ts` (`PriceInterval`, `Zone`, …), `src/domain/time.ts` (Europe/Stockholm helpers, local-day boundaries as UTC instants), `src/domain/prices.ts` (average over a span, cheapest window of N hours within the next P hours), plus `*.test.ts`.

**Consequences:** All timestamps are stored and compared as UTC instants; Stockholm time is used only to define "today"/"tomorrow" and for display. Local days have 92, 96 or 100 intervals around DST changes and the tests must cover both transitions. Averages are time-weighted over any span, so no separate hourly aggregation is needed: "now → +60 min" and an N-hour window are just spans. The cheapest window must lie entirely within the period and may start at "now" or at any interval boundary; ties go to the earliest.

**Verify:** unit tests incl. spring-forward and fall-back days, window search with ties and with fewer known intervals than requested.

**Manual check (you):** `npm test -- --reporter=verbose` → every time and price test listed as passing, including the DST days.

### Step 3 – Elpriset just nu integration ✅

**Goal:** fetch and validate one day of prices for one zone.

**Files:** `src/integrations/elprisetjustnu.ts` (URL building, fetch, Zod schema, mapping to domain types), `src/integrations/elprisetjustnu.test.ts`, `test/fixtures/elprisetjustnu/` (recorded real SE3 responses: a normal day, both DST change days and an hourly day from before 2025-10-01), `tsconfig.json` (`resolveJsonModule` for fixtures).

**Consequences:** Adds `zod`. A 404 (tomorrow not published yet) is a typed "not available" result, not an exception. The fixtures revealed an upstream bug on the fall-back day (one interval ends an hour too late), handled by capping each interval at the next start. The client takes `fetch` as a parameter so tests need no network.

**Verify:** tests against fixtures; `npm run test:live` confirms the live shape matches the fixtures (96 entries on a normal day). Live checks live in `test/live/`, use `vitest.live.config.ts` and are excluded from `npm test`, so normal tests never need network.

**Manual check (you):** `npm run test:live` → a table with today's and tomorrow's prices for SE1–SE4: 96 intervals per day (92/100 on DST days), min and max SEK/kWh. Before 13:00, tomorrow shows "not published yet".

### Step 4 – D1 storage and price ingestion (cron) ✅

**Goal:** prices for all four zones are kept fresh in D1, including the recent past needed for the average.

**Files:** `migrations/0001_prices.sql` (`prices`: zone, `start_utc`, `end_utc`, `sek_per_kwh`; primary key zone+start), `src/db/prices.ts`, `src/jobs/ingestPrices.ts`, `src/index.ts` (add `scheduled` handler dispatching on `controller.cron`), `wrangler.jsonc` (D1 binding, first cron trigger).

**Consequences:** Introduces persistent state (needs the D1 database, see setup table). Each run fetches today and tomorrow for four zones (≤ 8 subrequests, well inside the 50 limit) and, on an empty database, backfills the days needed for the 48 h average window (D2): the two previous days, so at most 4 zones × 4 days = 16 subrequests, inside the 50 limit. A much longer window would need chunked backfill. Rows that start before the first kept day are deleted on every run (cheap; usually deletes nothing). Only missing or incomplete days are fetched, so runs after tomorrow's prices are stored do nothing. Upserts are idempotent. D1 docs do not say whether a `batch()` counts as one or several queries against the 50-per-invocation limit, so each zone/day is written with **one** statement (rows passed as JSON through `json_each`), keeping a run at ≤ 34 subrequests either way. The scheduled handler throws after processing all days if any fetch failed, so failures show in Cloudflare's cron event log. One cron trigger such as `*/15 11-14 * * *` (UTC; covers 13:00 Swedish time in both summer and winter time) retries until tomorrow's prices appear. Writes stay small (~800 rows/day).

**Verify:** `npx wrangler d1 migrations apply watten --local`; trigger `curl "localhost:8787/cdn-cgi/local/scheduled?cron=..."`; inspect with `npx wrangler d1 execute watten --local --command "select zone, count(*) from prices group by zone"`. Job tests with a fake fetcher and D1 via `@cloudflare/vitest-plugin`.

**Manual check (you):** `npm run db:migrate:local`, `npm run dev`, then in another terminal `curl "localhost:8787/cdn-cgi/local/scheduled?cron=…"` and `npx wrangler d1 execute watten --local --command "select zone, count(*) from prices group by zone"` → four zones with rows for the backfilled days, today and (after 13:00) tomorrow.

### Step 5 – Price classification ✅

**Goal:** turn price data into `cheap` / `normal` / `expensive` for "now → +60 min", relative to the average of the last 48 hours.

**Files:** `src/config.ts` (Zod-parsed vars with defaults), `src/domain/classify.ts`, `src/domain/classify.test.ts`, `wrangler.jsonc` (vars), `src/jobs/ingestPrices.ts` (history days derived from the window), `test/live/classification.live.test.ts`. The definition is documented in the README's Configuration section instead of a separate `docs/classification.md`.

**Consequences:** Cheap or expensive requires a deviation larger than both the minimum öre/kWh difference (20) and a percentage of the average (20 %), chosen on real data: 50 öre made SE1/SE2 100 % "normal", percent alone made SE1 63 % "expensive". All three values come from configuration, so you can tune them by editing `wrangler.jsonc` and redeploying. This one function feeds the status endpoint, the frontend colors and, later, price notifications, so the definition exists in exactly one place. Thresholds are constants in one file. The window is capped at 72 h and price ingestion keeps `ceil(window / 24)` days of history, so a run stays at ≤ 42 subrequests.

**Verify:** unit tests on hand-built series (flat day, evening peak, zero and negative prices, too little history); review the classification of real recorded days with you before moving on.

**Manual check (you):** `npm run test:live` additionally prints the current classification (cheap/normal/expensive), the 48 h average and the price now → +60 min for each zone, so you can judge whether the thresholds feel right.

### Step 6 – Price API ✅

**Goal:** `GET /api/status` and `GET /api/cheapest` as specified above.

**Files:** `src/app.ts` (Hono app factory with an injectable clock for tests), `src/routes/status.ts`, `src/routes/cheapest.ts`, `src/routes/validation.ts`, `src/routes/types.ts`, route tests, `test/seedPrices.ts`, `src/db/prices.ts` (`loadZoneIntervals`), `src/domain/time.ts` (`toStockholmIso`), `src/index.ts`.

**Consequences:** Adds `@hono/zod-validator`. Endpoints read from D1 only and never call upstream. Short `Cache-Control` headers keep frontend polling from burning the 100k/day request budget. Invalid or out-of-range parameters return 400 with a clear message; missing data returns 503. `interval` and `period` are whole hours (1–6 and 1–24, `interval` ≤ `period`).

**Verify:** route tests via `app.request()` with seeded D1 (including bounds and missing-data cases); `curl` against `wrangler dev`.

**Manual check (you):** With `npm run dev` running, open <http://localhost:8787/api/status?zone=SE3> and <http://localhost:8787/api/cheapest?zone=SE3&interval=2&period=8> → real JSON. Try `zone=SE9` or `interval=99` → 400 with a clear message.

### Step 7 – MET Norway integration ✅

**Goal:** fetch, validate and cache the forecast for a coordinate.

**Files:** `src/integrations/metno.ts` (+ tests; fixture `test/fixtures/metno/2026-10-16_stockholm_complete.json`), `migrations/0002_forecast_cache.sql` (parsed hourly thunder probabilities plus `Expires` / `Last-Modified`, keyed by rounded coordinates), `src/db/forecastCache.ts`, `src/services/thunderForecast.ts` (+ tests; cache, conditional requests, stale fallback), `src/config.ts` and `wrangler.jsonc` (`MET_USER_AGENT`), `test/live/metno.live.test.ts`.

**Consequences:** Must send the identifying `User-Agent`, truncate coordinates to 4 decimals (we round further, see D8), honor `Expires` and `If-Modified-Since`, and back off on 429. Before designing on `probability_of_thunder`, confirm in a real response that it exists for locations in northern, central and southern Sweden and find the forecast horizon; if it does not, fall back to thunder `symbol_code` values from `compact.json` (verify which codes). The finding is recorded in `CLAUDE.md` and settles D9. **Result (2026-10-16):** `probability_of_thunder` is present for Kiruna, Sundsvall, Stockholm and Malmö, hourly for ~55 hours ahead, so the symbol-code fallback is not needed and the 24 h maximum (D9) is well within the horizon. Only the parsed hourly probabilities (~2 KB) are cached, not the ~90 KB raw response. After an error, an older forecast is served as stale and MET is not asked again for 10 minutes.

**Verify:** fixture tests; manual calls from `wrangler dev` for three Swedish locations; a second call proves conditional requests and caching work.

**Manual check (you):** `npm run test:live` additionally prints, for three Swedish locations, whether `probability_of_thunder` is present, the forecast horizon in hours and the highest thunder probability ahead.

### Step 8 – Thunder API ✅

**Goal:** `GET /api/thunder` as specified above.

**Files:** `src/domain/thunder.ts` (+ tests), `src/routes/thunder.ts` (+ tests), `src/app.ts` (injectable `fetcher` next to the clock), `src/config.ts` and `wrangler.jsonc` (`THUNDER_PROBABILITY_PERCENT`, default 20).

**Consequences:** Settles D8 (location input) and the "expected thunderstorm" threshold, which is a tunable constant you approve. The endpoint accepts arbitrary coordinates and triggers upstream calls on cache misses, so coordinates are validated to lie within Sweden, rounded, and served from the D1 cache; this protects MET's servers and our subrequest budget from abuse. Returns a clear "no data" state when MET is unavailable instead of "no thunder". **Implemented:** thunder is expected if any hour overlapping the period has a probability ≥ 20 %; the response gives the span from the first to the last such hour and the highest probability. Positions are validated against a bounding box around Sweden (which also includes border areas of Norway, Finland and Denmark) and rounded to two decimals before use.

**Verify:** unit tests on forecast fixtures with and without thunder (including thunder starting inside and outside the window); route tests for bounds (outside Sweden, `hours` too large); `curl` against `wrangler dev` with real data.

**Manual check (you):** With `npm run dev` running, open <http://localhost:8787/api/thunder?lat=59.33&lon=18.07&hours=8> → thunder yes/no and approximate time. Try a position outside Sweden or `hours=48` → 400.

### Step 9a – Price-zone data ✅

**Goal:** guess the price zone from a position, using simplified polygons from `entsoe-py` (D10, option B).

**Files:** `scripts/simplifyGeometry.ts` (+ tests; Douglas–Peucker in a local km projection), `scripts/simplify-zones.mjs` (CLI: reads the downloaded GeoJSON files given as arguments, writes `zones.json`; Node runs the imported `.ts` file natively, so no extra dependency), `scripts/guess-zone.mjs` (manual lookup), `web/src/lib/zones/zones.json`, `web/src/lib/zones/guessZone.ts` (+ tests), `web/src/lib/zones/LICENSE-entsoe-py`, `tsconfig.json` (includes `scripts/` and `web/src/lib/`; the frontend gets its own config in 9b).

**Consequences:** Source: entsoe-py commit `12ce32f` (last changed 2022-04-16). Tolerance 2 km: 863 points, 14 KB (~5 KB gzipped); 0.5 and 1 km gave the same accuracy at 2–3× the size. Compared with the original polygons on a ~5 km grid (19,394 points), 2 points (0.01 %) get another zone and none get no zone. Point-in-polygon first, else the nearest zone within 10 km, else `null`. The original GeoJSON files are not committed; the README documents how to reproduce `zones.json`.

**Verify:** unit tests for simplification and for 12 Swedish towns across all zones plus Oslo, Helsinki and Copenhagen (no zone).

**Manual check (you):** `node scripts/guess-zone.mjs 59.33 18.07` → `SE3`; try your own position or towns near zone borders.

### Step 9b – Svelte frontend (overview screen) ✅

**Goal:** one SPA screen that answers "is it cheap, when is it cheapest, will it thunder?" at a glance.

**Files:** `web/index.html`, `web/vite.config.ts`, `web/tsconfig.json`, `web/src/main.ts`, `web/src/app.css`, `web/src/App.svelte`, `web/src/components/` (`PriceHeadline`, `Card`, `CheapestCard`, `ThunderCard`, `ZonePicker`, `SettingsDialog`), `web/src/lib/` (`api.ts`, `settings.ts` + tests, `format.ts` + tests, `geolocation.ts`, `zones.ts`), `wrangler.jsonc` (`assets`), `package.json` (`dev`, `dev:web`, `build:web`, `deploy`, `typecheck` with `svelte-check`), `tsconfig.json`.

**Consequences (implemented):** UI in Swedish. Colors: green (cheap), sand (normal), red (expensive), grey (unknown), each with a text label and symbol. No push form yet (step 11). The frontend imports the zone list from `src/domain/types.ts`, so it exists in one place. The API response types in `web/src/lib/api.ts` are written by hand. `npm run dev` builds the frontend first because Wrangler serves `web/dist`. Polling every 5 minutes and on tab focus. Footer credits Elpriset just nu and MET Norway (CC BY 4.0). JS bundle 61 KB (24 KB gzipped), of which the zone data is ~14 KB.

- Layout: everything fits in the viewport without scrolling, including small phones (design around 360×640; use `100dvh`). Settings and the push form open as an overlay/dialog, so the main view never scrolls.
- Content: background color for cheap / normal / expensive plus a text label and symbol; the start–end of the cheapest 2-hour interval within the next 8 hours (in Swedish time, "now" if it is now); thunder yes/no for the next 8 hours and, if yes, the approximate time.
- Color alone never carries the meaning, and text/background contrast must pass in all three states.
- Location and zone: with no stored position, the main view shows a "use my location" button and a manual zone picker; prices render as soon as a zone is known. Pressing the button requests the browser position, stores it rounded, and guesses the zone without confirmation. The current zone is always shown, and the settings overlay lets the user change the zone and reload the GPS position (which re-guesses the zone). Both are stored in `localStorage`.
- Edge cases: permission denied or unavailable → the user is asked to pick a zone and thunder uses the zone's representative point (stated in the UI). Position outside every polygon (coast, archipelago, simplification gaps) → nearest zone if within a few km, otherwise ask the user to pick. Position outside Sweden → ask the user to pick; thunder shows "not available".
- Polls sparingly (every few minutes and on tab focus). Static assets are free, API calls are not.
- Footer credits Elpriset just nu and MET Norway. No secrets in the bundle.
- Failure states: if one endpoint fails, the other parts still render, and stale/unavailable data is marked as such.

**Verify:** `npm run build`; `npx wrangler dev` serves SPA and API on one origin; check all three states and the thunder yes/no/unknown cases with seeded data; manually confirm no scrolling at 360×640 and 320×568 and landscape; Svelte typecheck.

**Manual check (you):** `npm run dev`, open <http://localhost:8787> in a Windows browser. Press "use my location", change zone, reload the position. Use DevTools device mode at 360×640 to confirm nothing scrolls.

### Step 10 – First deploy

**Goal:** the service runs on Cloudflare and ingests real prices on its own.

**Files:** `wrangler.jsonc` (final names, vars), `README.md` (setup and deploy notes).

**Consequences:** You run the deploy and remote migrations; the agent does not. Public URL on `workers.dev`. Cron changes can take up to 15 min to take effect. Confirms D6 against real limits in the dashboard.

**Verify:** after the first 13:00 window, `/api/status?zone=SE3` serves data and the frontend works on your phone; check Workers and D1 usage in the dashboard against the free-tier numbers above.

**Manual check (you):** Open `https://watten.<your-subdomain>.workers.dev` on your phone; check Workers and D1 usage in the Cloudflare dashboard.

### Step 11 – Web Push: subscribe/unsubscribe (spike and UI)

**Goal:** prove a Worker can send an encrypted Web Push to a real browser, and let the user enable/disable notifications from the UI.

**Files:** `src/integrations/webpush.ts` (send function behind a small interface), `src/routes/push.ts` (`POST` / `DELETE /api/push/subscribe`), `migrations/0003_push_subscriptions.sql` (endpoint, keys, zone, rounded lat/lon, created_at), `src/db/subscriptions.ts`, `web/public/sw.js` (service worker), `web/public/manifest.webmanifest`, `web/src/lib/push.ts`, `web/src/PushDialog.svelte`, `.dev.vars.example`, `wrangler.jsonc` (vars).

**Consequences:** Settles D4. The UI is a simple on/off form, which saves the user's currently selected zone and location with the subscription (no per-alert-type options). Stored subscription data is personal data: endpoint, keys and a rounded location. Never log it, keep it only while subscribed, delete it on unsubscribe and show a short note in the form saying what is stored. The subscribe endpoint validates input with Zod and accepts only `https` endpoints on known push-service hosts; otherwise it lets anyone make the Worker POST to arbitrary URLs. Expired subscriptions (HTTP 404/410 from the push service) are deleted automatically. iOS delivers Web Push only to a home-screen-installed PWA, hence the manifest. The spike measures per-send CPU time to size step 12.

**Verify:** subscribe in desktop Chrome on `localhost`, send a test push, receive it; unsubscribe and confirm the row is gone and a further send is not attempted; repeat on a phone against the deployed URL (step 10). Record CPU time per send. This step can be moved earlier (right after step 1) if you'd rather settle the biggest risk first.

**Manual check (you):** Open the push form, enable notifications, receive a test push; disable and confirm that no further push arrives.

### Step 12 – Notifications (price and thunder)

**Goal:** push notifications ahead of unusually high or low price periods and ahead of expected thunder.

**Files:** `src/domain/alerts.ts` (+ tests; decides which alerts are due from prices, thunder forecast and "now"), `migrations/0004_notifications_sent.sql` (dedup state), `src/db/notifications.ts`, `src/jobs/sendAlerts.ts`, `wrangler.jsonc` (second cron trigger, e.g. every 15 min), `src/index.ts` (dispatch on `controller.cron`).

**Consequences:** Alerts reuse the same classification and thunder logic as the API, per subscriber zone and rounded location. Dedup state prevents resending the same alert on consecutive ticks. Distinct locations are fetched once each per tick and from the D1 cache, within the subrequest budget. Each push costs CPU (measured in step 11) against the 10 ms budget; for a handful of subscribers that fits (D7). Lead time and which price states trigger an alert are constants you approve.

**Verify:** unit tests on alert decisions (DST days, duplicate suppression, multiple zones/locations); local run with a fake push sender; one real end-to-end price and thunder notification to your device.

**Manual check (you):** Trigger the alert job locally (`curl "localhost:8787/cdn-cgi/local/scheduled?cron=…"`) with a forced price/thunder situation and receive the notification; later, a real one on your phone.

### Step 13 – Hardening and handover

**Goal:** make the service safe to leave running.

**Files:** `src/routes/push.ts` (basic abuse limits on subscribe, e.g. a cap on total subscriptions), `README.md`, this plan (final status).

**Consequences:** Defines behaviour when upstream sources are down (serve last known data, mark it stale in API and UI). Reviews free-tier headroom with real usage. Any rate limiting that needs a new Cloudflare product is brought to you first.

**Verify:** simulate upstream failure locally; review the dashboard after a week of running.

**Manual check (you):** Stop network access for upstreams locally (e.g. a wrong base URL in `.dev.vars`) and confirm the UI marks data as stale instead of failing.

## Risks, highest first

1. **Web Push on Workers** (steps 11, 12): library fit and the 10 ms CPU budget per invocation. Mitigation: spike, measure, keep subscriber count small.
2. ~~**Thunder data availability**~~ resolved in step 7: `probability_of_thunder` covers all of Sweden ~55 hours ahead.
3. **Tuning "relative cheap/expensive"** (step 5): subjective and drives every user-facing feature. Mitigation: tune on real data with you before building on it.
4. **Upstream stability** (steps 3, 7): both sources are free with no SLA. Mitigation: D1 cache, stale-data handling.
5. **Time zones and DST** (steps 2, 12): wrong local-day boundaries silently misplace "tomorrow" or "next 8 hours". Mitigation: pure functions with dedicated DST tests.
6. **Price zones may change** (all steps): Svenska kraftnät's zone review reports on 2027-01-29. Mitigation: the zone list exists in one place in the code (`src/domain/types.ts`), shared by API validation and frontend.
7. **Personal data** (step 11): push endpoints and rounded locations are stored. Mitigation: store the minimum, delete on unsubscribe, say what is stored in the UI.
