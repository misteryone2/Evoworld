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

  it("computes lag-1 autocorrelation within [-1, 1] even with a trend", () => {
    expect(lag1Autocorrelation([1, 2, 1, 2, 1, 2])).toBeCloseTo(-1, 5);
    const trending = lag1Autocorrelation([150, 120, 100, 80, 60, 45, 30, 25]);
    expect(trending).not.toBeNull();
    expect(trending as number).toBeGreaterThanOrEqual(-1);
    expect(trending as number).toBeLessThanOrEqual(1);
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
    const pulse = [10, 20, 30, 40, 50, 40, 30, 20, 10, 5, 3, 2];
    const a: Point[] = pulse.map((value, index) => ({ tick: index * 10, value }));
    const b: Point[] = pulse.map((value, index) => ({
      tick: index * 10,
      value: index === 0 ? 2 : pulse[index - 1],
    }));
    const entries = crossCorrelation(a, b, 40, 8);
    const best = bestCrossCorrelation(entries);
    expect(best?.lag).toBe(10);
    expect(best?.pairs).toBe(11);
    expect(best?.correlation as number).toBeGreaterThan(0.7);
  });

  it("matches a naive cross-correlation on a regular grid", () => {
    const a: Point[] = Array.from({ length: 32 }, (_, index) => ({
      tick: index * 10,
      value: 20 + 7 * Math.sin(index * 0.41) + index * 0.05,
    }));
    const b: Point[] = Array.from({ length: 32 }, (_, index) => ({
      tick: index * 10,
      value: 12 + 5 * Math.cos((index - 2) * 0.41) - index * 0.03,
    }));
    const byTick = new Map(b.map((point) => [point.tick, point.value]));
    const fast = crossCorrelation(a, b, 60, 5);
    for (const entry of fast) {
      const pairs = a.flatMap((point) => {
        const other = byTick.get(point.tick + entry.lag);
        return other === undefined ? [] : [[point.value, other] as [number, number]];
      });
      expect(entry.pairs).toBe(pairs.length);
      if (pairs.length < 5) {
        expect(entry.correlation).toBeNull();
        continue;
      }
      const meanX = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
      const meanY = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
      let sxx = 0;
      let syy = 0;
      let sxy = 0;
      for (const [x, y] of pairs) {
        sxx += (x - meanX) ** 2;
        syy += (y - meanY) ** 2;
        sxy += (x - meanX) * (y - meanY);
      }
      expect(entry.correlation).toBeCloseTo(sxy / Math.sqrt(sxx * syy), 5);
    }
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
