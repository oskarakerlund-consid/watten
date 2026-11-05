/** Outbound HTTP, shared by all integrations. Injectable so tests can fake upstream APIs. */
export type HttpFetcher = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * How long an upstream request may take before it is aborted. Without a limit a hanging upstream would hold the
 * API request (and the user's page) until the platform gives up.
 */
export const UPSTREAM_TIMEOUT_MS = 10_000;

/** A signal that aborts an upstream request after `UPSTREAM_TIMEOUT_MS`. */
export const upstreamTimeout = () => AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
