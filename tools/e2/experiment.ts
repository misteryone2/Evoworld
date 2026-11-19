/**
 * E2 — costruzione del report scientifico del pilota.
 *
 * Il report e' separato dai risultati grezzi: quest'ultimi restano in
 * `results`, qui produciamo solo statistiche derivate e confronti appaiati.
 */
import { extinctionRate, speciationFrequency, summarize, type NumericSummary, type PairedComparison } from "../e1/statistics";
import type { RunResult } from "../e1/runner";
import { diversitySummary } from "./diversity";
import { analyzeRun, type E2RunMetrics } from "./metrics";
import { byScenario, pairedMetric, summarizeMetric } from "./statistics";

export interface E2Protocol {
  experiment: string;
  seeds: number[];
  ticks: number;
  sampleEvery: number;
  scenarioIds: string[];
}

export interface ScenarioReport {
  runs: number;
  finalPopulation: NumericSummary;
  populationCv: NumericSummary;
  lag1Population: NumericSummary;
  trendSlope: NumericSummary;
  peakInterval: NumericSummary;
  extinction: ReturnType<typeof extinctionRate>;
  speciation: ReturnType<typeof speciationFrequency>;
  diversity: ReturnType<typeof diversitySummary>;
  finalOccupiedVegetation: NumericSummary;
  cumulativePredationKills: NumericSummary;
  resilience: E2RunMetrics["resilience"][];
}

export interface E2Report {
  schema: "evoworld.e2.report.v1";
  protocol: E2Protocol;
  byScenario: Record<string, ScenarioReport>;
  pairedComparisons: PairedComparison[];
  note: string;
}

const finite = (values: Array<number | null | undefined>): number[] =>
  values.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));

const safeSummary = (values: Array<number | null | undefined>): NumericSummary => summarize(finite(values));

const extract = (metrics: E2RunMetrics, key: keyof E2RunMetrics): number | null => {
  const value = metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/** Confronti appaiati predefiniti del pilota E2.1. */
export function buildPilotComparisons(groups: Record<string, RunResult[]>): PairedComparison[] {
  const comparisons: PairedComparison[] = [];
  const add = (
    a: string | undefined,
    b: string | undefined,
    label: string,
    description: string,
    metric: string,
    getValue: (m: E2RunMetrics) => number,
  ) => {
    if (!a || !b || !groups[a] || !groups[b]) return;
    comparisons.push(
      pairedMetric(groups[a], groups[b], (r) => getValue(analyzeRun(r)), {
        label, description, scenarioA: a, scenarioB: b, metric,
      }),
    );
  };
  add("S02_scarcity_dense", "S01_stability_baseline", "scarcity_minus_baseline_final_population",
    "Effetto della scarsita'/densita' sulla popolazione finale; non causale (seed non randomizzati).",
    "finalPopulation", (m) => m.finalPopulation);
  add("S06_predator_prey_mixed", "S01_stability_baseline", "mixed_minus_baseline_final_population",
    "Differenza di popolazione finale tra sistema misto e baseline.",
    "finalPopulation", (m) => m.finalPopulation);
  add("S06_predator_prey_mixed", "S01_stability_baseline", "mixed_minus_baseline_predation_kills",
    "Differenza di predazione cumulativa tra sistema misto e baseline.",
    "cumulativePredationKills", (m) => m.trophic.cumulativePredationKills);
  add("S08_recovery_after_cull80", "S01_stability_baseline", "cull_minus_baseline_final_population",
    "Differenza di popolazione finale dopo cull dell'80%; non causale (seed non randomizzati).",
    "finalPopulation", (m) => m.finalPopulation);
  return comparisons;
}

/** Report completo a partire dai risultati grezzi. */
export function buildE2Report(results: RunResult[], protocol: E2Protocol): E2Report {
  const groups = byScenario(results);
  const byScenarioReport: Record<string, ScenarioReport> = {};
  for (const [scenario, group] of Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))) {
    const metrics = group.map(analyzeRun);
    byScenarioReport[scenario] = {
      runs: group.length,
      finalPopulation: summarizeMetric(group, (r) => analyzeRun(r).finalPopulation),
      populationCv: safeSummary(metrics.map((m) => m.populationCv)),
      lag1Population: safeSummary(metrics.map((m) => m.lag1Population)),
      trendSlope: safeSummary(metrics.map((m) => m.populationTrend.slope)),
      peakInterval: safeSummary(metrics.map((m) => m.oscillation.meanPeakInterval)),
      extinction: extinctionRate(group),
      speciation: speciationFrequency(group),
      diversity: diversitySummary(group),
      finalOccupiedVegetation: safeSummary(metrics.map((m) => m.resources.finalOccupiedVegetation)),
      cumulativePredationKills: safeSummary(metrics.map((m) => m.trophic.cumulativePredationKills)),
      resilience: metrics.map((m) => m.resilience).filter((r): r is E2RunMetrics["resilience"] => r !== null),
    };
  }
  return {
    schema: "evoworld.e2.report.v1",
    protocol: {
      ...protocol,
      scenarioIds: [...protocol.scenarioIds].sort(),
    },
    byScenario: byScenarioReport,
    pairedComparisons: buildPilotComparisons(groups),
    note: "Confronti appaiati per seed su 12 seed non randomizzati: supportano differenze osservate, non causalita'. L'unita' sperimentale e' la corsa/seed.",
  };
}

/** Estrattori usati nei test e nella generazione del dataset. */
export const E2_EXTRACTORS = {
  finalPopulation: (m: E2RunMetrics) => m.finalPopulation,
  populationCv: (m: E2RunMetrics) => m.populationCv,
  finalShannon: (m: E2RunMetrics) => m.diversity?.shannon ?? 0,
  cumulativePredationKills: (m: E2RunMetrics) => m.trophic.cumulativePredationKills,
} as const;
