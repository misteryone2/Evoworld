/**
 * E1.3 — confronto tra risultati E1.2 (pre-correzione) ed E1.3 (post-correzione).
 *
 * Uso:
 *   E1_COMPARE_BEFORE=<baseline.json> E1_COMPARE_AFTER=<updated.json> \
 *   E1_COMPARE_OUT=docs/research/e1/datasets/e1-phase2-comparison.json \
 *   npx vitest run --config vitest.experiment.config.ts scripts/e1_compare.experiment.ts
 *
 * Lo script fallisce se qualsiasi campo non spaziale differisce.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { it } from "vitest";
import { compareRunResults, type ComparisonReport } from "../tools/e1/comparison";
import { stableStringify } from "../tools/e1/dataset";
import type { RunResult } from "../tools/e1/runner";

function load(path: string | undefined, label: string): { results: RunResult[]; report: unknown } {
  if (!path) throw new Error(`${label} mancante (E1_COMPARE_BEFORE / E1_COMPARE_AFTER)`);
  const parsed = JSON.parse(readFileSync(resolve(path), "utf8")) as { results: RunResult[]; scientificReport: unknown };
  if (!Array.isArray(parsed.results)) throw new Error(`${label}: results non valido`);
  return { results: parsed.results, report: parsed.scientificReport };
}

it("E1.3 — confronto prima/dopo", () => {
  const before = load(process.env.E1_COMPARE_BEFORE, "E1_COMPARE_BEFORE");
  const after = load(process.env.E1_COMPARE_AFTER, "E1_COMPARE_AFTER");
  const comparison: ComparisonReport = compareRunResults(before.results, after.results);

  // Le statistiche descrittive non spaziali devono essere identiche: solo i
  // campi spaziali e i nuovi confronti appaiati possono differire nel report.
  const reportSummary = (value: unknown): Record<string, unknown> => {
    const r = value as { byScenario?: Record<string, { finalPopulation: unknown; extinction: unknown; speciation: unknown }> };
    return r?.byScenario ?? {};
  };
  const descriptiveBefore = stableStringify(reportSummary(before.report));
  const descriptiveAfter = stableStringify(reportSummary(after.report));
  const descriptiveIdentical = descriptiveBefore === descriptiveAfter;

  const out = process.env.E1_COMPARE_OUT ?? "docs/research/e1/datasets/e1-phase2-comparison.json";
  const output = {
    phase: "E1.3",
    schema: "evoworld.e1.comparison.v1",
    beforeRuns: comparison.beforeRuns,
    afterRuns: comparison.afterRuns,
    matchedRuns: comparison.matchedRuns,
    comparedSamples: comparison.comparedSamples,
    biologicalInvariance: comparison.biologicalInvariance,
    descriptiveStatisticsIdentical: descriptiveIdentical,
    nonSpatialMismatches: comparison.nonSpatialMismatches,
    missingInAfter: comparison.missingInAfter,
    extraInAfter: comparison.extraInAfter,
    spatial: comparison.spatial,
    spatialChangesFound: comparison.spatialChangesFound,
    note:
      "Confronto tra output ottenuti con gli stessi 12 seed e parametri. " +
      "Solo i campi spaziali possono cambiare: popolazioni, nascite, mortalita', " +
      "predazione, tassi, specie e genetica devono essere identici.",
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(output, null, 2) + "\n", "utf8");

  console.log(`runs ${comparison.beforeRuns} -> ${comparison.afterRuns}, matched ${comparison.matchedRuns}`);
  console.log(`biologicalInvariance=${comparison.biologicalInvariance}`);
  console.log(`descriptiveStatisticsIdentical=${descriptiveIdentical}`);
  for (const s of comparison.spatial) {
    console.log(`${s.field}: runs=${s.changedRuns} samples=${s.changedSamples}/${s.comparedSamples} maxDelta=${s.maxAbsDelta}`);
  }
  console.log(`E1_COMPARE_OUT=${out}`);

  if (!comparison.biologicalInvariance || !descriptiveIdentical) {
    throw new Error("E1.3: differenze non spaziali rilevate tra prima e dopo la correzione");
  }
}, 3_000_000);
