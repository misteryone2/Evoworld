import { describe, expect, it } from "vitest";
import type { RunResult } from "../../tools/e1/runner";
import {
  analyzeCompositionCoupling,
  analyzePairCorrelation,
  assessCarnivoreDependence,
  buildFoodWebReport,
  FOOD_WEB_PAIRS,
  type FoodWebProtocol,
} from "../../tools/e2/foodWebReport";
import {
  crossCorrelation,
  type Point,
} from "../../tools/e2/timeseries";
import {
  combineSurrogatePValues,
  deriveSurrogateSeed,
  iaaftSurrogates,
  runSurrogateNullTest,
  type SurrogateConfig,
} from "../../tools/e2/surrogateInference";
import { makeRun, makeSample } from "./fixtures";

const HERBIVORE_PULSE = [10, 20, 30, 40, 50, 40, 30, 20, 10, 5, 3, 2];

/** Erbivori: impulso; carnivori: stesso impulso ritardato di `shift` campioni. */
const laggedRun = (seed: number, scenario: string, shift: number): RunResult => {
  const samples = HERBIVORE_PULSE.map((herbivoreCount, index) => {
    const carnivoreCount = index - shift >= 0 ? HERBIVORE_PULSE[index - shift] : 3;
    const population = herbivoreCount + carnivoreCount;
    return makeSample({
      tick: index * 10,
      population,
      eventDenominator: population,
      organismsSampled: population,
      herbivoreFraction: herbivoreCount / population,
      carnivoreFraction: carnivoreCount / population,
      predationKills: index % 3,
      cumulativePredationKills: index * 2,
      predationPressure: (index % 3) / population,
      occupiedVegetation: 0.5 - index * 0.01,
    });
  });
  return makeRun(scenario, seed, samples);
};

/**
 * Serie stazionarie non periodiche: `signal` è ritardato di `shift` campioni in
 * `b`; `sign` permette di generare una relazione positiva o negativa forte.
 */
const waveRun = (
  seed: number,
  scenario: string,
  sign: 1 | -1,
  shift = 2,
  length = 70,
): RunResult => {
  const wave = (index: number): number =>
    12 * Math.sin((index + seed) * 0.31) + 6 * Math.sin((index + seed) * 0.87);
  const samples = Array.from({ length }, (_, index) => {
    const herbivore = 50 + wave(index);
    const carnivore = 50 + sign * wave(index - shift) + 1.5 * Math.cos((index + seed * 3) * 1.7);
    const population = herbivore + carnivore;
    return makeSample({
      tick: index * 10,
      population,
      eventDenominator: population,
      organismsSampled: population,
      herbivoreFraction: herbivore / population,
      carnivoreFraction: carnivore / population,
      predationKills: index % 2,
      cumulativePredationKills: index,
      occupiedVegetation: 0.5 + 0.01 * Math.sin(index * 0.2),
    });
  });
  return makeRun(scenario, seed, samples);
};

const noSurrogate: Partial<SurrogateConfig> = {
  enabled: false,
  minOverlappingObservations: 8,
};

const waveSurrogate: Partial<SurrogateConfig> = {
  enabled: true,
  surrogates: 49,
  iterations: 8,
  seed: 0x1234abcd,
  alpha: 0.05,
  minOverlappingObservations: 18,
  pairIds: ["herbivore_carnivore"],
};

const protocol: FoodWebProtocol = {
  experiment: "E2.2 synthetic",
  seeds: [1],
  ticks: 110,
  sampleEvery: 10,
  maxLag: 20,
  scenarioIds: ["S06_predator_prey_mixed"],
  surrogate: noSurrogate,
};

describe("E2.2 food-web report", () => {
  it("detects a positive tick lag with the documented direction", () => {
    const run = laggedRun(1, "S06_predator_prey_mixed", 1);
    const summary = analyzePairCorrelation([run], FOOD_WEB_PAIRS[0], 20, noSurrogate);
    expect(summary.pairId).toBe("herbivore_carnivore");
    expect(summary.a).toBe("herbivore");
    expect(summary.b).toBe("carnivore");
    expect(summary.detrendedPeakLag.mean).toBe(10);
    expect(summary.positiveLagSeeds).toBe(1);
    expect(summary.strongPositiveLagSeeds).toBe(1);
    expect(summary.maxLag).toBe(20);
  });

  it("does not classify synchronous traits as sequential dependence", () => {
    const runs = Array.from({ length: 12 }, (_, index) =>
      laggedRun(index + 1, "S06_predator_prey_mixed", 0));
    const summary = analyzePairCorrelation(runs, FOOD_WEB_PAIRS[0], 20, noSurrogate);
    expect(summary.zeroLagSeeds).toBe(12);
    expect(assessCarnivoreDependence(summary, "S06_predator_prey_mixed").classification)
      .toBe("NON_DIMOSTRATO");
  });

  it("keeps descriptive concordance separate from statistical evidence", () => {
    const runs = Array.from({ length: 12 }, (_, index) =>
      laggedRun(index + 1, "S06_predator_prey_mixed", 1));
    const summary = analyzePairCorrelation(runs, FOOD_WEB_PAIRS[0], 20, noSurrogate);
    const assessment = assessCarnivoreDependence(summary, "S06_predator_prey_mixed");
    expect(summary.positiveCorrelationPositiveLagSeeds).toBe(12);
    expect(assessment.statistical.classification).toBe("NON_VALUTABILE");
    expect(assessment.sequencing.direction).toBe("POSITIVA");
    expect(assessment.sequencing.verdict).toBe("INDICATIVO_POSITIVO");
    expect(assessment.classification).toBe("INDICATIVO");
    expect(assessment.rationale).toContain("non causalità");
    expect(assessment.rationale).toContain("ID predatore/preda");
  });

  it("allows statistical sequencing only when the surrogate max-statistic test is significant", () => {
    const runs = Array.from({ length: 12 }, (_, index) =>
      waveRun(index + 1, "S06_predator_prey_mixed", 1));
    const summary = analyzePairCorrelation(runs, FOOD_WEB_PAIRS[0], 60, waveSurrogate);
    const assessment = assessCarnivoreDependence(summary, "S06_predator_prey_mixed");
    expect(summary.surrogate).not.toBeNull();
    expect(summary.surrogate?.tests).toBe(12);
    expect(summary.surrogate?.significant).toBe(true);
    expect(summary.surrogate?.fisherP).toBeGreaterThan(0);
    expect(summary.surrogate?.fisherP).toBeLessThan(0.05);
    expect(assessment.statistical.classification).toBe("SIGNIFICATIVO");
    expect(assessment.sequencing.verdict).toBe("EVIDENZA_SEQUENZIALITA_POSITIVA");
    expect(assessment.causality.classification).toBe("NON_IDENTIFICABILE");
  });

  it("preserves very small Fisher p-values instead of rounding them to zero", () => {
    const combined = combineSurrogatePValues(Array.from({ length: 12 }, () => 1 / 200));
    expect(combined.fisherP).toBeGreaterThan(0);
    expect(combined.fisherP).toBeLessThan(1e-6);
    expect(combined.significant).toBe(true);
    expect(combined.minPValue).toBeGreaterThan(0);
  });

  it("never classifies a strong negative correlation as positive sequencing", () => {
    const runs = Array.from({ length: 12 }, (_, index) =>
      waveRun(index + 1, "S06_predator_prey_mixed", -1));
    const summary = analyzePairCorrelation(runs, FOOD_WEB_PAIRS[0], 60, waveSurrogate);
    const assessment = assessCarnivoreDependence(summary, "S06_predator_prey_mixed");
    expect(summary.detrendedPeakCorrelation.mean).toBeLessThan(-0.5);
    expect(summary.negativeCorrelationPositiveLagSeeds).toBeGreaterThanOrEqual(10);
    expect(summary.positiveCorrelationPositiveLagSeeds).toBe(0);
    expect(summary.strongPositiveLagSeeds).toBe(0);
    expect(assessment.sequencing.direction).toBe("NEGATIVA");
    expect(assessment.sequencing.verdict).not.toContain("POSITIVA");
    expect(assessment.sequencing.verdict).toBe("EVIDENZA_SEQUENZIALITA_NEGATIVA");
  });

  it("documents nominal lags, estimable lags and extreme-lag pair loss", () => {
    const points: Point[] = Array.from({ length: 271 }, (_, index) => ({
      tick: index * 10,
      value: 100 + 10 * Math.sin(index * 0.11),
    }));
    const other: Point[] = Array.from({ length: 271 }, (_, index) => ({
      tick: index * 10,
      value: 90 + 8 * Math.cos(index * 0.09),
    }));
    const curve = crossCorrelation(points, other, 200, 30);
    expect(curve.lagSearch.lagsAttempted).toBe(401);
    expect(curve.lagSearch.lagsOnGrid).toBe(41);
    expect(curve.lagSearch.lagsWithoutPairs).toBe(360);
    expect(curve.lagSearch.lagsAccepted).toBe(41);
    expect(curve.lagSearch.minimumPairsOnGrid).toBe(251);
    expect(curve.lagSearch.extremeLagPairs.negative).toBe(251);
    expect(curve.lagSearch.extremeLagPairs.positive).toBe(251);
    expect(curve.lagSearch.extremeLagPairs.lossFraction).toBeCloseTo(1 - 251 / 271, 5);
  });

  it("rejects extreme lags below the declared minimum overlap", () => {
    const run = laggedRun(1, "S06_predator_prey_mixed", 1);
    const series = FOOD_WEB_PAIRS[0];
    const a: Point[] = run.samples.map((sample) => ({
      tick: sample.tick,
      value: sample.population * sample.herbivoreFraction,
    }));
    const b: Point[] = run.samples.map((sample) => ({
      tick: sample.tick,
      value: sample.population * sample.carnivoreFraction,
    }));
    const curve = crossCorrelation(a, b, 100, 8);
    const extremePositive = curve.find((entry) => entry.lag === 100);
    const zero = curve.find((entry) => entry.lag === 0);
    expect(extremePositive?.pairs).toBe(2);
    expect(extremePositive?.correlation).toBeNull();
    expect((zero?.correlation as number)).toBeGreaterThan(0);
    expect(series.id).toBe("herbivore_carnivore");
  });

  it("reproduces surrogate p-values exactly and preserves the value distribution", () => {
    const run = waveRun(1, "S06_predator_prey_mixed", 1);
    const { a, b } = {
      a: run.samples.map((sample) => ({
        tick: sample.tick,
        value: sample.population * sample.herbivoreFraction,
      })),
      b: run.samples.map((sample) => ({
        tick: sample.tick,
        value: sample.population * sample.carnivoreFraction,
      })),
    };
    const first = runSurrogateNullTest(FOOD_WEB_PAIRS[0].id, 1, a, b, 60, {
      ...waveSurrogate,
      surrogates: 19,
      pairIds: [],
    } as SurrogateConfig);
    const second = runSurrogateNullTest(FOOD_WEB_PAIRS[0].id, 1, a, b, 60, {
      ...waveSurrogate,
      surrogates: 19,
      pairIds: [],
    } as SurrogateConfig);
    expect(first.pValue).toBe(second.pValue);
    expect(first.observedLag).toBe(second.observedLag);
    expect(first.nullMaxAbs.n).toBe(19);
    expect(first.properties.valueDistribution.preservedByRankRemapping).toBe(true);
    expect(first.properties.valueDistribution.maximumSortedDeviation).toBeLessThan(1e-6);
    expect(deriveSurrogateSeed(1, "x", 2, 0)).toBe(deriveSurrogateSeed(1, "x", 2, 0));
    expect(deriveSurrogateSeed(1, "x", 2, 0)).not.toBe(deriveSurrogateSeed(1, "x", 3, 0));

    const values = a.map((point) => point.value);
    const surrogates = iaaftSurrogates(values, 3, () => 0.42, 4);
    expect(surrogates).toHaveLength(3);
    expect(surrogates[0]).not.toEqual(values);
  });

  it("builds a report with persistence, kills and paired comparisons", () => {
    const s06 = Array.from({ length: 3 }, (_, index) =>
      laggedRun(index + 1, "S06_predator_prey_mixed", 1));
    const s05 = Array.from({ length: 3 }, (_, index) =>
      laggedRun(index + 1, "S05_carnivore_stress", 0));
    const report = buildFoodWebReport([...s06, ...s05], protocol, 20);
    expect(report.schema).toBe("evoworld.e2.foodweb.v1");
    expect(report.byScenario.map((scenario) => scenario.scenario)).toEqual([
      "S05_carnivore_stress", "S06_predator_prey_mixed",
    ]);
    const mixed = report.byScenario.find((scenario) => scenario.scenario === "S06_predator_prey_mixed");
    expect(mixed?.runs).toBe(3);
    expect(mixed?.correlations).toHaveLength(FOOD_WEB_PAIRS.length);
    expect(mixed?.kills.cumulative.n).toBe(3);
    expect(mixed?.persistence.seedsWithCoexistenceOverHalf).toBe(3);
    expect(mixed?.dependence?.pairId).toBe("herbivore_carnivore");
    expect(Object.keys(mixed?.sequencingByPair ?? {}).sort()).toEqual(
      FOOD_WEB_PAIRS.map((pair) => pair.id).sort(),
    );
    expect(mixed?.sequencingByPair["herbivore_kills"]?.pairId).toBe("herbivore_kills");
    expect(report.pairedComparisons.length).toBeGreaterThan(0);
    expect(report.note).toContain("tratti ≠ ruoli");
  });

  it("separates shared-population coupling from fraction coupling", () => {
    const runs = Array.from({ length: 3 }, (_, index) =>
      laggedRun(index + 1, "S06_predator_prey_mixed", 1));
    const coupling = analyzeCompositionCoupling(runs, "S06_predator_prey_mixed");
    expect(coupling.runs).toBe(3);
    expect(coupling.countCorrelation.n).toBe(3);
    expect(coupling.fractionCorrelation.n).toBe(3);
    expect(coupling.populationHerbivoreCorrelation.n).toBe(3);
    expect(coupling.note).toContain("population");

    const constantFractions = Array.from({ length: 3 }, (_, index) =>
      makeRun("S04_herbivore_monoculture", index + 1, [
        makeSample({ tick: 0, population: 100, carnivoreFraction: 0, herbivoreFraction: 1 }),
        makeSample({ tick: 10, population: 80, carnivoreFraction: 0, herbivoreFraction: 1 }),
        makeSample({ tick: 20, population: 60, carnivoreFraction: 0, herbivoreFraction: 1 }),
      ]));
    const degenerate = analyzeCompositionCoupling(constantFractions, "S04_herbivore_monoculture");
    expect(degenerate.fractionCorrelation.n).toBe(0);
  });

  it("rejects non-integer lag grids", () => {
    const run = laggedRun(1, "S06_predator_prey_mixed", 1);
    expect(() => analyzePairCorrelation([run], FOOD_WEB_PAIRS[0], 10.5, noSurrogate)).toThrow();
  });
});
