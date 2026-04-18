/**
 * Update tiers and manage sources.
 *
 * Usage:
 *   npm run set-tier -- --list
 *   npm run set-tier -- --id free_chatbot --percent 18 --source "Similarweb Q2 2026" --date 2026-07-01
 *   npm run set-tier -- --id paid_subscriber --percent 0.4 --dry-run
 *   npm run set-tier -- --add-source --tool "Cursor" --tier coding_scaffold --metric MAU --value 7000000 --credibility 2 --source "Company blog" --date 2026-03-01
 *   npm run set-tier -- --remove-source --sid cursor-old-id
 *   npm run set-tier -- --history
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  validate,
  recalculatePopulations,
  recalculateNeverUsed,
  createSnapshot,
  daysSince,
  CREDIBILITY_LABELS,
  type Data,
  type Source,
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const data: Data = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  const dryRun = args["dry-run"] === "true";

  // --- List mode ---
  if (args.list) {
    console.log("=== Current Tiers ===\n");
    for (const tier of data.tiers) {
      const sources = data.sources.filter((s) => s.tier_id === tier.id);
      console.log(`${tier.id} - ${tier.label}`);
      console.log(`  ${tier.percent}% (~${(tier.population / 1e6).toFixed(0)}M) | confidence: ${tier.confidence}`);
      console.log(`  Derivation: ${tier.derivation}`);
      if (sources.length > 0) {
        console.log(`  Sources (${sources.length}):`);
        for (const s of sources) {
          const age = daysSince(s.source_date);
          console.log(
            `    [C${s.credibility}] ${s.tool}: ${typeof s.value === "number" && s.value > 1000 ? s.value.toLocaleString() : s.value} (${s.metric}) - ${s.source_date} (${age}d ago)`
          );
        }
      }
      console.log();
    }
    return;
  }

  // --- History mode ---
  if (args.history) {
    console.log("=== Snapshots ===\n");
    if (data.snapshots.length === 0) {
      console.log("  No snapshots yet.");
      return;
    }
    for (const snap of data.snapshots) {
      console.log(`${snap.date} (pop: ${snap.world_population.toLocaleString()})`);
      for (const [id, pct] of Object.entries(snap.tiers)) {
        console.log(`  ${id}: ${pct}%`);
      }
      console.log();
    }
    return;
  }

  // --- Add source mode ---
  if (args["add-source"]) {
    if (!args.tool || !args.tier || !args.value || !args.credibility || !args.source) {
      console.log("Usage: --add-source --tool <name> --tier <tier_id> --metric <type> --value <num> --credibility <1-3> --source <text> [--date <YYYY-MM-DD>] [--url <url>] [--notes <text>]");
      return;
    }
    const cred = parseInt(args.credibility);
    if (cred < 1 || cred > 3) {
      console.error("Credibility must be 1-3. (4+ = industry estimates, not allowed)");
      process.exit(1);
    }
    const id = `${args.tool.toLowerCase().replace(/\s+/g, "-")}-${args.metric || "metric"}-${Date.now().toString(36)}`;
    const newSource: Source = {
      id,
      tool: args.tool,
      tier_id: args.tier,
      metric: args.metric || "unknown",
      value: parseFloat(args.value),
      credibility: cred as 1 | 2 | 3,
      credibility_label: CREDIBILITY_LABELS[cred],
      source: args.source,
      source_url: args.url || "",
      source_date: args.date || new Date().toISOString().split("T")[0],
      notes: args.notes || "",
    };

    console.log(`Adding source: ${id}`);
    console.log(`  Tool: ${newSource.tool} | Tier: ${newSource.tier_id}`);
    console.log(`  Value: ${newSource.value.toLocaleString()} (${newSource.metric})`);
    console.log(`  Credibility: ${cred} (${CREDIBILITY_LABELS[cred]})`);
    console.log(`  Source: ${newSource.source} (${newSource.source_date})`);

    if (dryRun) {
      console.log("\n[DRY RUN] No changes written.");
      return;
    }

    data.sources.push(newSource);
    // Add to tier's source_ids
    const tier = data.tiers.find((t) => t.id === args.tier);
    if (tier && !tier.source_ids.includes(id)) {
      tier.source_ids.push(id);
    }
    data.meta.last_updated = new Date().toISOString().split("T")[0];
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
    console.log("\nSource added.");
    return;
  }

  // --- Remove source mode ---
  if (args["remove-source"]) {
    const sid = args.sid;
    if (!sid) {
      console.log("Usage: --remove-source --sid <source_id>");
      return;
    }
    const idx = data.sources.findIndex((s) => s.id === sid);
    if (idx === -1) {
      console.error(`Source "${sid}" not found.`);
      process.exit(1);
    }
    console.log(`Removing source: ${sid} (${data.sources[idx].tool})`);
    if (dryRun) {
      console.log("\n[DRY RUN] No changes written.");
      return;
    }
    data.sources.splice(idx, 1);
    for (const tier of data.tiers) {
      tier.source_ids = tier.source_ids.filter((id) => id !== sid);
    }
    data.meta.last_updated = new Date().toISOString().split("T")[0];
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
    console.log("Source removed.");
    return;
  }

  // --- Update tier mode ---
  if (!args.id) {
    console.log("Usage:");
    console.log("  --list                          Show all tiers and sources");
    console.log("  --history                       Show snapshots timeline");
    console.log("  --id <tier> --percent <n>       Update a tier's percentage");
    console.log("  --add-source --tool <n> ...     Add a new source");
    console.log("  --remove-source --sid <id>      Remove a source");
    console.log("\nFlags: --dry-run, --snapshot");
    console.log("\nTier IDs:", data.tiers.map((t) => t.id).join(", "));
    return;
  }

  const tier = data.tiers.find((t) => t.id === args.id);
  if (!tier) {
    console.error(
      `Tier "${args.id}" not found. Available:`,
      data.tiers.map((t) => t.id).join(", ")
    );
    process.exit(1);
  }

  // Snapshot before changing
  if (args.snapshot) {
    data.snapshots.push(createSnapshot(data));
    console.log("Snapshot saved.");
  }

  const oldPercent = tier.percent;

  if (args.percent) {
    const pct = parseFloat(args.percent);
    if (pct < 0 || pct > 100) {
      console.error("Percent must be between 0 and 100.");
      process.exit(1);
    }
    tier.percent = pct;
  }
  if (args.confidence) {
    if (!["high", "medium", "low"].includes(args.confidence)) {
      console.error("Confidence must be high, medium, or low.");
      process.exit(1);
    }
    tier.confidence = args.confidence as "high" | "medium" | "low";
  }
  if (args.derivation) tier.derivation = args.derivation;

  // Recalculate never_used and populations
  if (args.id !== "never_used") {
    recalculateNeverUsed(data);
  }
  recalculatePopulations(data);

  data.meta.last_updated = new Date().toISOString().split("T")[0];

  // Validate
  const result = validate(data);
  if (!result.valid) {
    console.log("Validation errors:");
    for (const err of result.errors) console.log(`  !! ${err}`);
    if (!dryRun) {
      console.log("Aborting - fix errors first.");
      process.exit(1);
    }
  }

  console.log(`Updated ${tier.id}:`);
  console.log(`  Percent: ${oldPercent}% -> ${tier.percent}%`);
  console.log(`  Population: ~${(tier.population / 1e6).toFixed(0)}M`);

  const neverUsed = data.tiers.find((t) => t.id === "never_used");
  if (neverUsed && args.id !== "never_used") {
    console.log(`  (never_used auto-adjusted to ${neverUsed.percent}%)`);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] No changes written.");
    return;
  }

  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log("\ndata.json updated.");
}

main();
