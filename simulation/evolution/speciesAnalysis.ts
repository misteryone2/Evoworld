import type { Genome, Organism, SpeciesDistance, SpeciesGenomeStats, SpeciesHabitat, SpeciesRecord, TerrainType } from "../../types";
import type { Planet } from "../planet/planet";
import { environmentalFitness } from "../biology/environment";
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
 * - habitat (v1.4.0, only when a planet is given): which biomes the
 *   species' individuals currently stand on and how well their genomes fit
 *   those cells — the observable side of adaptation to biomes.
 */
export function computeSpeciesGenomeStats(
  organisms: Organism[],
  registry: Map<number, SpeciesRecord>,
  planet?: Planet,
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

  const habitats = planet ? computeHabitats(organisms, planet) : null;

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
      ...(habitats?.has(speciesId) ? { habitat: habitats.get(speciesId) } : {}),
    });
  }

  return result;
}

/** v1.4.0 — per-species biome shares and mean fitness, from the cell each living organism currently occupies. */
function computeHabitats(organisms: Organism[], planet: Planet): Map<number, SpeciesHabitat> {
  const acc = new Map<number, { count: number; fitnessSum: number; byBiome: Map<TerrainType, number> }>();
  for (const o of organisms) {
    if (!o.alive) continue;
    const cell = planet.getCell(Math.round(o.position.x) % planet.width, Math.round(o.position.y) % planet.height);
    let entry = acc.get(o.speciesId);
    if (!entry) {
      entry = { count: 0, fitnessSum: 0, byBiome: new Map() };
      acc.set(o.speciesId, entry);
    }
    entry.count++;
    entry.fitnessSum += environmentalFitness(o.genome, cell);
    entry.byBiome.set(cell.terrain, (entry.byBiome.get(cell.terrain) ?? 0) + 1);
  }

  const result = new Map<number, SpeciesHabitat>();
  for (const [speciesId, entry] of acc) {
    const biomeShares: Partial<Record<TerrainType, number>> = {};
    let dominantBiome: TerrainType = "plains";
    let best = -1;
    for (const [biome, n] of entry.byBiome) {
      biomeShares[biome] = n / entry.count;
      if (n > best) {
        best = n;
        dominantBiome = biome;
      }
    }
    result.set(speciesId, { dominantBiome, biomeShares, meanFitness: entry.fitnessSum / entry.count });
  }
  return result;
}
