# Watten

Watten is a small serverless service that helps you decide when to use electricity in Sweden. It shows whether the current electricity price is relatively cheap or expensive, when the cheapest upcoming hours are, and whether thunder is expected, so you can avoid using sensitive equipment or charging an EV during a thunderstorm. Users can subscribe to Web Push notifications.

> **Status:** early development, tech demo, not a commercial product. Only the project scaffold exists so far; the features below are planned. See [`docs/PLAN.md`](docs/PLAN.md) for the implementation plan.

## How it works

_Planned._ A single-screen web app backed by a JSON API:

- **Price status** per price area (`SE1`–`SE4`): cheap, normal or expensive, relative to the recent average.
- **Cheapest interval:** the cheapest N-hour interval within the next P hours.
- **Thunder forecast** for a position, a number of hours ahead.
- **Push notifications** ahead of unusually high or low prices and expected thunder.

Currently implemented endpoints:

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Returns `{ "status": "ok" }`. |

## Architecture

Everything runs on Cloudflare's free tier:

- A single **Cloudflare Worker** written in TypeScript, with [Hono](https://hono.dev/) for API routing.
- _Planned:_ Cloudflare D1 for storage, Cron Triggers for scheduled price and weather checks, a Svelte SPA served as Workers static assets from the same Worker, and Web Push with VAPID.

Code layout under `src/`:

| Directory | Responsibility |
| --- | --- |
| `src/index.ts` | Worker entry point and route mounting. |
| `src/routes/` | _Planned:_ HTTP routes (Hono). |
| `src/domain/` | Pure business logic, no I/O: zones, Swedish time and DST, time-weighted price averages, cheapest-window search. |
| `src/integrations/` | _Planned:_ calls to external data sources. |
| `src/db/` | _Planned:_ D1 access. |

## Third-party data and dependencies

### Data sources

_Planned, not used yet:_

- [Elpriset just nu](https://www.elprisetjustnu.se/elpris-api) – electricity prices.
- [MET Norway](https://api.met.no/) – weather forecasts (CC BY 4.0).

### Dependencies

| Package | Kind | Why | License |
| --- | --- | --- | --- |
| [`hono`](https://github.com/honojs/hono) | runtime | API routing in the Worker | MIT |
| [`wrangler`](https://github.com/cloudflare/workers-sdk) | dev | Local development, type generation and deployment | MIT OR Apache-2.0 |
| [`typescript`](https://github.com/microsoft/TypeScript) | dev | Type checking | Apache-2.0 |
| [`vitest`](https://github.com/vitest-dev/vitest) | dev | Test runner | MIT |
| [`@cloudflare/vitest-plugin`](https://github.com/cloudflare/workers-sdk) | dev | Runs tests inside the Workers runtime | MIT |

## Free-tier limits

_To be documented as features that depend on them are added._

## Getting started

Prerequisites: Node.js 24 and npm.

```sh
npm install
npm run dev        # starts the Worker locally on http://localhost:8787
npm test           # runs the tests in the Workers runtime
npm run typecheck  # generates Worker types and runs the TypeScript compiler
```

Local secrets go in `.dev.vars` (git-ignored); see `.dev.vars.example`. None are needed yet.

## Configuration

_None yet._

## Deployment

_To be documented._

## Privacy

_To be documented._ No personal data is stored yet.

## License

[MIT](LICENSE).
