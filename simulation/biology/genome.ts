import type { BaseGenome, GeneMap, Genome, GenomeStats, TraitRanges } from "../../types";
import { Random } from "../core/random";
import { ADVANCED_DISTANCE_LAMBDA, CATEGORY_WEIGHTS, GENE_CATALOG, GENE_BY_ID, clampGene, geneValue, type GeneCategory } from "./geneRegistry";

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
  // Narrow (specialist) to broad (generalist) tolerance, in the same
  // units as temperature.
  //
  // v1.2.5 — max raised from 25 to 50 after a controlled sweep
  // (baseline/+25%/+50%/+75%/x2, same seeds, everything else held
  // fixed) diagnosed WHY the founding population was collapsing on most
  // seeds: genomes are generated independently of spawn position (by
  // design — see createRandomOrganism; this stays true, nothing here
  // correlates genome to biome), so a founder's environmental fitness at
  // its actual spawn cell was essentially a random pairing. Measured
  // average founder fitness at the old max was only ~0.23 (84-88% of
  // founders below 0.5), which — combined with the already-validated
  // regional carrying capacity and upkeep baseline — left almost no
  // energy margin for most founders to ever reach reproductive age. x2
  // raised average spawn fitness to ~0.425 (58% below 0.5) and was the
  // first configuration in this whole investigation where speciation was
  // observed to occur at all. This does NOT correlate genome to spawn
  // biome (still fully independent) and does NOT remove the
  // specialist/generalist tradeoff: environment.ts's peak-height formula
  // normalizes against TRAIT_RANGES.temperatureTolerance.max itself, and
  // `min` is unchanged here, so a true specialist (tolerance near 2)
  // still reaches the same maximum peak fitness (1.35) at its ideal
  // conditions as before — only how far a *generalist* can stretch
  // changed. Not a full fix on its own: extinction is still possible on
  // unlucky seeds (a sparse founding population scattered across a huge
  // world remains a genuine minimum-viable-population risk) — see
  // HANDOFF for the full v1.2 series of experiments this was validated
  // against.
  temperatureTolerance: { min: 2, max: 50 },
  preferredWater: { min: 0, max: 1 },
  // v1.2.5 — same rationale/validation as temperatureTolerance above.
  waterTolerance: { min: 0.05, max: 1.2 },
  // Capped below 1.0, same precedent as carnivory: leaving some residual
  // vulnerability/inefficiency avoids a degenerate all-or-nothing extreme.
  evasion: { min: 0, max: 0.8 },
  huntingSkill: { min: 0, max: 0.8 },
};

const TRAIT_NAMES = Object.keys(TRAIT_RANGES) as (keyof BaseGenome)[];

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
  // v1.11.0 — la media dei geni avanzati (un gene mancante vale il predefinito); assente se nessun genoma li ha
  if (genomes.some((g) => g.genes)) {
    const genes: GeneMap = {};
    for (const def of GENE_CATALOG) {
      let total = 0;
      for (const g of genomes) total += geneValue(g.genes, def.id);
      genes[def.id] = total / genomes.length;
    }
    avg.genes = genes;
  }
  return avg;
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
  let sumSquares = 0;
  for (const trait of TRAIT_NAMES) {
    const { min, max } = TRAIT_RANGES[trait];
    const range = max - min;
    const normalizedDiff = range > 0 ? (a[trait] - b[trait]) / range : 0;
    sumSquares += normalizedDiff * normalizedDiff;
  }
  const baseMeanSquare = sumSquares / TRAIT_NAMES.length;
  // v1.11.0 — senza geni avanzati (da nessuna delle due parti) la distanza è esattamente quella di prima.
  if (!a.genes && !b.genes) return Math.sqrt(baseMeanSquare);
  return Math.sqrt(baseMeanSquare + ADVANCED_DISTANCE_LAMBDA * advancedMeanSquare(a.genes, b.genes));
}

const CATEGORY_LIST = Object.keys(CATEGORY_WEIGHTS) as GeneCategory[];

/**
 * v1.11.0 — Contributo dei geni avanzati alla distanza: differenza normalizzata per l'intervallo di ciascun gene,
 * al quadrato, media pesata dentro ogni categoria, poi media tra le categorie con pesi FISSI (rinormalizzati sulle
 * categorie presenti). Aggiungere geni a una categoria non cambia la scala della distanza: ne affina la media.
 * Un gene mancante (genoma vecchio o parziale) vale il predefinito: i genomi restano confrontabili.
 */
export function advancedMeanSquare(a: Readonly<GeneMap> | undefined, b: Readonly<GeneMap> | undefined): number {
  const sums: Record<string, number> = {};
  const weights: Record<string, number> = {};
  for (const def of GENE_CATALOG) {
    const range = def.max - def.min;
    if (range <= 0) continue;
    const diff = (geneValue(a, def.id) - geneValue(b, def.id)) / range;
    sums[def.category] = (sums[def.category] ?? 0) + def.distanceWeight * diff * diff;
    weights[def.category] = (weights[def.category] ?? 0) + def.distanceWeight;
  }
  let total = 0;
  let weightTotal = 0;
  for (const c of CATEGORY_LIST) {
    if (!weights[c]) continue;
    total += CATEGORY_WEIGHTS[c] * (sums[c] / weights[c]);
    weightTotal += CATEGORY_WEIGHTS[c];
  }
  return weightTotal > 0 ? total / weightTotal : 0;
}

// ---------------------------------------------------------------------------------------------------------------
// v1.11.0 — Geni avanzati: assegnazione ai fondatori, ereditarietà, mutazione, migrazione, validazione.
// ---------------------------------------------------------------------------------------------------------------

/** Deviazione dei fondatori attorno al valore predefinito, come frazione di metà intervallo: variazione di partenza, non estremi casuali. */
export const FOUNDER_GENE_SPREAD = 0.25;

/**
 * Generatore SEPARATO per i geni avanzati: si ricava dallo stato del generatore del mondo e da un sale (id), senza
 * consumare numeri dal generatore del mondo. Così i flussi casuali della simulazione restano quelli della v1.10 e i
 * confronti con e senza geni avanzati sono puliti; resta deterministico dal seme.
 */
export function deriveGeneRandom(worldRngState: number, salt: number): Random {
  let h = Math.imul((worldRngState ^ 0x9e3779b9) | 0, 0x85ebca6b) ^ Math.imul((salt | 0) + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return new Random(h >>> 0);
}

/** Geni di un fondatore: attorno al valore neutro, dentro l'intervallo. */
export function founderGenes(rng: Random): GeneMap {
  const genes: GeneMap = {};
  for (const def of GENE_CATALOG) {
    const half = (def.max - def.min) / 2;
    genes[def.id] = clampGene(def, def.default + (rng.next() * 2 - 1) * FOUNDER_GENE_SPREAD * half);
  }
  return genes;
}

/** Geni di un figlio: media dei genitori (un gene mancante vale il predefinito), poi mutazione indipendente per gene. */
export function inheritGenes(parentA: Genome, parentB: Genome, rng: Random): GeneMap {
  const genes: GeneMap = {};
  for (const def of GENE_CATALOG) {
    let value = (geneValue(parentA.genes, def.id) + geneValue(parentB.genes, def.id)) / 2;
    if (rng.chance(MUTATION_RATE)) value += rng.gaussian(0, (def.max - def.min) * def.mutationStd);
    genes[def.id] = clampGene(def, value);
  }
  return genes;
}

/** Variante asessuata (un solo genitore). */
export function cloneGenes(parent: Genome, rng: Random): GeneMap {
  return inheritGenes(parent, parent, rng);
}

/**
 * Migrazione (idempotente): restituisce un genoma con i 13 tratti di base invariati e tutti i geni avanzati presenti.
 * Geni mancanti → valore predefinito; valori non validi → predefinito; fuori intervallo → riportati nell'intervallo;
 * geni sconosciuti (di una versione futura) → conservati senza modifiche. Non modifica l'argomento.
 */
export function migrateGenome(genome: Genome): Genome {
  const out = { ...genome } as Genome;
  for (const trait of TRAIT_NAMES) {
    const v = out[trait];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      const { min, max } = TRAIT_RANGES[trait];
      out[trait] = (min + max) / 2;
    }
  }
  const genes: GeneMap = { ...(genome.genes ?? {}) };
  for (const def of GENE_CATALOG) genes[def.id] = geneValue(genome.genes, def.id);
  out.genes = genes;
  return out;
}

/** Elenco dei problemi di un genoma (vuoto = valido): tratti di base fuori intervallo e geni avanzati non validi. */
export function validateGenome(genome: Genome): string[] {
  const problems: string[] = [];
  for (const trait of TRAIT_NAMES) {
    const v = genome[trait];
    const { min, max } = TRAIT_RANGES[trait];
    if (typeof v !== "number" || !Number.isFinite(v)) problems.push(`${trait}: non è un numero`);
    else if (v < min || v > max) problems.push(`${trait}: ${v} fuori dall'intervallo [${min}, ${max}]`);
  }
  if (genome.genes) {
    for (const [id, v] of Object.entries(genome.genes)) {
      const def = GENE_BY_ID.get(id);
      if (!def) continue; // gene sconosciuto: si conserva
      if (typeof v !== "number" || !Number.isFinite(v)) problems.push(`${id}: non è un numero`);
      else if (v < def.min || v > def.max) problems.push(`${id}: ${v} fuori dall'intervallo [${def.min}, ${def.max}]`);
    }
  }
  return problems;
}

/** Statistiche descrittive dei geni avanzati su un gruppo di genomi (osservabilità e esperimenti; non influisce sulla simulazione). */
export function advancedGeneStats(genomes: Genome[]): Record<string, { mean: number; min: number; max: number; stdDev: number }> | null {
  if (genomes.length === 0) return null;
  const out: Record<string, { mean: number; min: number; max: number; stdDev: number }> = {};
  for (const def of GENE_CATALOG) {
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const g of genomes) {
      const v = geneValue(g.genes, def.id);
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const mean = sum / genomes.length;
    let sq = 0;
    for (const g of genomes) {
      const d = geneValue(g.genes, def.id) - mean;
      sq += d * d;
    }
    out[def.id] = { mean, min, max, stdDev: Math.sqrt(sq / genomes.length) };
  }
  return out;
}

/** Whether two organisms' genomes are close enough to interbreed. */
export function areGeneticallyCompatible(a: Genome, b: Genome): boolean {
  return geneticDistance(a, b) <= MATE_COMPATIBILITY_THRESHOLD;
}
