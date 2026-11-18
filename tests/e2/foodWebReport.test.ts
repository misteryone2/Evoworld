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

const protocol: FoodWebProtocol = {
  experiment: "E2.2 synthetic",
  seeds: [1],
  ticks: 110,
  sampleEvery: 10,
  maxLag: 20,
  scenarioIds: ["S06_predator_prey_mixed"],
};

describe("E2.2 food-web report", () => {
  it("detects a positive tick lag with the documented direction", () => {
    const run = laggedRun(1, "S06_predator_prey_mixed", 1);
    const pair = FOOD_WEB_PAIRS[0];
    const summary = analyzePairCorrelation([run], pair, 20);
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
    const summary = analyzePairCorrelation(runs, FOOD_WEB_PAIRS[0], 20);
    expect(summary.zeroLagSeeds).toBe(12);
    expect(assessCarnivoreDependence(summary, "S06_predator_prey_mixed").classification)
      .toBe("NON_DIMOSTRATO");
  });

  it("classifies consistent lagged sequencing as evidence but never as causation", () => {
    const runs = Array.from({ length: 12 }, (_, index) =>
      laggedRun(index + 1, "S06_predator_prey_mixed", 1));
    const summary = analyzePairCorrelation(runs, FOOD_WEB_PAIRS[0], 20);
    const assessment = assessCarnivoreDependence(summary, "S06_predator_prey_mixed");
    expect(assessment.classification).toBe("EVIDENZA_SEQUENZIALITA");
    expect(assessment.rationale).toContain("non causalità");
    expect(assessment.rationale).toContain("ID predatore/preda");
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
    expect(() => analyzePairCorrelation([run], FOOD_WEB_PAIRS[0], 10.5)).toThrow();
  });
});
