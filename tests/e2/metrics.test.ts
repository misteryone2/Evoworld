import { describe, expect, it } from "vitest";
import { analyzeRun, meanByScenario, populationSdOf } from "../../tools/e2/metrics";
import type { PerturbationReport } from "../../tools/e1/initialConditions";
import { makeRun, samplesFromPopulations } from "./fixtures";

describe("E2 run metrics", () => {
  it("analyzes stability and oscillation fields", () => {
    const run = makeRun("S01", 1, samplesFromPopulations([10, 12, 8, 14, 9]));
    const metrics = analyzeRun(run);
    expect(metrics.finalPopulation).toBe(9);
    expect(metrics.peakPopulation).toBe(14);
    expect(metrics.troughPopulation).toBe(8);
    expect(metrics.meanPopulation).toBeCloseTo(10.6, 6);
    expect(metrics.populationSd).toBeGreaterThan(0);
    expect(metrics.populationAuc).toBeGreaterThan(0);
    expect(populationSdOf(run)).toBeCloseTo(metrics.populationSd, 6);
  });

  it("analyzes resilience after a cull", () => {
    const report: PerturbationReport = {
      kind: "cull80",
      tick: 20,
      populationBefore: 10,
      populationAfter: 10,
      removed: 8,
      kept: 2,
      expectedKept: 2,
      method: "deterministic_stratified_hash",
      perSpecies: [{ speciesId: 1, before: 10, removed: 8, kept: 2 }],
    };
    const run = makeRun("S08", 1, samplesFromPopulations([10, 10, 2, 10, 10, 10]), {
      perturbation: { atTick: 20, kind: "cull80" },
      perturbationReport: report,
    });
    const metrics = analyzeRun(run);
    expect(metrics.resilience).not.toBeNull();
    expect(metrics.resilience?.baselinePopulation).toBe(10);
    expect(metrics.resilience?.minimumAfter).toBe(2);
    expect(metrics.resilience?.dropFraction).toBeCloseTo(0.8, 6);
    expect(metrics.resilience?.returnTick).toBe(30);
  });

  it("groups mean metrics by scenario", () => {
    const runs = [
      makeRun("A", 1, samplesFromPopulations([10, 20])),
      makeRun("A", 2, samplesFromPopulations([10, 30])),
      makeRun("B", 1, samplesFromPopulations([10, 5])),
    ];
    const means = meanByScenario(runs, (m) => m.finalPopulation);
    expect(means.A).toBe(25);
    expect(means.B).toBe(5);
  });
});
