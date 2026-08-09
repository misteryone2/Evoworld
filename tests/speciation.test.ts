import { describe, it, expect } from "vitest";
import { Random } from "../simulation/core/random";
import {
  geneticDistance,
  areGeneticallyCompatible,
  inheritGenome,
  TRAIT_RANGES,
  MATE_COMPATIBILITY_THRESHOLD,
  SPECIATION_DISTANCE_THRESHOLD,
} from "../simulation/biology/genome";
import {
  attemptSpeciation,
  updateSpeciesPopulations,
  initializeSpeciesRegistry,
  MIN_SPECIATION_POPULATION,
} from "../simulation/evolution/speciation";
import { createOrganism } from "../simulation/biology/organism";
import type { Genome } from "../types";

const lowGenome: Genome = {
  size: TRAIT_RANGES.size.min,
  speed: TRAIT_RANGES.speed.min,
  metabolism: TRAIT_RANGES.metabolism.min,
  vision: TRAIT_RANGES.vision.min,
  fertility: TRAIT_RANGES.fertility.min,
  lifespan: TRAIT_RANGES.lifespan.min,
};

const highGenome: Genome = {
  size: TRAIT_RANGES.size.max,
  speed: TRAIT_RANGES.speed.max,
  metabolism: TRAIT_RANGES.metabolism.max,
  vision: TRAIT_RANGES.vision.max,
  fertility: TRAIT_RANGES.fertility.max,
  lifespan: TRAIT_RANGES.lifespan.max,
};

describe("geneticDistance", () => {
  it("is zero for two identical genomes", () => {
    expect(geneticDistance(lowGenome, lowGenome)).toBe(0);
  });

  it("is at its maximum for genomes at opposite ends of every trait range", () => {
    const distance = geneticDistance(lowGenome, highGenome);
    expect(distance).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(geneticDistance(lowGenome, highGenome)).toBeCloseTo(geneticDistance(highGenome, lowGenome), 10);
  });

  it("increases monotonically as a single trait diverges further", () => {
    const base: Genome = { ...lowGenome };
    const near: Genome = { ...lowGenome, size: TRAIT_RANGES.size.min + 0.2 };
    const far: Genome = { ...lowGenome, size: TRAIT_RANGES.size.max };
    expect(geneticDistance(base, near)).toBeLessThan(geneticDistance(base, far));
  });
});

describe("areGeneticallyCompatible", () => {
  it("returns true for identical genomes", () => {
    expect(areGeneticallyCompatible(lowGenome, lowGenome)).toBe(true);
  });

  it("returns false for genomes far enough apart", () => {
    expect(areGeneticallyCompatible(lowGenome, highGenome)).toBe(false);
  });

  it("agrees with the documented MATE_COMPATIBILITY_THRESHOLD", () => {
    // Distance for a single-trait offset of fraction f of that trait's
    // range is f / sqrt(numberOfTraits). Solve for f so the resulting
    // distance clearly exceeds MATE_COMPATIBILITY_THRESHOLD.
    const numTraits = Object.keys(TRAIT_RANGES).length;
    const f = (MATE_COMPATIBILITY_THRESHOLD + 0.1) * Math.sqrt(numTraits);
    const range = TRAIT_RANGES.size.max - TRAIT_RANGES.size.min;
    const farApart = { ...lowGenome, size: lowGenome.size + range * f };
    const distance = geneticDistance(lowGenome, farApart);
    expect(distance).toBeGreaterThan(MATE_COMPATIBILITY_THRESHOLD);
    expect(areGeneticallyCompatible(lowGenome, farApart)).toBe(false);
  });
});

describe("population divergence over generations", () => {
  it("repeated inheritance within an isolated lineage can accumulate genetic drift", () => {
    const rng = new Random(42);
    let lineageA = lowGenome;
    let lineageB = lowGenome;

    for (let gen = 0; gen < 200; gen++) {
      lineageA = inheritGenome(lineageA, lineageA, rng);
      lineageB = inheritGenome(lineageB, lineageB, rng);
    }

    expect(geneticDistance(lineageA, lineageB)).toBeGreaterThan(0);
  });
});

describe("speciation registry", () => {
  it("initializes with a single root species", () => {
    const registry = initializeSpeciesRegistry(1, 50);
    expect(registry.size).toBe(1);
    const root = registry.get(1)!;
    expect(root.parentSpeciesId).toBeNull();
    expect(root.alive).toBe(true);
    expect(root.population).toBe(50);
  });

  it("marks a species extinct once its population drops to zero, recording the tick", () => {
    const registry = initializeSpeciesRegistry(1, 10);
    const survivors = [createOrganism(1, 1, 0, 0, lowGenome, 50)];
    survivors[0].alive = false; // the only member of species 1 has died

    updateSpeciesPopulations(survivors, registry, 123);

    const record = registry.get(1)!;
    expect(record.alive).toBe(false);
    expect(record.extinctionTick).toBe(123);
    expect(record.population).toBe(0);
  });

  it("keeps a species alive and updates its population while members remain", () => {
    const registry = initializeSpeciesRegistry(1, 2);
    const organisms = [
      createOrganism(1, 1, 0, 0, lowGenome),
      createOrganism(2, 1, 1, 1, lowGenome),
      createOrganism(3, 1, 2, 2, lowGenome),
    ];

    updateSpeciesPopulations(organisms, registry, 10);

    const record = registry.get(1)!;
    expect(record.alive).toBe(true);
    expect(record.population).toBe(3);
    expect(record.extinctionTick).toBeNull();
  });

  it("creates a new species when a population splits into two geographically and genetically diverged clusters", () => {
    const rng = new Random(7);
    const registry = initializeSpeciesRegistry(1, 0);
    const organisms = [];

    // Cluster A: clustered near the origin, low-trait genome.
    for (let i = 0; i < MIN_SPECIATION_POPULATION + 2; i++) {
      organisms.push(createOrganism(i + 1, 1, i * 0.1, i * 0.1, { ...lowGenome }, 100));
    }
    // Cluster B: clustered far away, high-trait genome (guarantees distance
    // well above SPECIATION_DISTANCE_THRESHOLD).
    for (let i = 0; i < MIN_SPECIATION_POPULATION + 2; i++) {
      organisms.push(createOrganism(i + 100, 1, 90 + i * 0.1, 90 + i * 0.1, { ...highGenome }, 100));
    }

    let nextSpeciesId = 2;
    const newRecords = attemptSpeciation(organisms, registry, 400, 1, rng, () => nextSpeciesId++);

    expect(newRecords.length).toBeGreaterThan(0);
    expect(registry.size).toBeGreaterThan(1);

    const newRecord = newRecords[0];
    expect(newRecord.parentSpeciesId).toBe(1);
    expect(newRecord.originTick).toBe(400);
    expect(newRecord.originYear).toBe(1);
    expect(newRecord.alive).toBe(true);

    // The original species record must still exist (parent lineage preserved).
    expect(registry.get(1)).toBeDefined();

    // Every organism must now belong to either the original or the new species.
    const speciesIdsUsed = new Set(organisms.map((o) => o.speciesId));
    expect(speciesIdsUsed.has(newRecord.speciesId)).toBe(true);
    expect(speciesIdsUsed.size).toBe(2);
  });

  it("does not speciate a population that is too small or not genetically diverged", () => {
    const rng = new Random(9);
    const registry = initializeSpeciesRegistry(1, 0);
    const organisms = [];
    // All organisms genetically identical and spatially close: no valid split.
    for (let i = 0; i < 30; i++) {
      organisms.push(createOrganism(i + 1, 1, 50 + (i % 3), 50 + (i % 3), { ...lowGenome }, 100));
    }

    let nextSpeciesId = 2;
    const newRecords = attemptSpeciation(organisms, registry, 400, 1, rng, () => nextSpeciesId++);

    expect(newRecords.length).toBe(0);
    expect(registry.size).toBe(1);
  });

  it("SPECIATION_DISTANCE_THRESHOLD is stricter than MATE_COMPATIBILITY_THRESHOLD, so a fresh split is reproductively isolated", () => {
    expect(SPECIATION_DISTANCE_THRESHOLD).toBeGreaterThan(MATE_COMPATIBILITY_THRESHOLD);
  });
});
