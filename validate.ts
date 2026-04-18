/**
 * Validate data.json integrity.
 * Usage: npm run validate
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { validate, type Data } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "data.json");

const data: Data = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
const result = validate(data);

console.log("=== Data Validation Report ===\n");

if (result.errors.length > 0) {
  console.log("ERRORS:");
  for (const err of result.errors) {
    console.log(`  !! ${err}`);
  }
  console.log();
}

if (result.warnings.length > 0) {
  console.log("WARNINGS:");
  for (const warn of result.warnings) {
    console.log(`  -- ${warn}`);
  }
  console.log();
}

// Summary table
console.log("TIERS:");
for (const tier of data.tiers) {
  const sources = data.sources.filter((s) => s.tier_id === tier.id);
  const bestCred = sources.length > 0 ? Math.min(...sources.map((s) => s.credibility)) : 0;
  console.log(
    `  ${tier.id}: ${tier.percent}% (~${(tier.population / 1e6).toFixed(0)}M) | confidence: ${tier.confidence} | best source: credibility-${bestCred} | ${sources.length} sources`
  );
}

console.log(`\nSOURCES: ${data.sources.length} total`);
console.log(`  Credibility 1 (SEC/earnings): ${data.sources.filter((s) => s.credibility === 1).length}`);
console.log(`  Credibility 2 (official): ${data.sources.filter((s) => s.credibility === 2).length}`);
console.log(`  Credibility 3 (institutional): ${data.sources.filter((s) => s.credibility === 3).length}`);

console.log(`\nSNAPSHOTS: ${data.snapshots.length}`);

console.log(`\nResult: ${result.valid ? "PASS" : "FAIL"}`);
process.exit(result.valid ? 0 : 1);
