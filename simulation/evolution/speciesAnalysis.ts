import type { Genome, Organism, SpeciesDistance, SpeciesGenomeStats, SpeciesRecord } from "../../types";
import { averageGenome, geneticDistance, genomeStats } from "../biology/genome";

/**
 * Computes full genetic analysis for every currently-alive species
 * (v0.4.1). This is pure observability: it reads organism genomes and the
 * species registry, and produces derived statistics, but never mutates
 * anything or feeds back into selection/reproduction/mutation.
 *
 * - genomeStats: current mean/min/max/stdDev per trait, i.e. "what does
 *   this species look like right now, and how much internal variability
 *   does it still have".
 * - distanceFromParentOrigin: genetic distance between the species' current
 *   average genome and its parent's origin snapshot (the parent's average
 *   genome at the moment of the split) — total drift accumulated since
 *   speciation. null for a founding species with no parent.
 * - distanceFromOtherSpecies: genetic distance from this species' current
 *   average genome to every other currently-alive species' current average
 *   genome, for cross-species comparison.
 */
export function computeSpeciesGenomeStats(
  organisms: Organism[],
  registry: Map<number, SpeciesRecord>,
): SpeciesGenomeStats[] {
  const genomesBySpecies = new Map<number, Genome[]>();
  for (const o of organisms) {
    if (!o.alive) continue;
    const list = genomesBySpecies.get(o.speciesId);
    if (list) list.push(o.genome);
    else genomesBySpecies.set(o.speciesId, [o.genome]);
  }

  // Current average genome per living species, needed for cross-species comparison.
  const currentAverages = new Map<number, Genome>();
  for (const [speciesId, genomes] of genomesBySpecies) {
    const avg = averageGenome(genomes);
    if (avg) currentAverages.set(speciesId, avg);
  }

  const result: SpeciesGenomeStats[] = [];

  for (const [speciesId, genomes] of genomesBySpecies) {
    const stats = genomeStats(genomes);
    if (!stats) continue;

    const record = registry.get(speciesId);
    const parentId = record?.parentSpeciesId ?? null;
    const parentRecord = parentId !== null ? registry.get(parentId) : undefined;
    const currentAvg = currentAverages.get(speciesId);

    const distanceFromParentOrigin =
      parentRecord && currentAvg ? geneticDistance(currentAvg, parentRecord.originGenomeSnapshot) : null;

    const distanceFromOtherSpecies: SpeciesDistance[] = [];
    if (currentAvg) {
      for (const [otherId, otherAvg] of currentAverages) {
        if (otherId === speciesId) continue;
        distanceFromOtherSpecies.push({ speciesId: otherId, distance: geneticDistance(currentAvg, otherAvg) });
      }
      distanceFromOtherSpecies.sort((a, b) => a.distance - b.distance);
    }

    result.push({
      speciesId,
      population: genomes.length,
      genomeStats: stats,
      distanceFromParentOrigin,
      distanceFromOtherSpecies,
    });
  }

  return result;
}
