/**
 * Limits that keep the Worker within Cloudflare's Free plan. They depend on each other, so they live together.
 * See README "Free-tier limits".
 */

/**
 * Pushes the alert job sends per run. Each push costs a few ms of CPU, and a Free-plan invocation may use 10 ms.
 * Alerts left over are sent on the next run, 5 minutes later.
 */
export const MAX_PUSHES_PER_RUN = 3;

/**
 * Total subscriptions allowed. A price period is first seen at least an hour ahead (`PRICE_ALERT_LEAD_MINUTES`),
 * so at least 11 runs fit before it starts: 11 × MAX_PUSHES_PER_RUN = 33 pushes, which covers this many.
 */
export const MAX_SUBSCRIPTIONS = 25;

/**
 * Expired forecasts refreshed from MET per alert run, oldest first. Each refresh is up to three subrequests and a
 * few ms of CPU to parse. Other positions use their cached forecast until their turn, a few runs later.
 */
export const MAX_FORECAST_REFRESHES_PER_RUN = 2;
