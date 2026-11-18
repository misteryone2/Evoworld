import { describe, expect, it } from "vitest";
import {
  areaUnderCurve,
  baselineBefore,
  bestCrossCorrelation,
  crossCorrelation,
  lag1Autocorrelation,
  linearTrend,
  oscillationMetrics,
  returnTime,
  sampleSeries,
  type Point,
} from "../../tools/e2/timeseries";
import { makeRun, samplesFromPopulations } from "./fixtures";

describe("E2 timeseries", () => {
  it("extracts numeric series from E1 samples", () => {
    const run = makeRun("test", 1, samplesFromPopulations([10, 12, 14]));
    expect(sampleSeries(run, "population").map((p) => p.tick)).toEqual([0, 10, 20]);
    expect(sampleSeries(run, "population").map((p) => p.value)).toEqual([10, 12, 14]);
  });

  it("computes lag-1 autocorrelation", () => {
    expect(lag1Autocorrelation([1, 2, 1, 2, 1, 2])).toBeCloseTo(-1, 5);
    expect(lag1Autocorrelation([1, 2, 3, 4, 5])).toBeGreaterThan(0.5);
    expect(lag1Autocorrelation([1])).toBeNull();
  });

  it("computes linear trend", () => {
    const trend = linearTrend([
      { tick: 0, value: 0 },
      { tick: 10, value: 10 },
      { tick: 20, value: 20 },
    ]);
    expect(trend.slope).toBeCloseTo(1, 6);
    expect(trend.r2).toBeCloseTo(1, 6);
  });

  it("detects oscillation peaks and troughs", () => {
    const metrics = oscillationMetrics([
      { tick: 0, value: 0 },
      { tick: 10, value: 5 },
      { tick: 20, value: 0 },
      { tick: 30, value: 5 },
      { tick: 40, value: 0 },
    ]);
    expect(metrics.peakCount).toBe(2);
    expect(metrics.troughCount).toBe(1);
    expect(metrics.directionChanges).toBe(3);
    expect(metrics.meanPeakInterval).toBe(20);
  });

  it("finds a positive lag when b follows a", () => {
    const a: Point[] = Array.from({ length: 8 }, (_, i) => ({ tick: i * 10, value: i + 1 }));
    const b: Point[] = Array.from({ length: 8 }, (_, i) => ({
      tick: i * 10,
      value: i === 0 ? 0 : i === 1 ? 5 : i - 1,
    }));
    const entries = crossCorrelation(a, b, 20);
    const best = bestCrossCorrelation(entries);
    expect(best?.lag).toBe(20);
    expect(best?.correlation).toBeCloseTo(1, 6);
  });

  it("computes baseline, recovery time and AUC", () => {
    const points: Point[] = [
      { tick: 0, value: 10 }, { tick: 10, value: 10 }, { tick: 20, value: 10 },
      { tick: 30, value: 10 }, { tick: 40, value: 10 }, { tick: 50, value: 2 },
      { tick: 60, value: 10 }, { tick: 70, value: 10 }, { tick: 80, value: 10 },
    ];
    expect(baselineBefore(points, 50, 3)).toBe(10);
    const recovered = returnTime(points, 50, 10, 2, 3);
    expect(recovered.returnTick).toBe(60);
    expect(areaUnderCurve(points)).toBeGreaterThan(0);
  });
});
