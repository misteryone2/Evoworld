/**
 * E2 — metriche additive per esperimenti ecologici.
 *
 * Tutte le quantita' sono derivate dai campioni E1: nessun file sotto
 * simulation/ o tools/e1/ viene modificato.
 */
import type { RunResult } from "../e1/runner";
import { mean, sampleSd } from "../e1/statistics";
import { diversityTrajectory, dominance } from "./diversity";
import {
  areaUnderCurve,
  baselineBefore,
  lag1Autocorrelation,
  linearTrend,
  oscillationMetrics,
  returnTime,
  sampleSeries,
  type OscillationMetrics,
  type Trend,
} from "./timeseries";

export interface TrophicMetrics {
  finalCarnivoreFraction: number;
  finalHerbivoreFraction: number;
  finalMeanCarnivory: number;
  cumulativePredationKills: number;
  finalPredationPressure: number;
  cumulativeBirths: number;
  cumulativeDeaths: number;
}

export interface ResourceMetrics {
  finalOccupiedVegetation: number;
  meanOccupiedVegetation: number;
  finalOccupiedLandFraction: number;
  organismsSampled: number;
  occupiedCellsSampled: number;
}

export interface GeneticMetrics {
  finalMeanGeneticDistance: number;
  geneticPairsSampled: number;
  speciationEvents: number;
  finalSpeciesAlive: number;
  finalSpeciesExtinct: number;
  finalSpeciesTotalEver: number;
}

export interface ResilienceMetrics {
  perturbationTick: number;
  perturbationKind: string;
  removed: number;
  kept: number;
  baselinePopulation: number;
  minimumAfter: number;
  dropFraction: number;
  returnTick: number | null;
  returnValue: number | null;
  tolerance: number;
}

export interface E2RunMetrics {
  scenario: string;
  seed: number;
  completedTicks: number;
  extinctAt: number | null;
  finalPopulation: number;
  peakPopulation: number;
  troughPopulation: number;
  meanPopulation: number;
  populationSd: number;
  populationCv: number;
  populationAuc: number;
  lag1Population: number | null;
  populationTrend: Trend;
  oscillation: OscillationMetrics;
  diversity: ReturnType<typeof diversityTrajectory>[number] | null;
  meanDominance: number;
  trophic: TrophicMetrics;
  resources: ResourceMetrics;
  genetics: GeneticMetrics;
  resilience: ResilienceMetrics | null;
}

const round = (value: number, digits = 6): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Analisi completa di una corsa E1, senza modificare i dati sorgente. */
export function analyzeRun(result: RunResult): E2RunMetrics {
  const population = sampleSeries(result, "population");
  const values = population.map((p) => p.value);
  const final = result.samples.at(-1);
  const first = result.samples[0];
  const trajectory = diversityTrajectory(result);
  const m = mean(values);
  const sd = values.length >= 2 ? sampleSd(values) : 0;
  const peak = population.reduce((best, p) => (p.value > best.value ? p : best), population[0] ?? { tick: 0, value: 0 });
  const trough = population.reduce((best, p) => (p.value < best.value ? p : best), population[0] ?? { tick: 0, value: 0 });
  const vegPoints = sampleSeries(result, "occupiedVegetation").map((p) => p.value);

  let resilience: ResilienceMetrics | null = null;
  if (result.perturbation) {
    const tick = result.perturbation.atTick;
    const baseline = baselineBefore(population, tick, 5) ?? m;
    const minimumAfter = Math.min(...population.filter((p) => p.tick >= tick).map((p) => p.value));
    const recovery = returnTime(population, tick, baseline, baseline * 0.2, 3);
    resilience = {
      perturbationTick: tick,
      perturbationKind: result.perturbation.kind,
      removed: result.perturbationReport?.removed ?? 0,
      kept: result.perturbationReport?.kept ?? 0,
      baselinePopulation: round(baseline),
      minimumAfter: round(minimumAfter),
      dropFraction: baseline > 0 ? round((baseline - minimumAfter) / baseline) : 0,
      returnTick: recovery.returnTick,
      returnValue: recovery.returnValue,
      tolerance: recovery.tolerance,
    };
  }

  return {
    scenario: result.scenario,
    seed: result.seed,
    completedTicks: result.completedTicks,
    extinctAt: result.extinctAt,
    finalPopulation: final?.population ?? 0,
    peakPopulation: peak.value,
    troughPopulation: trough.value,
    meanPopulation: round(m),
    populationSd: round(sd),
    populationCv: m > 0 ? round(sd / m) : 0,
    populationAuc: areaUnderCurve(population) ?? 0,
    lag1Population: lag1Autocorrelation(values),
    populationTrend: linearTrend(population),
    oscillation: oscillationMetrics(population),
    diversity: trajectory.at(-1) ?? null,
    meanDominance: trajectory.length ? round(mean(trajectory.map((p) => p.dominance))) : 0,
    trophic: {
      finalCarnivoreFraction: final?.carnivoreFraction ?? 0,
      finalHerbivoreFraction: final?.herbivoreFraction ?? 0,
      finalMeanCarnivory: final?.meanCarnivory ?? 0,
      cumulativePredationKills: final?.cumulativePredationKills ?? 0,
      finalPredationPressure: final?.predationPressure ?? 0,
      cumulativeBirths: final?.cumulativeBirths ?? 0,
      cumulativeDeaths: final?.cumulativeDeaths ?? 0,
    },
    resources: {
      finalOccupiedVegetation: final?.occupiedVegetation ?? 0,
      meanOccupiedVegetation: vegPoints.length ? round(mean(vegPoints)) : 0,
      finalOccupiedLandFraction: final?.occupiedLandFraction ?? 0,
      organismsSampled: final?.organismsSampled ?? 0,
      occupiedCellsSampled: final?.occupiedCellsSampled ?? 0,
    },
    genetics: {
      finalMeanGeneticDistance: final?.meanGeneticDistance ?? 0,
      geneticPairsSampled: final?.geneticPairsSampled ?? 0,
      speciationEvents: Math.max(0, (final?.speciesTotalEver ?? 0) - (first?.speciesTotalEver ?? 0)),
      finalSpeciesAlive: final?.speciesAlive ?? 0,
      finalSpeciesExtinct: final?.speciesExtinct ?? 0,
      finalSpeciesTotalEver: final?.speciesTotalEver ?? 0,
    },
    resilience,
  };
}

/** Analizza tutte le corse di uno scenario. */
export function analyzeRuns(results: RunResult[]): E2RunMetrics[] {
  return results.map(analyzeRun);
}

/** Media cross-seed di una metrica numerica annidata, per scenario. */
export function meanByScenario(
  results: RunResult[],
  extract: (metrics: E2RunMetrics) => number | null,
): Record<string, number> {
  const groups = new Map<string, number[]>();
  for (const result of results) {
    const value = extract(analyzeRun(result));
    if (value === null || !Number.isFinite(value)) continue;
    const group = groups.get(result.scenario) ?? [];
    group.push(value);
    groups.set(result.scenario, group);
  }
  const out: Record<string, number> = {};
  for (const [scenario, values] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    out[scenario] = values.length ? round(mean(values)) : 0;
  }
  return out;
}

/** Veicolo di dominanza media per il report. */
export function meanDominanceOf(result: RunResult): number {
  const trajectory = diversityTrajectory(result);
  return trajectory.length ? round(mean(trajectory.map((p) => p.dominance))) : 0;
}

/** Ultimo valore di dominanza (ri-esportazione comoda per i test). */
export function finalDominanceOf(result: RunResult): number {
  const last = result.samples.at(-1);
  return last ? dominance(last) : 0;
}

/** Deviazione standard della popolazione, riusabile nei test. */
export function populationSdOf(result: RunResult): number | null {
  const values = sampleSeries(result, "population").map((p) => p.value);
  return values.length < 2 ? null : round(sampleSd(values));
}
