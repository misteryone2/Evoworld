import { describe, expect, it } from "vitest";
import { buildE2Report } from "../../tools/e2/experiment";
import { makeRun, samplesFromPopulations } from "./fixtures";

describe("E2 report builder", () => {
  it("aggregates scenarios and builds paired comparisons", () => {
    const results = [
      makeRun("S01_stability_baseline", 1, samplesFromPopulations([10, 20])),
      makeRun("S01_stability_baseline", 2, samplesFromPopulations([10, 22])),
      makeRun("S02_scarcity_dense", 1, samplesFromPopulations([10, 10])),
      makeRun("S02_scarcity_dense", 2, samplesFromPopulations([10, 12])),
    ];
    const report = buildE2Report(results, {
      experiment: "test",
      seeds: [1, 2],
      ticks: 10,
      sampleEvery: 10,
      scenarioIds: ["S01_stability_baseline", "S02_scarcity_dense"],
    });
    expect(report.schema).toBe("evoworld.e2.report.v1");
    expect(Object.keys(report.byScenario)).toHaveLength(2);
    expect(report.byScenario.S01_stability_baseline.finalPopulation.mean).toBe(21);
    expect(report.byScenario.S02_scarcity_dense.finalPopulation.mean).toBe(11);
    const scarcity = report.pairedComparisons.find((p) => p.label === "scarcity_minus_baseline_final_population");
    expect(scarcity?.pairs).toHaveLength(2);
    expect(scarcity?.meanDifference).toBe(-10);
    expect(report.note).toContain("non causalita");
  });
});
