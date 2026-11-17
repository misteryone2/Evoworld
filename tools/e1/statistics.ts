/**
 * E1.2 — statistiche descrittive multi-seed, calcolate SOLO dai risultati
 * dell'harness. Nessuna regola biologica o parametro di simulazione è coinvolto.
 *
 * Gli intervalli di confidenza usano la t di Student con deviazione standard
 * campionaria (n-1) e sono quindi approssimativi: con 12 seed presuppongono
 * osservazioni indipendenti e distribuzione circa normale. Vanno letti come
 * incertezza empirica, non come prova di significatività.
 */
import type { RunResult } from "./runner";

export interface NumericSummary {
  n: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  ci95: { low: number; high: number } | null;
}

export interface RateSummary {
  count: number;
  n: number;
  rate: number;
}

export interface SpeciationSummary {
  runsWithSpeciation: number;
  n: number;
  frequency: number;
  meanEvents: number;
}

const T_CRITICAL_95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262,
  10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110,
  18: 2.101, 19: 2.093, 20: 2.086, 21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
  26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
};

function round(value: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Deviazione standard campionaria (denominatore n-1). */
export function sampleSd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) * (v - m), 0) / (values.length - 1));
}

export function summarize(values: number[]): NumericSummary {
  if (!values.length) {
    return { n: 0, mean: 0, sd: 0, min: 0, max: 0, ci95: null };
  }
  const m = mean(values);
  const sd = sampleSd(values);
  const df = values.length - 1;
  const t = df > 0 ? (T_CRITICAL_95[df] ?? 1.96) : 0;
  const half = df > 0 ? (t * sd) / Math.sqrt(values.length) : 0;
  return {
    n: values.length,
    mean: round(m),
    sd: round(sd),
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
    ci95: df > 0 ? { low: round(m - half), high: round(m + half) } : null,
  };
}

export function groupByScenario(results: RunResult[]): Record<string, RunResult[]> {
  const groups: Record<string, RunResult[]> = {};
  for (const r of results) (groups[r.scenario] ??= []).push(r);
  return groups;
}

export function finalPopulation(r: RunResult): number {
  return r.samples.length ? r.samples[r.samples.length - 1].population : 0;
}

export function finalOccupiedVegetation(r: RunResult): number {
  return r.samples.length ? r.samples[r.samples.length - 1].occupiedVegetation : 0;
}

export function extinctionRate(results: RunResult[]): RateSummary {
  const count = results.filter((r) => r.extinctAt !== null || finalPopulation(r) === 0).length;
  return { count, n: results.length, rate: round(results.length ? count / results.length : 0) };
}

/** Speciazione = crescita del conteggio storico di specie tra tick 0 e fine corsa. */
export function speciationFrequency(results: RunResult[]): SpeciationSummary {
  const events = results.map((r) => {
    const first = r.samples[0]?.speciesTotalEver ?? 0;
    const last = r.samples[r.samples.length - 1]?.speciesTotalEver ?? 0;
    return Math.max(0, last - first);
  });
  return {
    runsWithSpeciation: events.filter((e) => e > 0).length,
    n: results.length,
    frequency: round(events.length ? events.filter((e) => e > 0).length / events.length : 0),
    meanEvents: round(mean(events)),
  };
}

const POPULATION_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: "0 (estinta)", min: 0, max: 0 },
  { label: "1-9", min: 1, max: 9 },
  { label: "10-24", min: 10, max: 24 },
  { label: "25-49", min: 25, max: 49 },
  { label: "50-99", min: 50, max: 99 },
  { label: ">=100", min: 100, max: Number.POSITIVE_INFINITY },
];

export function finalPopulationDistribution(results: RunResult[]) {
  const values = results.map(finalPopulation).sort((a, b) => a - b);
  return {
    sortedValues: values,
    buckets: POPULATION_BUCKETS.map((b) => ({
      label: b.label,
      count: values.filter((v) => v >= b.min && v <= b.max).length,
    })),
  };
}

function delta(a: NumericSummary, b: NumericSummary): number {
  return round(a.mean - b.mean);
}

export interface FactorialContrast {
  label: string;
  meanDifference: number;
  description: string;
}

/**
 * Confronto 2x2: S09/S13 condividono le posizioni povere, S10/S14 quelle
 * ricche; S09/S14 condividono la vegetazione povera, S10/S13 quella ricca.
 */
export function habitatComparison(groups: Record<string, RunResult[]>): Record<string, unknown> {
  const summaries = Object.fromEntries(
    Object.entries(groups).map(([id, runs]) => [id, summarize(runs.map(finalPopulation))]),
  );
  const vegetation = Object.fromEntries(
    Object.entries(groups).map(([id, runs]) => [id, summarize(runs.map(finalOccupiedVegetation))]),
  );
  const contrasts: FactorialContrast[] = [
    {
      label: "resource_effect_at_poor_positions",
      meanDifference: delta(summaries["S13_poor_position_rich_resources"], summaries["S09_poor_habitat"]),
      description: "S13 - S09: stessa posizione povera, vegetazione iniziale ricca vs povera",
    },
    {
      label: "resource_effect_at_rich_positions",
      meanDifference: delta(summaries["S10_rich_habitat"], summaries["S14_rich_position_poor_resources"]),
      description: "S10 - S14: stessa posizione ricca, vegetazione iniziale ricca vs povera",
    },
    {
      label: "position_effect_with_poor_resources",
      meanDifference: delta(summaries["S14_rich_position_poor_resources"], summaries["S09_poor_habitat"]),
      description: "S14 - S09: stessa vegetazione povera, posizione ricca vs povera",
    },
    {
      label: "position_effect_with_rich_resources",
      meanDifference: delta(summaries["S10_rich_habitat"], summaries["S13_poor_position_rich_resources"]),
      description: "S10 - S13: stessa vegetazione ricca, posizione ricca vs povera",
    },
  ];
  return {
    finalPopulation: summaries,
    finalOccupiedVegetation: vegetation,
    extinction: Object.fromEntries(Object.entries(groups).map(([id, runs]) => [id, extinctionRate(runs)])),
    contrasts,
  };
}

export function perturbationComparison(groups: Record<string, RunResult[]>): Record<string, unknown> {
  const control = groups["S01_stability_baseline"] ?? [];
  const perturbed = groups["S08_recovery_after_cull80"] ?? [];
  const cullSamples = perturbed
    .map((r) => r.samples.find((s) => s.perturbationRemoved > 0))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  return {
    controlScenario: "S01_stability_baseline",
    perturbedScenario: "S08_recovery_after_cull80",
    finalPopulation: {
      withoutPerturbation: summarize(control.map(finalPopulation)),
      withPerturbation: summarize(perturbed.map(finalPopulation)),
      meanDifference: delta(
        summarize(perturbed.map(finalPopulation)),
        summarize(control.map(finalPopulation)),
      ),
    },
    extinction: {
      withoutPerturbation: extinctionRate(control),
      withPerturbation: extinctionRate(perturbed),
    },
    cull: {
      observedSamples: cullSamples.length,
      tick: cullSamples[0]?.tick ?? null,
      populationAtStart: summarize(cullSamples.map((s) => s.populationAtStart)),
      populationAfterStep: summarize(cullSamples.map((s) => s.populationAfterStep)),
      removed: summarize(cullSamples.map((s) => s.perturbationRemoved)),
      kept: summarize(cullSamples.map((s) => s.perturbationKept)),
      denominatorMatchesStart: cullSamples.every((s) => s.eventDenominator === Math.max(1, s.populationAtStart)),
    },
  };
}

/** Report completo della fase E1.2, serializzato dallo script phase2. */
export function buildPhase2Report(results: RunResult[], protocol: { ticks: number; sampleEvery: number; seeds: number[] }) {
  const groups = groupByScenario(results);
  const byId = Object.fromEntries(
    Object.entries(groups).map(([id, runs]) => [id, {
      runs: runs.length,
      finalPopulation: summarize(runs.map(finalPopulation)),
      finalPopulationDistribution: finalPopulationDistribution(runs),
      extinction: extinctionRate(runs),
      speciation: speciationFrequency(runs),
    }]),
  );
  return {
    protocol: { ...protocol, scenarioIds: Object.keys(groups).sort(), totalRuns: results.length },
    byScenario: byId,
    habitat: habitatComparison(groups),
    perturbation: perturbationComparison(groups),
    note:
      "Media e deviazione standard campionarie; IC95 con t di Student (approssimativo, " +
      "assume indipendenza e normalita' dei seed). Nessun valore e' stato ottenuto modificando le regole biologiche.",
  };
}
