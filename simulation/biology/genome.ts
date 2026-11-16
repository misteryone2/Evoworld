import type { Genome, GenomeStats, TraitName, TraitRanges } from "../../types";
import { Random } from "../core/random";
import { TRAIT_RANGES, MUTATION_RATE, MUTATION_STD_FRACTION } from "./traitRanges";
import { GENE_REGISTRY, EXTENDED_GENES, clampToGene, type GeneDefinition } from "./geneRegistry";

export { TRAIT_RANGES, MUTATION_RATE } from "./traitRanges";

const TRAIT_NAMES = Object.keys(TRAIT_RANGES) as TraitName[];


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
  // v1.11.0 — media dei geni estesi (un gene mancante vale il predefinito); assente se nessun genoma ne ha
  if (genomes.some((g) => g.ext)) {
    const ext: Record<string, number> = {};
    for (const def of EXTENDED_GENES) {
      let total = 0;
      for (const g of genomes) total += effectiveValue(g, def);
      ext[def.key] = total / genomes.length;
    }
    avg.ext = ext;
  }
  return avg;
}

/** Valore effettivo di un gene del registro (legacy: campo di primo livello; esteso: ext o predefinito). Locale per evitare cicli di importazione con genomeExt. */
function effectiveValue(g: Genome, def: GeneDefinition): number {
  if (def.category === "legacy") return (g as unknown as Record<string, number>)[def.key];
  const v = g.ext?.[def.key];
  return typeof v === "number" && Number.isFinite(v) ? clampToGene(def, v) : def.defaultValue;
}

/**
 * Per-trait descriptive statistics (mean, min, max, standard deviation)
 * across a group of genomes (v0.4.1, observability only — does not affect
 * selection, reproduction, or mutation). Standard deviation is the measure
 * of "internal variability": a species with near-zero stdDev on a trait has
 * essentially converged on that trait, while a high stdDev signals ongoing
 * standing variation that could still be a substrate for future selection
 * or speciation.
 */
export function genomeStats(genomes: Genome[]): GenomeStats | null {
  if (genomes.length === 0) return null;
  const mean = averageGenome(genomes);
  if (!mean) return null;

  const stats = {} as GenomeStats;
  for (const trait of TRAIT_NAMES) {
    let min = Infinity;
    let max = -Infinity;
    let sumSquaredDiff = 0;
    for (const g of genomes) {
      const value = g[trait];
      if (value < min) min = value;
      if (value > max) max = value;
      const diff = value - mean[trait];
      sumSquaredDiff += diff * diff;
    }
    stats[trait] = {
      mean: mean[trait],
      min,
      max,
      stdDev: Math.sqrt(sumSquaredDiff / genomes.length),
    };
  }
  return stats;
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
  // v1.11.0 — se NESSUNO dei due ha geni estesi (mondi con geni spenti, genomi v1) vale esattamente la formula della v1.10.
  if (!a.ext && !b.ext) return legacyGeneticDistance(a, b);
  return geneticDistanceV2(a, b);
}

function legacyGeneticDistance(a: Genome, b: Genome): number {
  let sumSquares = 0;
  for (const trait of TRAIT_NAMES) {
    const { min, max } = TRAIT_RANGES[trait];
    const range = max - min;
    const normalizedDiff = range > 0 ? (a[trait] - b[trait]) / range : 0;
    sumSquares += normalizedDiff * normalizedDiff;
  }
  return Math.sqrt(sumSquares / TRAIT_NAMES.length);
}

/**
 * v1.11.0 — Distanza genetica normalizzata (specifica di Vibe §5):
 *   d(a,b) = sqrt( Σ_i w_i · Δn_i² / Σ_i w_i ),  Δn_i = (a_i − b_i) / (max_i − min_i)
 * su TUTTI i geni del registro (tratti storici w = 1, geni estesi w = distanceWeight). Sta in [0, 1], è simmetrica, è 0
 * per genomi identici, e un gene mancante vale il predefinito (due genomi migrati identici non divergono).
 *
 * ATTENZIONE (misurato, vedi docs/GENOMA-v1.11.0.md): con i pesi del catalogo, a geni estesi uguali questa formula riduce
 * la distanza dei 13 tratti di un fattore sqrt(13 / (13 + Σw_estesi)) ≈ 0,74. Le soglie 0,16 e 0,26 NON sono state
 * modificate (vincolo), ma valgono quindi come ≈0,22 e ≈0,35 in termini della v1.10: da ricalibrare nella v1.12.0.
 */
export function geneticDistanceV2(a: Genome, b: Genome): number {
  let weighted = 0;
  let weights = 0;
  for (const def of GENE_REGISTRY) {
    const range = def.max - def.min;
    if (range <= 0) continue;
    const diff = (effectiveValue(a, def) - effectiveValue(b, def)) / range;
    weighted += def.distanceWeight * diff * diff;
    weights += def.distanceWeight;
  }
  return weights > 0 ? Math.sqrt(weighted / weights) : 0;
}

/** Compatibilità riproduttiva con la distanza normalizzata e la soglia INVARIATA (0,16). */
export function areGeneticallyCompatibleV2(a: Genome, b: Genome): boolean {
  return geneticDistanceV2(a, b) <= MATE_COMPATIBILITY_THRESHOLD;
}

/** Whether two organisms' genomes are close enough to interbreed. */
export function areGeneticallyCompatible(a: Genome, b: Genome): boolean {
  return geneticDistance(a, b) <= MATE_COMPATIBILITY_THRESHOLD;
}
