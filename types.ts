/**
 * Shared types and validation for AI adoption data.
 */

export interface Source {
  id: string;
  tool: string;
  tier_id: string;
  metric: string;
  value: number;
  credibility: 1 | 2 | 3;
  credibility_label: string;
  source: string;
  source_url: string;
  source_date: string;
  notes: string;
}

export interface Tier {
  id: string;
  label: string;
  percent: number;
  population: number;
  color: string;
  confidence: "high" | "medium" | "low";
  derivation: string;
  source_ids: string[];
}

export interface Snapshot {
  date: string;
  world_population: number;
  tiers: Record<string, number>; // tier_id -> percent
}

export interface Data {
  meta: {
    last_updated: string;
    world_population: number;
    population_source: string;
    population_updated: string;
    total_dots: number;
  };
  sources: Source[];
  tiers: Tier[];
  snapshots: Snapshot[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export const CREDIBILITY_LABELS: Record<number, string> = {
  1: "SEC filing / earnings",
  2: "Official announcement",
  3: "Institutional research",
};

export function validate(data: Data): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check tiers sum to ~100%
  const total = data.tiers.reduce((sum, t) => sum + t.percent, 0);
  if (Math.abs(total - 100) > 0.01) {
    errors.push(`Tier percentages sum to ${total.toFixed(4)}%, expected 100%`);
  }

  // Check never_used is the remainder
  const neverUsed = data.tiers.find((t) => t.id === "never_used");
  if (neverUsed) {
    const otherSum = data.tiers
      .filter((t) => t.id !== "never_used")
      .reduce((sum, t) => sum + t.percent, 0);
    const expectedNeverUsed =
      Math.round((100 - otherSum) * 10000) / 10000;
    if (Math.abs(neverUsed.percent - expectedNeverUsed) > 0.01) {
      errors.push(
        `never_used is ${neverUsed.percent}% but should be ${expectedNeverUsed}% (100 - ${otherSum})`
      );
    }
  }

  // Check no credibility-4 sources
  for (const src of data.sources) {
    if ((src.credibility as number) > 3) {
      errors.push(
        `Source "${src.id}" has credibility ${src.credibility} (max allowed is 3)`
      );
    }
    if (src.credibility < 1 || src.credibility > 3) {
      errors.push(
        `Source "${src.id}" has invalid credibility ${src.credibility} (must be 1-3)`
      );
    }
  }

  // Check every tier has at least one credibility-1 or credibility-2 source
  for (const tier of data.tiers) {
    if (tier.id === "never_used") continue;
    const tierSources = data.sources.filter((s) => s.tier_id === tier.id);
    const hasStrongSource = tierSources.some((s) => s.credibility <= 2);
    if (!hasStrongSource) {
      warnings.push(
        `Tier "${tier.id}" has no credibility-1 or credibility-2 source`
      );
    }
    // Check source_ids reference real sources
    for (const sid of tier.source_ids) {
      if (!data.sources.find((s) => s.id === sid)) {
        errors.push(
          `Tier "${tier.id}" references non-existent source "${sid}"`
        );
      }
    }
  }

  // Check source dates parse
  for (const src of data.sources) {
    const d = new Date(src.source_date);
    if (isNaN(d.getTime())) {
      errors.push(`Source "${src.id}" has invalid date "${src.source_date}"`);
    }
  }

  // Check populations match percentages
  for (const tier of data.tiers) {
    const expected = Math.round(
      data.meta.world_population * (tier.percent / 100)
    );
    if (Math.abs(tier.population - expected) > 1) {
      warnings.push(
        `Tier "${tier.id}" population ${tier.population} doesn't match ${tier.percent}% of ${data.meta.world_population} (expected ${expected})`
      );
    }
  }

  // Staleness check
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  for (const src of data.sources) {
    if (new Date(src.source_date) < sixMonthsAgo) {
      warnings.push(
        `Source "${src.id}" is over 6 months old (${src.source_date})`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function recalculatePopulations(data: Data): void {
  for (const tier of data.tiers) {
    tier.population = Math.round(
      data.meta.world_population * (tier.percent / 100)
    );
  }
}

export function recalculateNeverUsed(data: Data): void {
  const neverUsed = data.tiers.find((t) => t.id === "never_used");
  if (!neverUsed) return;
  const otherSum = data.tiers
    .filter((t) => t.id !== "never_used")
    .reduce((sum, t) => sum + t.percent, 0);
  neverUsed.percent = Math.round((100 - otherSum) * 10000) / 10000;
}

export function createSnapshot(data: Data): Snapshot {
  const tierMap: Record<string, number> = {};
  for (const tier of data.tiers) {
    tierMap[tier.id] = tier.percent;
  }
  return {
    date: new Date().toISOString().split("T")[0],
    world_population: data.meta.world_population,
    tiers: tierMap,
  };
}

export function daysSince(dateStr: string): number {
  return Math.round(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
}
