/** Outbound HTTP, shared by all integrations. Injectable so tests can fake upstream APIs. */
export type HttpFetcher = (url: string, init?: RequestInit) => Promise<Response>;
