// Prints the price zone guessed for a position, using the same data and code as the frontend.
// Usage: node scripts/guess-zone.mjs <lat> <lon>
import { readFileSync } from "node:fs";
import { guessZone } from "../web/src/lib/zones/guessZone.ts";

const [lat, lon] = process.argv.slice(2).map(Number);
if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
  console.error("Usage: node scripts/guess-zone.mjs <lat> <lon>");
  process.exit(1);
}
const data = JSON.parse(readFileSync(new URL("../web/src/lib/zones/zones.json", import.meta.url), "utf8"));
console.log(guessZone(data, lat, lon) ?? "no zone (outside Sweden or too far from a zone)");
