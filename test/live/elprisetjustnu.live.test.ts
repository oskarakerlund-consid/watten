import { expect, it } from "vitest";
import { fetchDayPrices } from "../../src/integrations/elprisetjustnu";
import { addDays, stockholmDate, stockholmDayBounds } from "../../src/domain/time";
import { ZONES } from "../../src/domain/types";

it("fetches today's and tomorrow's prices for all zones", async () => {
  const today = stockholmDate(Date.now());
  const rows: string[] = ["zone  day         intervals  min SEK/kWh  max SEK/kWh"];

  for (const zone of ZONES) {
    for (const date of [today, addDays(today, 1)]) {
      const day = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
      const result = await fetchDayPrices((url) => fetch(url), zone, date);
      if (result.status === "not-available") {
        rows.push(`${zone}   ${day}  not published yet`);
        continue;
      }

      const { start, end } = stockholmDayBounds(date);
      expect(result.intervals[0]?.start).toBe(start);
      expect(result.intervals.at(-1)?.end).toBe(end);

      const prices = result.intervals.map((i) => i.sekPerKwh);
      const min = Math.min(...prices).toFixed(3).padStart(11);
      const max = Math.max(...prices).toFixed(3).padStart(11);
      rows.push(`${zone}   ${day}  ${String(result.intervals.length).padStart(9)}  ${min}  ${max}`);
    }
  }

  // console.table is not available in the Workers runtime.
  console.log(rows.join("\n"));
});
