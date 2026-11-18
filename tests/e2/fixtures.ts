import type { E1Sample } from "../../tools/e1/metrics";
import type { RunResult } from "../../tools/e1/runner";

export function makeSample(overrides: Partial<E1Sample> = {}): E1Sample {
  const population = overrides.population ?? 10;
  const speciesCounts = overrides.speciesCounts ?? { 1: population };
  const speciesAlive = overrides.speciesAlive ?? Object.values(speciesCounts).filter((n) => n > 0).length;
  return {
    tick: 0,
    year: 0,
    season: "spring" as E1Sample["season"],
    population,
    populationAtStart: population,
    populationAfterStep: population,
    perturbationRemoved: 0,
    perturbationKept: population,
    eventDenominator: population,
    speciesAlive,
    speciesExtinct: 0,
    speciesTotalEver: speciesAlive,
    speciesCounts,
    shannon: 0,
    evenness: 1,
    births: 0,
    deaths: 0,
    predationKills: 0,
    cumulativeBirths: 0,
    cumulativeDeaths: 0,
    cumulativePredationKills: 0,
    birthRate: 0,
    deathRate: 0,
    predationPressure: 0,
    meanEnergy: 50,
    energySd: 5,
    meanAge: 10,
    carnivoreFraction: 0,
    herbivoreFraction: 1,
    meanCarnivory: 0.05,
    meanSize: 1,
    meanSpeed: 1,
    meanMetabolism: 1,
    meanVision: 5,
    meanEvasion: 0.2,
    meanHuntingSkill: 0.2,
    occupiedVegetation: 0.5,
    occupiedLandFraction: 0.8,
    organismsSampled: population,
    occupiedCellsSampled: 4,
    meanGeneticDistance: 0.05,
    geneticPairsTotal: 45,
    geneticPairsSampled: 45,
    geneticPairMethod: "all_pairs",
    ...overrides,
  } as E1Sample;
}

export function makeRun(
  scenario: string,
  seed: number,
  samples: E1Sample[],
  overrides: Partial<RunResult> = {},
): RunResult {
  return {
    scenario,
    description: scenario,
    seed,
    width: 128,
    height: 128,
    initialPopulation: samples[0]?.population ?? 10,
    ticks: (samples.at(-1)?.tick ?? 0),
    sampleEvery: 10,
    setup: "baseline",
    setupInfo: { kind: "baseline" },
    perturbation: null,
    perturbationReport: null,
    options: {},
    completedTicks: samples.at(-1)?.tick ?? 0,
    extinctAt: null,
    elapsedMs: 1,
    samples,
    ...overrides,
  } as RunResult;
}

export function samplesFromPopulations(populations: number[], extra: Partial<E1Sample> = {}): E1Sample[] {
  return populations.map((population, i) =>
    makeSample({
      tick: i * 10,
      population,
      populationAtStart: population,
      populationAfterStep: population,
      eventDenominator: population,
      organismsSampled: population,
      speciesCounts: { 1: population },
      cumulativeBirths: i,
      cumulativeDeaths: i,
      cumulativePredationKills: 0,
      ...extra,
    }),
  );
}
