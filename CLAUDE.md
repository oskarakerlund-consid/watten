# Watten

A service that helps the user keep track of electricity prices and thunderstorms.

## What the project does

- Identifies unusually high and low electricity prices and sends notifications ahead of such periods.
- Warns about expected thunderstorms.
- Exposes an API that can, among other things, answer which timespan is cheapest in the near future.
- Enables Web Push notifications for subscribing users.
- Provides a frontend that shows the status for the near future: whether the current electricity price is cheap or expensive, and whether it is about to change significantly. Color is used to convey the status (e.g. a red background when expensive). The frontend must never contain secrets and gets its data from the API.

## Tech stack

Decided:

- **TypeScript** – type safety and good developer experience.
- **Cloudflare Workers** – serverless execution of API and business logic.
- **Hono** – API routing.
- **Cloudflare D1** – persistent storage when needed (e.g. push subscriptions).
- **Cloudflare Cron Triggers** – scheduled checks of prices and weather.
- **Web Push + VAPID** – notifications without a separate paid push provider. Must run on Workers (Web Crypto, no Node-only libraries).
- **Svelte + Vite** – frontend, built as a static SPA (not SvelteKit). The user wants to learn Svelte, so keep the code idiomatic and simple.
- **Vitest** – automated tests.
- **Wrangler** – local development and deployment.

Everything (API, frontend, storage, scheduling) runs on Cloudflare. Frontend hosting: assume Workers static assets for now (served by the same Worker as the API). This is a provisional choice, not final; verify free-tier limits and ask before building anything that depends on it, and before switching to Pages.

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
