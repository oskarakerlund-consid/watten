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
});
