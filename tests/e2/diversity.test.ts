import { describe, expect, it } from "vitest";
import {
  diversitySummary,
  diversityTrajectory,
  dominance,
  effectiveSpecies,
  finalDiversitySummary,
  jaccardTurnover,
  persistentSpecies,
  speciesSet,
} from "../../tools/e2/diversity";
import { makeRun, makeSample } from "./fixtures";

describe("E2 diversity metrics", () => {
  it("computes dominance and effective species count", () => {
    const sample = makeSample({ population: 10, speciesCounts: { 1: 8, 2: 2 } });
    expect(speciesSet(sample)).toEqual([1, 2]);
    expect(dominance(sample)).toBeCloseTo(0.8, 6);
    expect(effectiveSpecies(sample)).toBeCloseTo(1.470588, 5);
  });

  it("computes Jaccard turnover", () => {
    expect(jaccardTurnover([1, 2], [2, 3])).toBeCloseTo(2 / 3, 6);
    expect(jaccardTurnover([1], [1])).toBe(0);
    expect(jaccardTurnover([], [])).toBe(0);
  });

  it("builds a diversity trajectory", () => {
    const run = makeRun("test", 1, [
      makeSample({ tick: 0, speciesCounts: { 1: 8, 2: 2 }, speciesAlive: 2, shannon: 0.5, evenness: 0.7 }),
      makeSample({ tick: 10, speciesCounts: { 1: 10 }, speciesAlive: 1, shannon: 0, evenness: 1 }),
    ]);
    const trajectory = diversityTrajectory(run);
    expect(trajectory[0].dominance).toBeCloseTo(0.8, 6);
    expect(trajectory[1].richness).toBe(1);
    expect(finalDiversitySummary([run], "richness").mean).toBe(1);
  });

  it("computes persistence and cross-seed diversity summary", () => {
    const runs = [
      makeRun("A", 1, [makeSample({ speciesCounts: { 1: 5, 2: 5 } })]),
      makeRun("A", 2, [makeSample({ speciesCounts: { 1: 5, 3: 5 } })]),
    ];
    const persistent = persistentSpecies(runs, 0.4);
    expect(persistent.find((p) => p.speciesId === 1)?.fraction).toBe(1);
    const summary = diversitySummary(runs);
    expect(summary.finalRichness).toBe(2);
    expect(summary.persistentSpecies.some((p) => p.speciesId === 1)).toBe(true);
  });
});
