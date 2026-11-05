import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStatus, fetchThunder, removeSubscription } from "./api";

/** Makes `fetch` answer with `respond()`. */
const stubFetch = (respond: () => Promise<Response>) => vi.stubGlobal("fetch", vi.fn(respond));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API client", () => {
  it("returns the data", async () => {
    stubFetch(async () => Response.json({ level: "cheap" }));
    expect(await fetchStatus("SE3")).toEqual({ ok: true, data: { level: "cheap" } });
  });

  it("tells a failed request from an unexpected response", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await fetchStatus("SE3")).toMatchObject({ ok: false, message: expect.stringContaining("internetanslutning") });

    stubFetch(async () => new Response("<html>"));
    expect(await fetchStatus("SE3")).toMatchObject({ ok: false, message: expect.stringContaining("oväntat svar") });
  });

  it("explains errors per endpoint", async () => {
    stubFetch(async () => Response.json({ error: "Prices for SE3 are not available yet" }, { status: 503 }));
    expect(await fetchStatus("SE3")).toEqual({ ok: false, message: "Priserna för SE3 är inte hämtade än. Försök igen om en stund." });
    expect(await fetchThunder(59.33, 18.07, 8)).toMatchObject({ message: expect.stringContaining("Åskprognosen kunde inte hämtas") });

    stubFetch(async () => Response.json({ error: "Internal error" }, { status: 500 }));
    expect(await fetchStatus("SE3")).toEqual({ ok: false, message: "Något gick fel. Försök igen om en stund." });
  });

  it("returns null for an empty response", async () => {
    stubFetch(async () => new Response(null, { status: 204 }));
    expect(await removeSubscription("https://fcm.googleapis.com/fcm/send/1")).toEqual({ ok: true, data: null });
  });
});
