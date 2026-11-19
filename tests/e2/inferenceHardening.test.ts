import { describe, expect, it } from "vitest";
import {
  adjustFamily,
  benjaminiHochbergAdjust,
  combineHardenedEvidence,
  diagnoseSeries,
  evaluateFprCell,
  holmAdjust,
  ksDistanceDiscrete,
  QA_ACCEPTANCE,
  runHardenedSurrogateNullTest,
  summarizeFpr,
  wilsonInterval,
} from "../../tools/e2/inferenceHardening";
import {
  DEFAULT_SURROGATE_CONFIG,
  qaAutocorrelationLags,
} from "../../tools/e2/surrogateInference";
import { degenerateSeries, independentPair, pointsFrom, syntheticSeries } from "../../tools/e2/syntheticSeries";

const config = { ...DEFAULT_SURROGATE_CONFIG, surrogates: 49, iterations: 12 };

describe("E2.2.1 inferential hardening", () => {
  it("records per-surrogate QA metadata and the required autocorrelation lags", () => {
    const values = syntheticSeries(1234, 100, { phi: 0.25, distribution: "gaussian" });
    const test = runHardenedSurrogateNullTest("qa", 1,
      pointsFrom(values), pointsFrom(syntheticSeries(5678, 100, { phi: 0.25 })), 20, config);
    expect(test.quality.surrogates).toHaveLength(config.surrogates);
    expect(qaAutocorrelationLags(100)).toEqual([1, 2, 3, 5, 10, 20]);
    const first = test.quality.surrogates[0];
    expect(first.autocorrelations.a.map((entry) => entry.lag)).toEqual([1, 2, 3, 5, 10, 20]);
    expect(first.autocorrelations.b.map((entry) => entry.lag)).toEqual([1, 2, 3, 5, 10, 20]);
    expect(first.finiteA && first.finiteB).toBe(true);
    expect(first.iterationsA).toBeGreaterThan(0);
    expect(first.finalSpectralErrorA).toBeGreaterThanOrEqual(0);
    expect(first.maximumSortedDeviationA).toBeLessThanOrEqual(QA_ACCEPTANCE.distributionErrorMax);
    expect(test.quality.ensembleAutocorrelation.map((entry) => entry.lag)).toEqual([1, 2, 3, 5, 10, 20]);
  });

  it("marks degenerate, near-constant and many-ties diagnostics explicitly", () => {
    expect(diagnoseSeries(degenerateSeries("constant", 100)).invalidationReasons).toContain("degenerate series");
    expect(diagnoseSeries(degenerateSeries("near-constant", 100)).invalidationReasons).toContain("near-constant series");
    const tied = diagnoseSeries(degenerateSeries("tied", 100));
    expect(tied.manyTies).toBe(true);
    expect(tied.invalidationReasons).toEqual([]);
  });

  it("returns NON_VALUTABILE for degenerate input without producing a p-value claim", () => {
    const values = degenerateSeries("constant", 100);
    const test = runHardenedSurrogateNullTest("degenerate", 1,
      pointsFrom(values), pointsFrom(values), 20, config);
    expect(test.status).toBe("NON_VALUTABILE");
    expect(test.significantWithinRun).toBe(false);
    expect(test.quality.invalidReasonCounts.length).toBeGreaterThan(0);
    const combined = combineHardenedEvidence([test]);
    expect(combined.status).toBe("NON_VALUTABILE");
    expect(combined.tests).toBe(0);
  });

  it("returns NON_VALUTABILE when the valid surrogate count is below the minimum", () => {
    const pair = independentPair(99, 100, { phi: 0 }, { phi: 0 });
    const test = runHardenedSurrogateNullTest("low-b", 1,
      pointsFrom(pair.a), pointsFrom(pair.b), 20, { ...config, surrogates: 19 });
    expect(test.quality.minimumValidSurrogates).toBe(30);
    expect(test.status).toBe("NON_VALUTABILE");
  });

  it("computes Wilson intervals and discrete-grid KS distances", () => {
    expect(wilsonInterval(50, 1000).low).toBeLessThan(0.05);
    expect(wilsonInterval(50, 1000).high).toBeGreaterThan(0.05);
    const grid = Array.from({ length: 50 }, (_, index) => (index + 1) / 50);
    expect(ksDistanceDiscrete(grid, 49)).toBeCloseTo(0, 10);
    const shifted = grid.map((value) => Math.min(1, value + 0.04));
    expect(ksDistanceDiscrete(shifted, 49)).toBeGreaterThan(0);
  });

  it("applies predefined FPR acceptance limits", () => {
    const good = summarizeFpr(
      Array.from({ length: 1000 }, (_, index) => (index + 1) / 1000), 0.05, 0, 49);
    expect(good.falsePositiveRate).toBeCloseTo(0.049, 6);
    expect(evaluateFprCell(good).accepted).toBe(true);
    const bad = summarizeFpr(
      Array.from({ length: 1000 }, (_, index) => (index + 1) / 1000).map((value) => value * 0.5),
      0.05, 0, 49);
    expect(evaluateFprCell(bad).accepted).toBe(false);
  });

  it("implements Holm and BH adjustments with known outputs", () => {
    expect(holmAdjust([0.01, 0.02, 0.03, 0.04])).toEqual([0.04, 0.06, 0.06, 0.06]);
    benjaminiHochbergAdjust([0.01, 0.02, 0.03, 0.04])
      .forEach((value) => expect(value).toBeCloseTo(0.04, 10));
    const adjusted = adjustFamily([
      { id: "a", rawP: 0.01 },
      { id: "b", rawP: 0.04 },
    ], "holm", 0.05);
    expect(adjusted.every((entry) => entry.rejected)).toBe(true);
  });
});
