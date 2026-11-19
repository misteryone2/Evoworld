import { describe, expect, it } from "vitest";
import {
  bestCrossCorrelation,
  compareCrossCorrelations,
  detrendLinear,
  detrendedCrossCorrelation,
  pearsonCorrelation,
  type Point,
} from "../../tools/e2/timeseries";

const series = (values: number[], start = 0, step = 10): Point[] =>
  values.map((value, index) => ({ tick: start + index * step, value }));

describe("detrendLinear", () => {
  it("removes a linear trend while preserving ticks", () => {
    const input = series([5, 7, 9, 11, 13]);
    const result = detrendLinear(input);

    expect(result.original).toBe(input);
    expect(result.residuals.map((p) => p.tick)).toEqual(input.map((p) => p.tick));
    expect(result.trend.slope).toBeCloseTo(0.2, 6);
    expect(result.residuals.every((p) => Math.abs(p.value) < 1e-6)).toBe(true);
  });

  it("keeps non-linear residual structure", () => {
    const input = series([10, 22, 26, 34, 40]);
    const result = detrendLinear(input);
    expect(result.residuals.some((p) => Math.abs(p.value) > 0.1)).toBe(true);
  });
});

describe("pearsonCorrelation", () => {
  it("is bounded and aligns by tick", () => {
    const a = series([1, 2, 3, 4, 5]);
    const b = [{ tick: 10, value: 2 }, { tick: 0, value: 1 }, { tick: 30, value: 4 }, { tick: 20, value: 3 }, { tick: 40, value: 5 }];
    const r = pearsonCorrelation(a, b) as number;
    expect(r).toBeGreaterThanOrEqual(-1);
    expect(r).toBeLessThanOrEqual(1);
    expect(r).toBeCloseTo(1, 5);
  });
});

describe("compareCrossCorrelations", () => {
  it("flags a spurious correlation caused by a common trend", () => {
    const a = series([10, 20, 30, 40, 50, 60]);
    const b = series([100, 200, 300, 400, 500, 600]);

    const comparison = compareCrossCorrelations(a, b, 2);

    expect(comparison.commonTrendDetected).toBe(true);
    expect(comparison.originalAtLagZero).toBeCloseTo(1, 5);
    expect(comparison.detrendedAtLagZero).toBeNull();
    expect(comparison.spuriousTrendRisk).toBe(true);
  });

  it("preserves a lagged residual relationship after detrending", () => {
    const residualPattern = [0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2];
    const n = residualPattern.length;
    const a = series(residualPattern.map((r, i) => 100 - i + r));
    const b = series(residualPattern.map((_, i) => 200 - i + residualPattern[(i - 1 + n) % n]));

    const detrended = detrendedCrossCorrelation(a, b, 20);
    const comparison = compareCrossCorrelations(a, b, 20);
    const peak = bestCrossCorrelation(detrended);

    expect(peak).not.toBeNull();
    expect(peak?.lag).toBe(10);
    expect((peak?.correlation as number)).toBeGreaterThan(0.8);
    expect(comparison.lagSensitivity.length).toBe(41);
    expect(comparison.lagSensitivity.some((e) => e.lag === 10)).toBe(true);
  });

  it("does not flag a relationship when residuals remain correlated", () => {
    const a = series([100, 88, 82, 68, 58, 52]);
    const b = series([50, 45, 41, 34, 30, 26]);

    const comparison = compareCrossCorrelations(a, b, 1);

    expect(comparison.commonTrendDetected).toBe(true);
    expect(comparison.spuriousTrendRisk).toBe(false);
    expect(comparison.lagSensitivity.every((e) => e.delta === null || Math.abs(e.delta) <= 2)).toBe(true);
  });
});
