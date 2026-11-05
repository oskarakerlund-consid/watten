import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { saveSubscription, type StoredSubscription } from "./subscriptions";

const subscription = (zone: StoredSubscription["zone"]): StoredSubscription => ({
  endpoint: "https://fcm.googleapis.com/fcm/send/1",
  keys: { p256dh: "p", auth: "a" },
  zone,
  position: null,
});

/** `env.DB`, but another request stores `concurrent` just before the insert of a new subscription runs. */
function racingDb(concurrent: StoredSubscription): D1Database {
  return new Proxy(env.DB, {
    get(target, property) {
      if (property === "prepare") {
        return (sql: string) => {
          const statement = target.prepare(sql);
          if (!sql.trimStart().startsWith("INSERT INTO push_subscriptions")) return statement;
          return {
            bind: (...values: unknown[]) => ({
              run: async () => {
                await saveSubscription(env.DB, concurrent, 0, 100);
                return statement.bind(...values).run();
              },
            }),
          };
        };
      }
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

beforeEach(async () => {
  await env.DB.exec("DELETE FROM push_subscriptions");
});

describe("saveSubscription", () => {
  it("updates instead of reporting full when the same endpoint is stored concurrently", async () => {
    expect(await saveSubscription(racingDb(subscription("SE1")), subscription("SE3"), 0, 100)).toBe("updated");
    const row = await env.DB.prepare("SELECT zone FROM push_subscriptions").first<{ zone: string }>();
    expect(row?.zone).toBe("SE3");
  });

  it("reports full when the limit is reached", async () => {
    expect(await saveSubscription(env.DB, subscription("SE3"), 0, 0)).toBe("full");
  });
});
