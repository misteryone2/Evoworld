/**
 * E2 — wrapper statistici additivi.
 *
 * Riutilizza le funzioni E1 (t-quantile, summary, pairedDifference) senza
 * duplicarle ne' modificarle. L'unita' sperimentale resta il seed.
 */
import type { RunResult } from "../e1/runner";
import {
  groupByScenario,
  pairedDifference,
  seedValues,
  summarize,
  type NumericSummary,
  type PairedComparison,
  type SeedValue,
} from "../e1/statistics";

export type Extractor = (result: RunResult) => number;

/** Riassunto cross-seed di una metrica E2, usando la statistica E1. */
export function summarizeMetric(results: RunResult[], extract: Extractor): NumericSummary {
  return summarize(results.map(extract));
}

/** Coppie appaiate per seed di una metrica qualsiasi. */
export function pairedMetric(
  a: RunResult[],
  b: RunResult[],
  extract: Extractor,
  meta: { label: string; description: string; scenarioA?: string; scenarioB?: string; metric?: string },
): PairedComparison {
  return pairedDifference(seedValues(a, extract), seedValues(b, extract), meta);
}

/** Valori per seed di una metrica E2. */
export function seedMetric(results: RunResult[], extract: Extractor): SeedValue[] {
  return seedValues(results, extract);
}

/** Raggruppamento per scenario, identico a E1 ma riusabile nel report E2. */
export function byScenario(results: RunResult[]): Record<string, RunResult[]> {
  return groupByScenario(results);
}
