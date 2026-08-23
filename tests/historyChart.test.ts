import { describe, it, expect } from "vitest";
import { computeChartPoints, pointsToPolyline } from "../lib/historyChart";

describe("computeChartPoints", () => {
  it("returns an empty array for an empty series", () => {
    expect(computeChartPoints([], 100, 50)).toEqual([]);
  });

  it("centers a single-point series vertically", () => {
    const points = computeChartPoints([42], 100, 50);
    expect(points).toEqual([{ x: 0, y: 25 }]);
  });

  it("maps the minimum value to the bottom (y = height) and the maximum to the top (y = 0)", () => {
    const points = computeChartPoints([0, 5, 10], 100, 50);
    expect(points[0].y).toBeCloseTo(50, 5); // min -> bottom
    expect(points[2].y).toBeCloseTo(0, 5); // max -> top
  });

  it("spaces x coordinates evenly across the full width, first at 0 and last at width", () => {
    const points = computeChartPoints([1, 2, 3, 4], 90, 50);
    expect(points[0].x).toBe(0);
    expect(points[3].x).toBe(90);
    expect(points[1].x).toBeCloseTo(30, 5);
    expect(points[2].x).toBeCloseTo(60, 5);
  });

  it("centers a flat (all-equal-value) series vertically instead of dividing by zero", () => {
    const points = computeChartPoints([7, 7, 7], 100, 50);
    for (const p of points) {
      expect(p.y).toBeCloseTo(25, 5);
    }
  });

  it("preserves the number of input values", () => {
    const values = [1, 4, 2, 8, 5, 7];
    expect(computeChartPoints(values, 200, 80)).toHaveLength(values.length);
  });
});

describe("pointsToPolyline", () => {
  it("formats points as space-separated x,y pairs", () => {
    const result = pointsToPolyline([
      { x: 0, y: 10 },
      { x: 5.5, y: 2.25 },
    ]);
    expect(result).toBe("0.00,10.00 5.50,2.25");
  });

  it("returns an empty string for no points", () => {
    expect(pointsToPolyline([])).toBe("");
  });
});
