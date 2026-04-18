/**
 * Fetches latest world population from World Bank API,
 * recalculates all tier populations, creates a snapshot.
 *
 * Usage: npm run update
 *        npm run update -- --dry-run
 *        npm run update -- --check-sources
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  validate,
  recalculatePopulations,
  createSnapshot,
  daysSince,
  type Data,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "data.json");

function parseArgs(args: string[]) {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        parsed[key] = args[i + 1];
        i++;
      } else {
        parsed[key] = "true";
      }
    }
  }
  return parsed;
}

async function fetchWorldPopulation(): Promise<number | null> {
  const url =
    "https://api.worldbank.org/v2/country/WLD/indicator/SP.POP.TOTL?format=json&per_page=5&date=2020:2026";
  try {
    const res = await fetch(url);
    const json = await res.json();
    const records = json[1];
    if (!records?.length) {
      console.error("No population data returned from World Bank API");
      return null;
    }
    for (const record of records) {
      if (record.value !== null) {
        console.log(
          `World Bank: ${record.date} - ${Math.round(record.value).toLocaleString()} people`
        );
        return Math.round(record.value);
      }
    }
    return null;
  } catch (err) {
    console.error("Failed to fetch from World Bank API:", err);
    return null;
  }
}

async function checkSourceUrls(data: Data): Promise<void> {
  console.log("\n--- Source URL Check ---");
  for (const src of data.sources) {
    if (!src.source_url || src.source_url === "https://...") {
      console.log(`  ?? ${src.id}: no URL`);
      continue;
    }
    try {
      const res = await fetch(src.source_url, { method: "HEAD", redirect: "follow" });
      console.log(
        `  ${res.ok ? "ok" : "!!"} ${src.id}: ${res.status} ${src.source_url.slice(0, 60)}...`
      );
    } catch {
      console.log(`  !! ${src.id}: FAILED ${src.source_url.slice(0, 60)}...`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args["dry-run"] === "true";
  const checkSources = args["check-sources"] === "true";

  const data: Data = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  const today = new Date().toISOString().split("T")[0];

  if (checkSources) {
    await checkSourceUrls(data);
    return;
  }

  // Fetch population
  const pop = await fetchWorldPopulation();

  if (pop) {
    const oldPop = data.meta.world_population;
    data.meta.world_population = pop;
    data.meta.population_updated = today;
    data.meta.population_source = "World Bank API";
    recalculatePopulations(data);
    console.log(
      `\nPopulation: ${oldPop.toLocaleString()} -> ${pop.toLocaleString()}`
    );
  } else {
    console.log(
      "\nCould not fetch population, keeping:",
      data.meta.world_population.toLocaleString()
    );
  }

  data.meta.last_updated = today;

  // Staleness check
  console.log("\n--- Staleness ---");
  for (const src of data.sources) {
    const age = daysSince(src.source_date);
    const stale = age > 180;
    if (stale) {
      console.log(`  !! ${src.tool} (${src.id}): ${age}d old`);
    }
  }
  const staleCount = data.sources.filter(
    (s) => daysSince(s.source_date) > 180
  ).length;
  if (staleCount === 0) console.log("  All sources current.");

  // Tier summary
  console.log("\n--- Tiers ---");
  for (const tier of data.tiers) {
    console.log(
      `  ${tier.label}: ${tier.percent}% (~${(tier.population / 1e6).toFixed(0)}M) [${tier.confidence}]`
    );
  }

  // Validate
  const result = validate(data);
  if (!result.valid) {
    console.log("\n--- Validation Errors ---");
    for (const err of result.errors) console.log(`  !! ${err}`);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] No changes written.");
    return;
  }

  // Create snapshot
  const snap = createSnapshot(data);
  const lastSnap = data.snapshots[data.snapshots.length - 1];
  if (!lastSnap || lastSnap.date !== snap.date) {
    data.snapshots.push(snap);
    console.log(`\nSnapshot saved for ${snap.date}.`);
  }

  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log("data.json updated.");
}

main();
