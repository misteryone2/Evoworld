import { describe, expect, it } from "vitest";
import { computeSpeciesGenomeStats } from "../simulation/evolution/speciesAnalysis";
import { initializeSpeciesRegistry } from "../simulation/evolution/speciation";
import { createOrganism } from "../simulation/biology/organism";
import { TRAIT_RANGES } from "../simulation/biology/genome";
import type { Genome, SpeciesRecord } from "../types";

const lowGenome: Genome = {
  size: TRAIT_RANGES.size.min,
  speed: TRAIT_RANGES.speed.min,
  metabolism: TRAIT_RANGES.metabolism.min,
  vision: TRAIT_RANGES.vision.min,
  fertility: TRAIT_RANGES.fertility.min,
  lifespan: TRAIT_RANGES.lifespan.min,
  carnivory: TRAIT_RANGES.carnivory.min,
  preferredTemperature: TRAIT_RANGES.preferredTemperature.min,
  temperatureTolerance: TRAIT_RANGES.temperatureTolerance.min,
  preferredWater: TRAIT_RANGES.preferredWater.min,
  waterTolerance: TRAIT_RANGES.waterTolerance.min,
  evasion: TRAIT_RANGES.evasion.min,
  huntingSkill: TRAIT_RANGES.huntingSkill.min,
};

const highGenome: Genome = {
  size: TRAIT_RANGES.size.max,
  speed: TRAIT_RANGES.speed.max,
  metabolism: TRAIT_RANGES.metabolism.max,
  vision: TRAIT_RANGES.vision.max,
  fertility: TRAIT_RANGES.fertility.max,
  lifespan: TRAIT_RANGES.lifespan.max,
  carnivory: TRAIT_RANGES.carnivory.max,
  preferredTemperature: TRAIT_RANGES.preferredTemperature.max,
  temperatureTolerance: TRAIT_RANGES.temperatureTolerance.max,
  preferredWater: TRAIT_RANGES.preferredWater.max,
  waterTolerance: TRAIT_RANGES.waterTolerance.max,
  evasion: TRAIT_RANGES.evasion.max,
  huntingSkill: TRAIT_RANGES.huntingSkill.max,
};

describe("computeSpeciesGenomeStats", () => {
  it("returns nothing for a species with no living organisms", () => {
    const registry = initializeSpeciesRegistry(1, 0, lowGenome);
    const result = computeSpeciesGenomeStats([], registry);
    expect(result).toHaveLength(0);
  });

  it("computes genomeStats and null parent distance for a founding species", () => {
    const registry = initializeSpeciesRegistry(1, 2, lowGenome);
    const organisms = [
      createOrganism(1, 1, 0, 0, { ...lowGenome }),
      createOrganism(2, 1, 1, 1, { ...lowGenome }),
    ];
    const result = computeSpeciesGenomeStats(organisms, registry);
    expect(result).toHaveLength(1);
    expect(result[0].speciesId).toBe(1);
    expect(result[0].population).toBe(2);
    expect(result[0].distanceFromParentOrigin).toBeNull();
    expect(result[0].distanceFromOtherSpecies).toHaveLength(0);
    expect(result[0].genomeStats.size.mean).toBeCloseTo(lowGenome.size, 10);
  });

  it("only reports currently-alive species, skipping dead organisms", () => {
    const registry = initializeSpeciesRegistry(1, 1, lowGenome);
    const dead = createOrganism(1, 1, 0, 0, { ...lowGenome });
    dead.alive = false;
    const result = computeSpeciesGenomeStats([dead], registry);
    expect(result).toHaveLength(0);
  });

  it("computes distanceFromParentOrigin as the genetic distance between current average genome and the parent's origin snapshot", () => {
    const registry = initializeSpeciesRegistry(1, 2, lowGenome);
    // Species 2 split off from species 1 (whose origin snapshot is lowGenome)
    // and has since drifted to a high-genome population.
    const childRecord: SpeciesRecord = {
      speciesId: 2,
      parentSpeciesId: 1,
      originTick: 100,
      originYear: 0,
      population: 2,
      alive: true,
      extinctionTick: null,
      originGenomeSnapshot: highGenome,
    };
    registry.set(2, childRecord);

    const organisms = [
      createOrganism(1, 2, 0, 0, { ...highGenome }),
      createOrganism(2, 2, 1, 1, { ...highGenome }),
    ];
    const result = computeSpeciesGenomeStats(organisms, registry);
    const species2 = result.find((r) => r.speciesId === 2)!;
    // Current average genome (highGenome) vs. parent's (species 1) origin
    // snapshot (lowGenome, set by initializeSpeciesRegistry above) should be
    // close to maximum genetic distance (~1).
    expect(species2.distanceFromParentOrigin).toBeCloseTo(1, 5);
  });

  it("computes distanceFromOtherSpecies between every pair of currently-alive species, sorted ascending", () => {
    const registry = initializeSpeciesRegistry(1, 1, lowGenome);
    registry.set(2, {
      speciesId: 2,
      parentSpeciesId: 1,
      originTick: 0,
      originYear: 0,
      population: 1,
      alive: true,
      extinctionTick: null,
      originGenomeSnapshot: lowGenome,
    });
    registry.set(3, {
      speciesId: 3,
      parentSpeciesId: 1,
      originTick: 0,
      originYear: 0,
      population: 1,
      alive: true,
      extinctionTick: null,
      originGenomeSnapshot: lowGenome,
    });

    const mid: Genome = { ...lowGenome, size: (lowGenome.size + highGenome.size) / 2 };
    const organisms = [
      createOrganism(1, 1, 0, 0, { ...lowGenome }),
      createOrganism(2, 2, 0, 0, { ...mid }),
      createOrganism(3, 3, 0, 0, { ...highGenome }),
    ];
    const result = computeSpeciesGenomeStats(organisms, registry);
    const species1 = result.find((r) => r.speciesId === 1)!;
    expect(species1.distanceFromOtherSpecies).toHaveLength(2);
    // species 2 (mid) should be closer to species 1 (low) than species 3 (high) is.
    expect(species1.distanceFromOtherSpecies[0].speciesId).toBe(2);
    expect(species1.distanceFromOtherSpecies[0].distance).toBeLessThan(species1.distanceFromOtherSpecies[1].distance);
  });
});
