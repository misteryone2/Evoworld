import { describe, it, expect } from "vitest";
import { Random } from "../simulation/core/random";
import { randomGenome, inheritGenome, genomeStats, TRAIT_RANGES } from "../simulation/biology/genome";
import type { Genome } from "../types";

describe("genome heredity", () => {
  it("randomGenome always produces values within valid trait ranges", () => {
    const rng = new Random(5);
    for (let i = 0; i < 200; i++) {
      const genome = randomGenome(rng);
      for (const trait of Object.keys(TRAIT_RANGES) as (keyof Genome)[]) {
        const { min, max } = TRAIT_RANGES[trait];
        expect(genome[trait]).toBeGreaterThanOrEqual(min);
        expect(genome[trait]).toBeLessThanOrEqual(max);
      }
    }
  });

  it("child genome is close to the average of both parents when no mutation occurs", () => {
    const rng = new Random(123);
    const parentA = randomGenome(rng);
    const parentB = randomGenome(rng);
    const child = inheritGenome(parentA, parentB, rng);

    for (const trait of Object.keys(TRAIT_RANGES) as (keyof Genome)[]) {
      const expectedAvg = (parentA[trait] + parentB[trait]) / 2;
      const { min, max } = TRAIT_RANGES[trait];
      const range = max - min;
      expect(Math.abs(child[trait] - expectedAvg)).toBeLessThan(range * 0.5);
    }
  });

  it("mutation, when it occurs, keeps trait values within valid range", () => {
    const rng = new Random(77);
    for (let i = 0; i < 500; i++) {
      const parentA = randomGenome(rng);
      const parentB = randomGenome(rng);
      const child = inheritGenome(parentA, parentB, rng);
      for (const trait of Object.keys(TRAIT_RANGES) as (keyof Genome)[]) {
        const { min, max } = TRAIT_RANGES[trait];
        expect(child[trait]).toBeGreaterThanOrEqual(min);
        expect(child[trait]).toBeLessThanOrEqual(max);
      }
    }
  });

  it("produces genetic variation across many offspring (mutation is active)", () => {
    const rng = new Random(2024);
    const parentA = randomGenome(rng);
    const parentB = randomGenome(rng);
    const sizes = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const child = inheritGenome(parentA, parentB, rng);
      sizes.add(Number(child.size.toFixed(6)));
    }
    expect(sizes.size).toBeGreaterThan(1);
  });
});

describe("genomeStats (v0.4.1 — observability only)", () => {
  it("returns null for an empty group", () => {
    expect(genomeStats([])).toBeNull();
  });

  it("reports zero stdDev and min === max === mean for a single identical genome repeated", () => {
    const rng = new Random(11);
    const genome = randomGenome(rng);
    const stats = genomeStats([genome, genome, genome]);
    expect(stats).not.toBeNull();
    for (const trait of Object.keys(TRAIT_RANGES) as (keyof Genome)[]) {
      expect(stats![trait].stdDev).toBeCloseTo(0, 10);
      expect(stats![trait].min).toBeCloseTo(genome[trait], 10);
      expect(stats![trait].max).toBeCloseTo(genome[trait], 10);
      expect(stats![trait].mean).toBeCloseTo(genome[trait], 10);
    }
  });

  it("min/max/mean match hand-computed values for a small known group", () => {
    const base = randomGenome(new Random(3));
    const a: Genome = { ...base, size: 1.0 };
    const b: Genome = { ...base, size: 2.0 };
    const c: Genome = { ...base, size: 3.0 };
    const stats = genomeStats([a, b, c]);
    expect(stats!.size.min).toBe(1.0);
    expect(stats!.size.max).toBe(3.0);
    expect(stats!.size.mean).toBeCloseTo(2.0, 10);
    expect(stats!.size.stdDev).toBeCloseTo(Math.sqrt(2 / 3), 10);
  });

  it("stdDev increases as a population's internal variability increases", () => {
    const base = randomGenome(new Random(4));
    const tight: Genome[] = [
      { ...base, speed: 1.0 },
      { ...base, speed: 1.02 },
      { ...base, speed: 0.98 },
    ];
    const wide: Genome[] = [
      { ...base, speed: 0.2 },
      { ...base, speed: 1.5 },
      { ...base, speed: 2.9 },
    ];
    const tightStats = genomeStats(tight)!;
    const wideStats = genomeStats(wide)!;
    expect(wideStats.speed.stdDev).toBeGreaterThan(tightStats.speed.stdDev);
  });
});
