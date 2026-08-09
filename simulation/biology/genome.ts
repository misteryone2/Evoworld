import type { Genome, TraitRanges } from "../../types";
import { Random } from "../core/random";

/**
 * Valid ranges for every heritable trait. Values are always clamped into
 * these ranges after mutation so the genome cannot drift into nonsensical
 * territory (e.g. negative size).
 */
export const TRAIT_RANGES: TraitRanges = {
  size: { min: 0.2, max: 3.0 },
  speed: { min: 0.1, max: 3.0 },
  metabolism: { min: 0.2, max: 2.5 },
  vision: { min: 1, max: 15 },
  fertility: { min: 0.05, max: 1.0 },
  lifespan: { min: 50, max: 2000 },
};

const TRAIT_NAMES = Object.keys(TRAIT_RANGES) as (keyof Genome)[];

/** How much a trait can drift per mutation, expressed as a fraction of its range. */
const MUTATION_STD_FRACTION = 0.04;

/** Probability that any single trait mutates during reproduction. */
export const MUTATION_RATE = 0.15;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Creates a random, valid initial genome (used to seed the starting population). */
export function randomGenome(rng: Random): Genome {
  const genome = {} as Genome;
  for (const trait of TRAIT_NAMES) {
    const { min, max } = TRAIT_RANGES[trait];
    genome[trait] = rng.range(min, max);
  }
  return genome;
}

/**
 * Produces a child genome from two parent genomes. Each trait is inherited
 * as the average of both parents (simple blending inheritance), then has an
 * independent chance to mutate. There is no rule that ties a trait's
 * direction to the environment: mutation direction is random, and whether a
 * mutated trait persists in the population is entirely a consequence of
 * survival and reproduction success, not of this function.
 */
export function inheritGenome(parentA: Genome, parentB: Genome, rng: Random): Genome {
  const child = {} as Genome;
  for (const trait of TRAIT_NAMES) {
    const { min, max } = TRAIT_RANGES[trait];
    let value = (parentA[trait] + parentB[trait]) / 2;
    if (rng.chance(MUTATION_RATE)) {
      const std = (max - min) * MUTATION_STD_FRACTION;
      value += rng.gaussian(0, std);
    }
    child[trait] = clamp(value, min, max);
  }
  return child;
}

/** Asexual variant (single parent), used as a fallback when no mate is available. */
export function cloneWithMutation(parent: Genome, rng: Random): Genome {
  const child = {} as Genome;
  for (const trait of TRAIT_NAMES) {
    const { min, max } = TRAIT_RANGES[trait];
    let value = parent[trait];
    if (rng.chance(MUTATION_RATE)) {
      const std = (max - min) * MUTATION_STD_FRACTION;
      value += rng.gaussian(0, std);
    }
    child[trait] = clamp(value, min, max);
  }
  return child;
}

export function averageGenome(genomes: Genome[]): Genome | null {
  if (genomes.length === 0) return null;
  const sum = {} as Genome;
  for (const trait of TRAIT_NAMES) sum[trait] = 0;
  for (const g of genomes) {
    for (const trait of TRAIT_NAMES) sum[trait] += g[trait];
  }
  const avg = {} as Genome;
  for (const trait of TRAIT_NAMES) avg[trait] = sum[trait] / genomes.length;
  return avg;
}
