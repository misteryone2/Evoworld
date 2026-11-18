/** E2.2 — aggregazione della sensibilità a seed, durata e frequenza di campionamento. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { resolveOutputPath, writeExperimentOutput } from "../tools/e1/experiment";
import type { RunResult } from "../tools/e1/runner";
import {
  analyzeCompositionCoupling,
  buildFoodWebReport,
  type FoodWebProtocol,
  type FoodWebScenarioReport,
} from "../tools/e2/foodWebReport";
import { resampleResult, truncateResult } from "../tools/e2/trophic";

interface BlockPayload {
  schema: string;
  label: string;
  env: { SEEDS: number[]; TICKS: number; SAMPLE_EVERY: number; MAX_LAG: number; SCENARIOS: string[] };
  protocol: FoodWebProtocol;
  scientificReport: { byScenario: FoodWebScenarioReport[] };
  results: RunResult[];
}

const readBlock = (value: string | undefined, name: string): { payload: BlockPayload; sha256: string } => {
  if (!value) throw new Error(`${name} is required`);
  const text = readFileSync(resolveOutputPath(value), "utf8");
  const payload = JSON.parse(text) as BlockPayload;
  if (payload.schema !== "evoworld.e2.foodweb-block.v1" || !Array.isArray(payload.results)) {
    throw new Error(`${name} must be an E2.2 food-web block payload`);
  }
  return { payload, sha256: createHash("sha256").update(text).digest("hex") };
};

const scenarioReport = (block: BlockPayload, scenario: string): FoodWebScenarioReport | undefined =>
  block.scientificReport.byScenario.find((entry) => entry.scenario === scenario);

interface MetricRow {
  killsCumulative: number;
  finalCarnivoreTrait: number;
  finalHerbivoreTrait: number;
  coexistenceFraction: number;
  detrendedPeakLag: number;
  detrendedLagZero: number;
  strongPositiveLagSeeds: number;
  classification: string | null;
}

const metricRow = (report: FoodWebScenarioReport | undefined): MetricRow => {
  const pair = report?.correlations.find((entry) => entry.pairId === "herbivore_carnivore");
  return {
    killsCumulative: report?.kills.cumulative.mean ?? 0,
    finalCarnivoreTrait: report?.stability.carnivore.mean.mean ?? 0,
    finalHerbivoreTrait: report?.stability.herbivore.mean.mean ?? 0,
    coexistenceFraction: report?.persistence.coexistenceFraction.mean ?? 0,
    detrendedPeakLag: pair?.detrendedPeakLag.mean ?? 0,
    detrendedLagZero: pair?.detrendedAtLagZero.mean ?? 0,
    strongPositiveLagSeeds: pair?.strongPositiveLagSeeds ?? 0,
    classification: report?.dependence?.classification ?? null,
  };
};

type NumericMetricKey = Exclude<keyof MetricRow, "classification">;

interface AxisComparison {
  scenario: string;
  metric: NumericMetricKey;
  primary: number;
  comparison: number;
  delta: number;
}

const compareAxes = (scenarios: string[], primary: BlockPayload, comparison: BlockPayload): {
  rows: AxisComparison[];
  classificationMatches: Record<string, boolean>;
  lagSignMatches: Record<string, boolean>;
} => {
  const rows: AxisComparison[] = [];
  const classificationMatches: Record<string, boolean> = {};
  const lagSignMatches: Record<string, boolean> = {};
  for (const scenario of scenarios) {
    const a = metricRow(scenarioReport(primary, scenario));
    const b = metricRow(scenarioReport(comparison, scenario));
    for (const metric of Object.keys(a) as NumericMetricKey[]) {
      const primaryValue = a[metric];
      const comparisonValue = b[metric];
      rows.push({
        scenario, metric,
        primary: primaryValue,
        comparison: comparisonValue,
        delta: Math.round((comparisonValue - primaryValue) * 1e6) / 1e6,
      });
    }
    classificationMatches[scenario] = a.classification === b.classification;
    lagSignMatches[scenario] = Math.sign(a.detrendedPeakLag) === Math.sign(b.detrendedPeakLag);
  }
  return { rows, classificationMatches, lagSignMatches };
};

const rebuildReport = (block: BlockPayload, results: RunResult[], sampleEvery: number, ticks: number) =>
  buildFoodWebReport(results, {
    experiment: block.protocol.experiment,
    seeds: block.env.SEEDS,
    ticks,
    sampleEvery,
    maxLag: block.env.MAX_LAG,
    scenarioIds: block.env.SCENARIOS,
    label: `${block.label}-derived`,
  }, block.env.MAX_LAG);

const commonGridCount = (
  block: BlockPayload,
  results: RunResult[],
  scenario: string,
  grid: number,
  sampleEvery: number,
): number => {
  const report = rebuildReport(block, results, sampleEvery, block.env.TICKS)
    .byScenario.find((entry) => entry.scenario === scenario);
  const pair = report?.correlations.find((entry) => entry.pairId === "herbivore_carnivore");
  return pair?.seeds.filter((seed) => seed.detrendedPeakLag !== null && seed.detrendedPeakLag % grid === 0).length ?? 0;
};

describe("E2.2 sensitivity", () => {
  it(
    "aggregates seed, duration and sampling sensitivity from executed blocks",
    () => {
      const main = readBlock(process.env.E2_FOODWEB_SENS_MAIN, "E2_FOODWEB_SENS_MAIN");
      const seed = readBlock(process.env.E2_FOODWEB_SENS_SEED, "E2_FOODWEB_SENS_SEED");
      const duration = readBlock(process.env.E2_FOODWEB_SENS_DURATION, "E2_FOODWEB_SENS_DURATION");
      const sampling = readBlock(process.env.E2_FOODWEB_SENS_SAMPLING, "E2_FOODWEB_SENS_SAMPLING");
      const scenarios = main.payload.env.SCENARIOS;

      const seedComparison = compareAxes(scenarios, main.payload, seed.payload);
      const durationComparison = compareAxes(scenarios, main.payload, duration.payload);

      const s06 = "S06_predator_prey_mixed";
      const truncated = main.payload.results.filter((result) => result.scenario === s06).map((result) =>
        truncateResult(result, duration.payload.env.TICKS));
      const genuineDuration = duration.payload.results.filter((result) => result.scenario === s06);
      const truncationReport = rebuildReport(main.payload, truncated, main.payload.env.SAMPLE_EVERY, duration.payload.env.TICKS);
      const truncationRow = metricRow(truncationReport.byScenario.find((entry) => entry.scenario === s06));
      const genuineRow = metricRow(scenarioReport(duration.payload, s06));
      const truncationMatches = Object.keys(truncationRow).every((key) => {
        if (key === "classification") return truncationRow.classification === genuineRow.classification;
        const field = key as keyof Omit<MetricRow, "classification">;
        return truncationRow[field] === genuineRow[field];
      });

      const s06Main = main.payload.results.filter((result) => result.scenario === s06);
      const s06Fine = sampling.payload.results.filter((result) => result.scenario === s06);
      const s06Coarse = s06Main.map((result) => resampleResult(result, 20));
      const samplingVariants = [
        { label: "sample10-primary", sampleEvery: 10, results: s06Main },
        { label: "sample05-fine", sampleEvery: 5, results: s06Fine },
        { label: "sample20-derived", sampleEvery: 20, results: s06Coarse },
      ].map((variant) => {
        const report = rebuildReport(main.payload, variant.results, variant.sampleEvery, main.payload.env.TICKS);
        const row = metricRow(report.byScenario.find((entry) => entry.scenario === s06));
        return {
          label: variant.label,
          sampleEvery: variant.sampleEvery,
          runs: variant.results.length,
          metrics: row,
          peakLagOnTwentyTickGrid: commonGridCount(main.payload, variant.results, s06, 20, variant.sampleEvery),
        };
      });

      const output = {
        schema: "evoworld.e2.foodweb-sensitivity.v1",
        phase: "E2.2-foodweb-sensitivity",
        executedAt: new Date().toISOString(),
        runtime: { node: process.version, v8: process.versions.v8 },
        inputs: {
          main: { label: main.payload.label, sha256: main.sha256, seeds: main.payload.env.SEEDS, ticks: main.payload.env.TICKS, sampleEvery: main.payload.env.SAMPLE_EVERY },
          seed: { label: seed.payload.label, sha256: seed.sha256, seeds: seed.payload.env.SEEDS, ticks: seed.payload.env.TICKS, sampleEvery: seed.payload.env.SAMPLE_EVERY },
          duration: { label: duration.payload.label, sha256: duration.sha256, seeds: duration.payload.env.SEEDS, ticks: duration.payload.env.TICKS, sampleEvery: duration.payload.env.SAMPLE_EVERY },
          sampling: { label: sampling.payload.label, sha256: sampling.sha256, seeds: sampling.payload.env.SEEDS, ticks: sampling.payload.env.TICKS, sampleEvery: sampling.payload.env.SAMPLE_EVERY },
        },
        seedComparison,
        durationComparison,
        reproducibility: {
          truncationHorizon: duration.payload.env.TICKS,
          truncatedPrimaryMatchesGenuineDuration: truncationMatches,
          truncated: truncationRow,
          genuine: genuineRow,
          note: "Con seed identici e motore deterministico, troncare A a 900 tick deve riprodurre C esattamente.",
        },
        samplingComparison: samplingVariants,
        compositionCoupling: scenarios.map((scenario) =>
          analyzeCompositionCoupling(main.payload.results.filter((result) => result.scenario === scenario), scenario)),
        note: "Sensibilità descrittiva: nessun confronto tra seed è randomizzato. I lag sono in tick; con sampleEvery=20 solo multipli di 20 sono stimabili. L'accoppiamento di composizione separa la covarianza demografica condivisa dalla covarianza delle frazioni.",
      };
      const outputPath = resolveOutputPath(process.env.E2_FOODWEB_SENS_OUT);
      writeExperimentOutput(outputPath, output);
      process.stdout.write(
        `E2.2 sensitivity complete: seed rows=${seedComparison.rows.length}, duration rows=${durationComparison.rows.length}, truncationMatches=${truncationMatches}, output=${outputPath}\n`,
      );
    },
    600_000,
  );
});
