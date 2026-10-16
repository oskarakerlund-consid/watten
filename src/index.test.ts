import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("responds with status ok", async () => {
    const response = await exports.default.fetch("https://example.com/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns 404 for unknown routes", async () => {
    const response = await exports.default.fetch("https://example.com/api/unknown");

    expect(response.status).toBe(404);
  });

  it.each(["/api/health", "/api/unknown", "/api/status"])("sets security headers on %s", async (path) => {
    const response = await exports.default.fetch(`https://example.com${path}`);

    expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
});
