import { describe, expect, it } from "vitest";
import { analyzeTrophicCorrelation, trophicSeries } from "../../tools/e2/correlationReview";
import { makeRun, makeSample } from "./fixtures";

const samples = (seed: number) =>
  [0, 1, 2, 3, 4, 5].map((i) =>
    makeSample({
      tick: i * 10,
      population: 100 - i * 10 + seed,
      herbivoreFraction: 0.6,
      carnivoreFraction: 0.4,
    }),
  );

describe("trophicSeries", () => {
  it("derives herbivore and carnivore counts from E1 trait fractions", () => {
    const result = makeRun("S06_predator_prey_mixed", 1, samples(0));
    const series = trophicSeries(result);

    expect(series.herbivore).toHaveLength(6);
    expect(series.carnivore).toHaveLength(6);
    expect(series.herbivore[0].value).toBeCloseTo(60, 6);
    expect(series.carnivore[0].value).toBeCloseTo(40, 6);
    expect(series.herbivore[0].tick).toBe(0);
  });
});

describe("analyzeTrophicCorrelation", () => {
  it("summarizes original, detrended and lag-sensitive correlations per seed", () => {
    const results = [makeRun("S06_predator_prey_mixed", 2, samples(1)), makeRun("S06_predator_prey_mixed", 1, samples(0))];
    const review = analyzeTrophicCorrelation(results, 2);

    expect(review.seeds.map((s) => s.seed)).toEqual([1, 2]);
    expect(review.originalAtLagZero.n).toBe(2);
    expect(review.detrendedAtLagZero.n).toBeGreaterThanOrEqual(0);
    expect(review.lagAggregates).toHaveLength(5);
    expect(review.lagAggregates[0].lag).toBe(-2);
    expect(review.lagAggregates[4].lag).toBe(2);
    expect(review.spuriousTrendRiskSeeds).toBe(2);
    expect(review.note).toContain("non dimostra causalita");
  });
});
