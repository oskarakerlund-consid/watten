import { env } from "cloudflare:workers";
import { it } from "vitest";
import { parseConfig } from "../../src/config";
import { type ClassificationSettings, classifyPrice } from "../../src/domain/classify";
import { addDays, HOUR_MS, stockholmDate } from "../../src/domain/time";
import { type PriceInterval, ZONES } from "../../src/domain/types";
import { fetchDayPrices } from "../../src/integrations/elprisetjustnu";

const fmt = (sek: number) => (sek * 100).toFixed(0).padStart(5);

it("shows the price classification for all zones", async () => {
  const config = parseConfig(env);
  const now = Date.now();
  const today = stockholmDate(now);
  const variants: [string, ClassificationSettings][] = [
    [`configured (${config.minPriceDiffSekPerKwh * 100} öre, ${config.priceDiffPercent} %)`, config],
    ["percent only, 20 %", { ...config, minPriceDiffSekPerKwh: 0, priceDiffPercent: 20 }],
    ["percent only, 30 %", { ...config, minPriceDiffSekPerKwh: 0, priceDiffPercent: 30 }],
    ["50 öre or 20 %", { ...config, minPriceDiffSekPerKwh: 0.5, priceDiffPercent: 20 }],
  ];

  const lines = [`Average window: ${config.averageWindowHours} h. Prices in öre/kWh, excl. VAT.`, ""];
  for (const zone of ZONES) {
    const intervals: PriceInterval[] = [];
    for (let d = -Math.ceil(config.averageWindowHours / 24) - 1; d <= 1; d++) {
      const result = await fetchDayPrices((url) => fetch(url), zone, addDays(today, d));
      if (result.status === "ok") intervals.push(...result.intervals);
    }

    const status = classifyPrice(intervals, now, config);
    lines.push(
      status
        ? `${zone} now: ${status.level.padEnd(9)} next hour ${fmt(status.currentSekPerKwh)}  average ${fmt(status.averageSekPerKwh)}  threshold ±${fmt(status.thresholdSekPerKwh).trim()}`
        : `${zone} now: not enough data`,
    );

    // Classify every quarter-hour from 24 h ago to the last hour with known prices.
    for (const [name, settings] of variants) {
      const counts = { cheap: 0, normal: 0, expensive: 0 };
      for (let t = now - 24 * HOUR_MS; ; t += HOUR_MS / 4) {
        const s = classifyPrice(intervals, t, settings);
        if (!s) break;
        counts[s.level]++;
      }
      const total = counts.cheap + counts.normal + counts.expensive;
      const pct = (n: number) => `${Math.round((100 * n) / total)} %`.padStart(5);
      lines.push(`    ${name.padEnd(32)} cheap ${pct(counts.cheap)}  normal ${pct(counts.normal)}  expensive ${pct(counts.expensive)}`);
    }
    lines.push("");
  }
  console.log(lines.join("\n"));
});
