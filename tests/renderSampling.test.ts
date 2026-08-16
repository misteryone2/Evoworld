import { describe, it, expect } from "vitest";
import { computeRenderStride, estimateRenderedCount } from "../lib/renderSampling";

describe("computeRenderStride", () => {
  it("is 1 when population is at or below the target", () => {
    expect(computeRenderStride(1000, 4000)).toBe(1);
    expect(computeRenderStride(4000, 4000)).toBe(1);
  });

  it("is 1 for zero population", () => {
    expect(computeRenderStride(0, 4000)).toBe(1);
  });

  it("computes the smallest stride that brings the population down to roughly the target", () => {
    expect(computeRenderStride(10000, 4000)).toBe(3); // ceil(10000/4000)
    expect(computeRenderStride(8000, 4000)).toBe(2);
    expect(computeRenderStride(40000, 4000)).toBe(10);
  });

  it("is defensively 1 for a non-positive target (avoids division degeneracy)", () => {
    expect(computeRenderStride(10000, 0)).toBe(1);
    expect(computeRenderStride(10000, -5)).toBe(1);
  });

  it("increases monotonically as population grows for a fixed target", () => {
    const a = computeRenderStride(5000, 1000);
    const b = computeRenderStride(50000, 1000);
    expect(b).toBeGreaterThan(a);
  });
});

describe("estimateRenderedCount", () => {
  it("equals population when stride is 1", () => {
    expect(estimateRenderedCount(1234, 1)).toBe(1234);
  });

  it("stays close to (at or slightly above) population/stride", () => {
    const count = estimateRenderedCount(10000, 3);
    expect(count).toBe(Math.ceil(10000 / 3));
  });

  it("combined with computeRenderStride, keeps the rendered count near the target for large populations", () => {
    const population = 57000;
    const target = 4000;
    const stride = computeRenderStride(population, target);
    const rendered = estimateRenderedCount(population, stride);
    expect(rendered).toBeGreaterThanOrEqual(target * 0.5);
    expect(rendered).toBeLessThanOrEqual(target * 1.5);
  });
});
