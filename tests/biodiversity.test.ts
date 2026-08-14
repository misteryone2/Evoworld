import { describe, it, expect } from "vitest";
import { shannonDiversityIndex } from "../lib/biodiversity";

describe("shannonDiversityIndex", () => {
  it("is 0 for an empty population list", () => {
    expect(shannonDiversityIndex([])).toBe(0);
  });

  it("is 0 when the total population is 0", () => {
    expect(shannonDiversityIndex([0, 0, 0])).toBe(0);
  });

  it("is 0 for a single species regardless of its population size", () => {
    expect(shannonDiversityIndex([100])).toBe(0);
    expect(shannonDiversityIndex([1])).toBe(0);
  });

  it("approaches ln(N) for N evenly-represented species", () => {
    expect(shannonDiversityIndex([50, 50])).toBeCloseTo(Math.log(2), 10);
    expect(shannonDiversityIndex([25, 25, 25, 25])).toBeCloseTo(Math.log(4), 10);
  });

  it("is higher for more evenly-represented species counts", () => {
    const twoSpecies = shannonDiversityIndex([50, 50]);
    const fourSpecies = shannonDiversityIndex([25, 25, 25, 25]);
    expect(fourSpecies).toBeGreaterThan(twoSpecies);
  });

  it("is lower for an uneven distribution than an even one with the same species count", () => {
    const even = shannonDiversityIndex([50, 50]);
    const uneven = shannonDiversityIndex([95, 5]);
    expect(uneven).toBeLessThan(even);
  });

  it("ignores zero-population entries without affecting the result", () => {
    const withZero = shannonDiversityIndex([50, 50, 0]);
    const withoutZero = shannonDiversityIndex([50, 50]);
    expect(withZero).toBeCloseTo(withoutZero, 10);
  });
});
