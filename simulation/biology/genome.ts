import type { Genome, TraitRanges } from "../../types";
import { Random } from "../core/random";

/**
 * Valid ranges for every heritable trait. Values are always clamped into
 * these ranges after mutation so the genome cannot drift into nonsensical
 * territory (e.g. negative size).
 *
 * carnivory's max is capped at 0.85, not 1.0 (v0.3): if genetic drift ever
 * fixed the *entire* population at carnivory = 1, no organism could hunt
 * any other (prey must have strictly lower carnivory) or get any energy
 * from vegetation — a fatal absorbing state discovered during testing. The
 * cap guarantees a small vegetation fallback always remains available.
 */
export const TRAIT_RANGES: TraitRanges = {
  size: { min: 0.2, max: 3.0 },
  speed: { min: 0.1, max: 3.0 },
  metabolism: { min: 0.2, max: 2.5 },
  vision: { min: 1, max: 15 },
  fertility: { min: 0.05, max: 1.0 },
  lifespan: { min: 50, max: 2000 },
  carnivory: { min: 0, max: 0.85 },
  // Matches the planet's realistic temperature spread (see planet.ts:
  // 32 - latitude*40 - elevation*10 +- noise, roughly -18..34).
  preferredTemperature: { min: -15, max: 34 },
  // Narrow (specialist) to broad (generalist) tolerance, in the same units as temperature.
  temperatureTolerance: { min: 2, max: 25 },
  preferredWater: { min: 0, max: 1 },
  waterTolerance: { min: 0.05, max: 0.6 },
};

const TRAIT_NAMES = Object.keys(TRAIT_RANGES) as (keyof Genome)[];

/** How much a trait can drift per mutation, expressed as a fraction of its range. */
const MUTATION_STD_FRACTION = 0.04;

/** Probability that any single trait mutates during reproduction. */
export const MUTATION_RATE = 0.15;

/**
 * Genetic distance threshold below which two organisms are considered
 * reproductively compatible, regardless of their current speciesId label.
 * This is what makes speciation an emergent consequence of accumulated
 * genetic drift rather than an arbitrary rule tied to a label: two
 * organisms with the same speciesId that have drifted too far apart will
 * stop being able to interbreed, and conversely two organisms that still
 * happen to be genetically close remain compatible even right after a
 * species split.
 */
export const MATE_COMPATIBILITY_THRESHOLD = 0.16;

/**
 * Genetic distance threshold above which two diverging sub-populations are
 * considered distinct enough to be recognized as separate species. Kept
 * comfortably above MATE_COMPATIBILITY_THRESHOLD so that a freshly split
 * species is, by construction, already reproductively isolated from its
 * parent population.
 */
export const SPECIATION_DISTANCE_THRESHOLD = 0.26;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Creates a random, valid initial genome (used to seed the starting population). */
export function randomGenome(rng: Random): Genome {
  const genome = {} as Genome;
  for (const trait of TRAIT_NAMES) {
    const { min, max } = TRAIT_RANGES[trait];
    if (trait === "carnivory") {
      // Bias the initial population toward herbivory (squaring a uniform
      // sample skews it toward 0). This mirrors how real food chains
      // bootstrap: a population cannot start out mostly predators with no
      // prey base to hunt. Higher carnivory is still fully reachable — and
      // can spread through the population — via mutation and selection
      // over subsequent generations, once there is something to hunt.
      const u = rng.next();
      genome[trait] = min + (max - min) * (u * u);
    } else {
      genome[trait] = rng.range(min, max);
    }
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

/**
 * Normalized genetic distance between two genomes, in roughly [0, 1].
 *
 * Each trait's absolute difference is normalized by that trait's valid
 * range (so traits with very different natural scales, like lifespan vs.
 * fertility, contribute comparably), then combined as a Euclidean distance
 * and averaged across the number of traits. Identical genomes have distance
 * 0; genomes at opposite ends of every trait range approach distance 1.
 */
export function geneticDistance(a: Genome, b: Genome): number {
  let sumSquares = 0;
  for (const trait of TRAIT_NAMES) {
    const { min, max } = TRAIT_RANGES[trait];
    const range = max - min;
    const normalizedDiff = range > 0 ? (a[trait] - b[trait]) / range : 0;
    sumSquares += normalizedDiff * normalizedDiff;
  }
  return Math.sqrt(sumSquares / TRAIT_NAMES.length);
}

/** Whether two organisms' genomes are close enough to interbreed. */
export function areGeneticallyCompatible(a: Genome, b: Genome): boolean {
  return geneticDistance(a, b) <= MATE_COMPATIBILITY_THRESHOLD;
}
