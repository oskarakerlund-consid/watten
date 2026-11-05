import { env } from "cloudflare:workers";

/** `env.DB`, except that statements whose SQL starts with `sqlPrefix` fail when they are run. */
export function failingDb(sqlPrefix: string): D1Database {
  const fail = () => Promise.reject(new Error("D1 is unavailable"));
  const failing = { run: fail, all: fail, first: fail, raw: fail };
  return new Proxy(env.DB, {
    get(target, property) {
      if (property === "prepare") {
        return (sql: string) => (sql.trimStart().startsWith(sqlPrefix) ? { ...failing, bind: () => failing } : target.prepare(sql));
      }
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
