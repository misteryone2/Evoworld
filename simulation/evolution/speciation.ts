import type { Genome, Organism, SpeciesRecord } from "../../types";
import { Random } from "../core/random";
import { averageGenome, geneticDistance, SPECIATION_DISTANCE_THRESHOLD } from "../biology/genome";

/**
 * Minimum average geographic separation (in grid cells) required between
 * two genetically diverged clusters before they are recognized as a real
 * species split. This keeps "geographically separated populations can
 * diverge" a real, checked property of a speciation event: a genetic split
 * that is spatially indistinguishable (both emerging genotypes living
 * interleaved everywhere) is treated as ordinary standing variation within
 * one species, not as a new species.
 */
const MIN_GEOGRAPHIC_SEPARATION = 4;

/**
 * A species is only considered for speciation once it has at least this
 * many individuals on each side of a potential split — small, noisy
 * subgroups should not spawn a "new species" every tick.
 */
export const MIN_SPECIATION_POPULATION = 8;

/**
 * Speciation is a relatively expensive check (it clusters every species'
 * population), so it does not run every tick — only periodically, which
 * also gives populations time to actually accumulate genetic drift between
 * checks rather than being evaluated on transient noise.
 */
export const SPECIATION_CHECK_INTERVAL = 200;

/** Creates the initial registry containing only the founding species. */
export function initializeSpeciesRegistry(
  rootSpeciesId: number,
  population: number,
  originGenomeSnapshot: Genome,
): Map<number, SpeciesRecord> {
  const registry = new Map<number, SpeciesRecord>();
  registry.set(rootSpeciesId, {
    speciesId: rootSpeciesId,
    parentSpeciesId: null,
    originTick: 0,
    originYear: 0,
    population,
    alive: true,
    extinctionTick: null,
    originGenomeSnapshot,
  });
  return registry;
}

/**
 * Picks two seed organisms to initialize k-means by finding the most
 * genetically distant pair within a random sample. Two arbitrary random
 * picks can land in the same underlying subgroup by chance (especially
 * with only two real clusters present), which produces a degenerate
 * "everyone in one cluster" split; seeding from a distant pair reliably
 * anchors k-means near the true structure, when one exists.
 */
function pickFarSeeds(members: Organism[], rng: Random): [Organism, Organism] {
  const sampleSize = Math.min(40, members.length);
  const sample: Organism[] = Array.from({ length: sampleSize }, () => rng.pick(members));

  let bestA = sample[0];
  let bestB = sample[1] ?? sample[0];
  let bestDistance = -1;
  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      const d = geneticDistance(sample[i].genome, sample[j].genome);
      if (d > bestDistance) {
        bestDistance = d;
        bestA = sample[i];
        bestB = sample[j];
      }
    }
  }
  return [bestA, bestB];
}

/**
 * Splits a group of organisms into two clusters using a small, fixed
 * number of Lloyd's-algorithm (k-means, k=2) iterations over their
 * *normalized genomes*.
 *
 * Clustering in genome space (rather than on raw map position) is what
 * lets the check actually find real phenotypic divergence: with
 * populations of thousands of individuals, splitting by position first and
 * only then averaging genomes tends to wash out real genetic structure via
 * the law of large numbers, even when strong variation exists elsewhere in
 * trait space. Geographic separation is checked afterward, on the clusters
 * this method finds (see geographicSeparation), as a requirement for
 * recognizing the split as a new species rather than as the clustering
 * mechanism itself.
 */
function clusterByGenome(members: Organism[], rng: Random): [Organism[], Organism[]] {
  const [seedA, seedB] = pickFarSeeds(members, rng);
  let centroidA = seedA.genome;
  let centroidB = seedB.genome;

  let clusterA: Organism[] = members;
  let clusterB: Organism[] = [];

  for (let iteration = 0; iteration < 6; iteration++) {
    const nextA: Organism[] = [];
    const nextB: Organism[] = [];
    for (const o of members) {
      const dA = geneticDistance(o.genome, centroidA);
      const dB = geneticDistance(o.genome, centroidB);
      if (dA <= dB) nextA.push(o);
      else nextB.push(o);
    }
    if (nextA.length === 0 || nextB.length === 0) break; // degenerate split, stop early
    clusterA = nextA;
    clusterB = nextB;
    const meanA = averageGenome(clusterA.map((o) => o.genome));
    const meanB = averageGenome(clusterB.map((o) => o.genome));
    if (!meanA || !meanB) break;
    centroidA = meanA;
    centroidB = meanB;
  }

  return [clusterA, clusterB];
}

function meanPosition(group: Organism[]): { x: number; y: number } {
  let sumX = 0;
  let sumY = 0;
  for (const o of group) {
    sumX += o.position.x;
    sumY += o.position.y;
  }
  return { x: sumX / group.length, y: sumY / group.length };
}

/** Distance between the average geographic position of two organism clusters. */
function geographicSeparation(clusterA: Organism[], clusterB: Organism[]): number {
  const posA = meanPosition(clusterA);
  const posB = meanPosition(clusterB);
  const dx = posA.x - posB.x;
  const dy = posA.y - posB.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Examines every currently-living species and checks whether its population
 * has split into two genetically distinct clusters that are also
 * geographically separated. If so, the smaller cluster is spun off as a
 * brand-new species: it receives a fresh speciesId, and a SpeciesRecord is
 * created that preserves the link to its parent species (parentSpeciesId)
 * and the tick/year of origin.
 *
 * This never runs on speciesId equality: divergence is measured purely from
 * genetic distance between the two clusters' average genomes (plus a
 * geographic-separation check), so whether a split actually happens is an
 * emergent property of how much the population has drifted, not an
 * arbitrary rule tied to a label.
 */
export function attemptSpeciation(
  organisms: Organism[],
  registry: Map<number, SpeciesRecord>,
  tick: number,
  year: number,
  rng: Random,
  nextSpeciesId: () => number,
): SpeciesRecord[] {
  const bySpecies = new Map<number, Organism[]>();
  for (const o of organisms) {
    if (!o.alive) continue;
    const list = bySpecies.get(o.speciesId);
    if (list) list.push(o);
    else bySpecies.set(o.speciesId, [o]);
  }

  const newRecords: SpeciesRecord[] = [];

  for (const [speciesId, members] of bySpecies) {
    if (members.length < MIN_SPECIATION_POPULATION * 2) continue;

    const [clusterA, clusterB] = clusterByGenome(members, rng);
    if (clusterA.length < MIN_SPECIATION_POPULATION || clusterB.length < MIN_SPECIATION_POPULATION) continue;

    const centroidA = averageGenome(clusterA.map((o) => o.genome));
    const centroidB = averageGenome(clusterB.map((o) => o.genome));
    if (!centroidA || !centroidB) continue;

    if (geneticDistance(centroidA, centroidB) < SPECIATION_DISTANCE_THRESHOLD) continue;
    if (geographicSeparation(clusterA, clusterB) < MIN_GEOGRAPHIC_SEPARATION) continue;

    // The smaller cluster splits off; the larger keeps the ancestral
    // speciesId, so a species' identity persists through its majority
    // lineage rather than always being replaced.
    const splitting = clusterA.length <= clusterB.length ? clusterA : clusterB;
    const splittingCentroid = clusterA.length <= clusterB.length ? centroidA : centroidB;
    const newId = nextSpeciesId();
    for (const o of splitting) o.speciesId = newId;

    const record: SpeciesRecord = {
      speciesId: newId,
      parentSpeciesId: speciesId,
      originTick: tick,
      originYear: year,
      population: splitting.length,
      alive: true,
      extinctionTick: null,
      originGenomeSnapshot: splittingCentroid,
    };
    registry.set(newId, record);
    newRecords.push(record);
  }

  return newRecords;
}

/**
 * Recomputes each registered species' current population from the living
 * organism list, and marks any species whose population has just dropped
 * to zero as extinct (recording the tick it happened). Extinct species are
 * never removed from the registry — they remain in the history so the full
 * genealogy, including dead branches, stays reconstructable.
 */
export function updateSpeciesPopulations(
  organisms: Organism[],
  registry: Map<number, SpeciesRecord>,
  tick: number,
): void {
  const counts = new Map<number, number>();
  for (const o of organisms) {
    if (!o.alive) continue;
    counts.set(o.speciesId, (counts.get(o.speciesId) ?? 0) + 1);
  }

  for (const record of registry.values()) {
    const population = counts.get(record.speciesId) ?? 0;
    record.population = population;
    if (population === 0 && record.alive) {
      record.alive = false;
      record.extinctionTick = tick;
    }
  }
}
