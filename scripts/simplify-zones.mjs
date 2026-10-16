// Simplifies the Swedish price-zone polygons from entsoe-py into a small JSON file for the frontend.
// Usage: node scripts/simplify-zones.mjs <dir with SE_1..SE_4.geojson> <entsoe-py commit> [tolerance km]
// See README, "Price-zone data".
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { simplifyZone } from "./simplifyGeometry.ts";

const OUTPUT = "web/src/lib/zones/zones.json";
const DECIMALS = 3;

const [sourceDir, commit, toleranceArg = "1"] = process.argv.slice(2);
if (!sourceDir || !commit) {
  console.error("Usage: node scripts/simplify-zones.mjs <source dir> <entsoe-py commit> [tolerance km]");
  process.exit(1);
}
const toleranceKm = Number(toleranceArg);

const zones = {};
for (const n of [1, 2, 3, 4]) {
  const geojson = JSON.parse(readFileSync(join(sourceDir, `SE_${n}.geojson`), "utf8"));
  zones[`SE${n}`] = simplifyZone(geojson, toleranceKm, DECIMALS);
}

const output = {
  source: `https://github.com/EnergieID/entsoe-py/tree/${commit}/entsoe/geo/geojson`,
  license: "MIT, see LICENSE-entsoe-py",
  toleranceKm,
  decimals: DECIMALS,
  zones,
};
writeFileSync(OUTPUT, JSON.stringify(output) + "\n");

const points = Object.values(zones).flat().reduce((sum, ring) => sum + ring.length, 0);
console.log(`Wrote ${OUTPUT}: ${points} points, ${JSON.stringify(output).length} bytes`);
