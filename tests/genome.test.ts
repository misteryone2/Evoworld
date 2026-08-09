import { describe, it, expect } from "vitest";
import { Random } from "../simulation/core/random";
import { randomGenome, inheritGenome, TRAIT_RANGES } from "../simulation/biology/genome";
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
