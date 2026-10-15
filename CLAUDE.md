# Watten

A service that helps the user keep track of electricity prices and thunderstorms.

Anyone in Sweden may use and subscribe, but the expected audience is a handful of people. This is a tech demo, not a commercial product; do not design for scale beyond that.

## What the project does

- Identifies unusually high and low electricity prices and sends notifications ahead of such periods.
- Warns about expected thunderstorms (the purpose is to avoid using electrical equipment or charging an EV during them).
- Enables Web Push notifications for subscribing users.

### API

JSON, read-only for price/thunder data. Parameters are validated and bounded.

- **Price status:** is the current price (and the next hour) relatively cheap, normal or expensive. Parameter: price area (`SE1`–`SE4`).
- **Cheapest interval:** the cheapest interval of N hours within the next P hours. Parameters: price area, interval length (default 2 h), period length (default 8 h).
- **Thunder:** whether thunder is expected, and roughly when. Parameters: location, and number of hours ahead (default 8, with a reasonable maximum). This is a forecast, not observed lightning strikes.

### Price classification

"Cheap", "normal" and "expensive" are relative to the average price over the recent past. The definition lives in one place in the code.

### Frontend

A Svelte SPA that gives a quick overview **without scrolling, including on a phone**. It shows:

- Page background color indicating whether the current price (and the next hour) is relatively cheap, normal or expensive (e.g. red when expensive). Color is always paired with text or a symbol.
- The start time of the cheapest 2-hour interval within the next 8 hours.
- Whether thunder is expected within the next 8 hours and, if so, approximately when.
- Location and zone: if no position is stored, the frontend shows a button that requests the browser position (never on page load). The position is stored rounded in `localStorage`, and the price zone is guessed from it (bundled, simplified zone polygons; no confirmation required). The user can afterwards change the zone manually and reload the GPS position; reloading re-guesses the zone. Both choices are stored in `localStorage`. The position is sent as parameters to the thunder endpoint.
- A form that can be opened to enable or disable push notifications.

The frontend must never contain secrets and gets all data from the API.

## Tech stack

Decided:

- **TypeScript** – type safety and good developer experience.
- **Cloudflare Workers** – serverless execution of API and business logic.
- **Hono** – API routing.
- **Cloudflare D1** – persistent storage when needed (e.g. push subscriptions).
- **Cloudflare Cron Triggers** – scheduled checks of prices and weather.
- **Web Push + VAPID** – notifications without a separate paid push provider. Must run on Workers (Web Crypto, no Node-only libraries).
- **Svelte + Vite** – frontend, built as a static SPA (not SvelteKit). The user wants to learn Svelte, so keep the code idiomatic and simple.
- **Zod** – validation of external data and request parameters (with `@hono/zod-validator`).
- **Vitest** – automated tests.
- **Wrangler** – local development and deployment.

Everything (API, frontend, storage, scheduling) runs on Cloudflare. Frontend hosting: **Workers static assets**, served by the same Worker as the API (one deploy, one origin, no CORS). Only the Worker runs first for `/api/*`; everything else is served as free static assets. Do not switch to Pages without asking.

Goal: keep running costs at 0 SEK within Cloudflare's free tiers, as far as possible. Solutions that require paid services are not allowed.

Data sources:

- **Weather:** MET Norway (api.met.no). Requires an identifying `User-Agent`, caching per `Expires`/`If-Modified-Since`, coordinates truncated to 4 decimals, and CC BY 4.0 attribution.
- **Electricity prices:** Elpriset just nu (elprisetjustnu.se/elpris-api). Free, no API key. One request per day and price area: `/api/v1/prices/{YYYY}/{MM}-{DD}_{SE1..SE4}.json`. Fields: `SEK_per_kWh`, `EUR_per_kWh`, `EXR`, `time_start`, `time_end`. Prices are 15-minute intervals from 2025-10-01 (aggregate to hours when hourly values are needed) and exclude VAT, surcharges and taxes. Next-day prices are published no earlier than 13:00 on the day before. Attribution is requested when shown publicly. No documented rate limit; cache responses.

Anything not listed here is **not yet decided**. Do not assume any particular choice; ask first.

## Architecture principles

- Keep the solution simple and avoid unnecessary complexity.
- Separate API routing, business logic and integrations with external data sources.
- Give each function a clear responsibility.
- Avoid global mutable state.
- Keep network calls and database access in clear integration layers.
- Write testable business logic with as few side effects as possible.
- Use strict TypeScript and validate data from external APIs.
- Handle time, time zones and daylight saving time correctly.

## Rules for the AI agent

- Do not choose or change the tech stack or database without asking first.
- Do not add external dependencies without asking first.
- Do not introduce paid services without approval.
- Do not invent features, APIs or data sources. Verify them before implementing.
- Do not add functionality that has not been requested.
- Avoid unnecessary abstractions and refactoring.
- Never expose secrets in code or frontend.
- Run relevant tests and type checks after changes.
- The project scope is not final. Do not anticipate future decisions, and ask before making major architectural decisions not covered by this document.
