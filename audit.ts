/**
 * Source credibility audit report.
 * Usage: npm run audit
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { daysSince, CREDIBILITY_LABELS, type Data } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data: Data = JSON.parse(
  readFileSync(join(__dirname, "data.json"), "utf-8")
);

console.log("=== Source Credibility Audit ===\n");
console.log(`World population: ${data.meta.world_population.toLocaleString()} (${data.meta.population_source}, ${data.meta.population_updated})\n`);

// Group by credibility
for (const cred of [1, 2, 3] as const) {
  const sources = data.sources.filter((s) => s.credibility === cred);
  if (sources.length === 0) continue;

  console.log(`--- Credibility ${cred}: ${CREDIBILITY_LABELS[cred]} (${sources.length} sources) ---`);
  for (const src of sources) {
    const age = daysSince(src.source_date);
    const stale = age > 180;
    console.log(`  ${stale ? "!!" : "ok"} [${src.tier_id}] ${src.tool}: ${typeof src.value === "number" && src.value > 1000 ? src.value.toLocaleString() : src.value} (${src.metric})`);
    console.log(`     ${src.source} | ${src.source_date} (${age}d ago)`);
  }
  console.log();
}

// Per-tier summary
console.log("--- Per-Tier Source Quality ---");
for (const tier of data.tiers) {
  const sources = data.sources.filter((s) => s.tier_id === tier.id);
  const credCounts = { 1: 0, 2: 0, 3: 0 };
  for (const s of sources) credCounts[s.credibility]++;
  const oldest = sources.length > 0
    ? Math.max(...sources.map((s) => daysSince(s.source_date)))
    : 0;
  const hasStrong = credCounts[1] > 0 || credCounts[2] > 0;

  console.log(
    `  ${hasStrong ? "ok" : "!!"} ${tier.label} (${tier.percent}%): ${sources.length} sources [C1:${credCounts[1]} C2:${credCounts[2]} C3:${credCounts[3]}] | oldest: ${oldest}d`
  );
}

// Staleness report
console.log("\n--- Stale Sources (>180 days) ---");
const staleSources = data.sources.filter((s) => daysSince(s.source_date) > 180);
if (staleSources.length === 0) {
  console.log("  None - all sources are current.");
} else {
  for (const src of staleSources) {
    console.log(
      `  !! ${src.tool} (${src.id}): ${daysSince(src.source_date)}d old - ${src.source}`
    );
  }
}

console.log("\nDone.");
