import { describe, expect, it } from "vitest";
import { trackLatest } from "./latest";

/** A promise that the test resolves by hand, to control the order responses arrive in. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("trackLatest", () => {
  it("lets a call apply its result when no newer call has started", () => {
    const start = trackLatest();
    const isLatest = start();
    expect(isLatest()).toBe(true);
  });

  it("marks an older call as outdated once a newer one starts", () => {
    const start = trackLatest();
    const first = start();
    const second = start();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it("keeps the newest result when an older response arrives last", async () => {
    const start = trackLatest();
    let shown: string | null = null;
    const load = async (response: Promise<string>) => {
      const isLatest = start();
      const value = await response;
      if (isLatest()) shown = value;
    };

    const old = deferred<string>();
    const fresh = deferred<string>();
    const oldLoad = load(old.promise);
    const freshLoad = load(fresh.promise);

    fresh.resolve("SE4");
    await freshLoad;
    old.resolve("SE3");
    await oldLoad;

    expect(shown).toBe("SE4");
  });

  it("tracks separate trackers independently", () => {
    const a = trackLatest();
    const b = trackLatest();
    const fromA = a();
    b();
    expect(fromA()).toBe(true);
  });
});
