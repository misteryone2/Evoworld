import { describe, it, expect } from "vitest";
import { pickNearestOrganism } from "../lib/canvasPicking";

const xs = [10, 50, 100];
const ys = [10, 50, 100];
const ids = [1, 2, 3];

describe("v1.6.0 — picking a creature on the 2D map", () => {
  it("returns the nearest creature within reach", () => {
    expect(pickNearestOrganism(xs, ys, ids, 51, 49, 256, 256, 5)).toBe(2);
  });

  it("returns null when nothing is close enough", () => {
    expect(pickNearestOrganism(xs, ys, ids, 200, 200, 256, 256, 5)).toBeNull();
  });

  it("picks the closer of two creatures", () => {
    expect(pickNearestOrganism([20, 24], [20, 20], [7, 8], 23, 20, 256, 256, 10)).toBe(8);
  });

  it("sees creatures across the wrapped edge of the planet", () => {
    expect(pickNearestOrganism([254], [128], [9], 1, 128, 256, 256, 5)).toBe(9);
  });

  it("handles an empty population", () => {
    expect(pickNearestOrganism([], [], [], 5, 5, 256, 256, 5)).toBeNull();
  });
});
