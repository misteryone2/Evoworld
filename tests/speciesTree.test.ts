import { describe, expect, it } from "vitest";
import { buildSpeciesTree, indexSpeciesTree } from "../lib/speciesTree";
import { TRAIT_RANGES } from "../simulation/biology/genome";
import type { Genome, SpeciesRecord } from "../types";

const baseGenome: Genome = {
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

function record(overrides: Partial<SpeciesRecord>): SpeciesRecord {
  return {
    speciesId: 1,
    parentSpeciesId: null,
    originTick: 0,
    originYear: 0,
    population: 10,
    alive: true,
    extinctionTick: null,
    originGenomeSnapshot: baseGenome,
    ...overrides,
  };
}

describe("buildSpeciesTree", () => {
  it("returns a single root for a fresh world with one seed species", () => {
    const roots = buildSpeciesTree([record({ speciesId: 1 })]);
    expect(roots).toHaveLength(1);
    expect(roots[0].record.speciesId).toBe(1);
    expect(roots[0].children).toHaveLength(0);
    expect(roots[0].descendantCount).toBe(0);
  });

  it("nests children under their parentSpeciesId", () => {
    const records = [
      record({ speciesId: 1, originTick: 0 }),
      record({ speciesId: 2, parentSpeciesId: 1, originTick: 200 }),
      record({ speciesId: 3, parentSpeciesId: 1, originTick: 400 }),
    ];
    const roots = buildSpeciesTree(records);
    expect(roots).toHaveLength(1);
    expect(roots[0].children.map((c) => c.record.speciesId)).toEqual([2, 3]);
    expect(roots[0].descendantCount).toBe(2);
  });

  it("supports multi-generation lineages (grandchildren)", () => {
    const records = [
      record({ speciesId: 1, originTick: 0 }),
      record({ speciesId: 2, parentSpeciesId: 1, originTick: 200 }),
      record({ speciesId: 3, parentSpeciesId: 2, originTick: 600 }),
    ];
    const roots = buildSpeciesTree(records);
    expect(roots[0].children[0].children[0].record.speciesId).toBe(3);
    expect(roots[0].descendantCount).toBe(2);
  });

  it("sorts children chronologically by originTick", () => {
    const records = [
      record({ speciesId: 1, originTick: 0 }),
      record({ speciesId: 3, parentSpeciesId: 1, originTick: 800 }),
      record({ speciesId: 2, parentSpeciesId: 1, originTick: 200 }),
    ];
    const roots = buildSpeciesTree(records);
    expect(roots[0].children.map((c) => c.record.speciesId)).toEqual([2, 3]);
  });

  it("handles multiple independent seed species as multiple roots", () => {
    const records = [record({ speciesId: 1 }), record({ speciesId: 5 })];
    const roots = buildSpeciesTree(records);
    expect(roots).toHaveLength(2);
  });

  it("treats a parentSpeciesId with no matching record as a root (defensive, should not throw)", () => {
    const records = [record({ speciesId: 2, parentSpeciesId: 999, originTick: 200 })];
    const roots = buildSpeciesTree(records);
    expect(roots).toHaveLength(1);
    expect(roots[0].record.speciesId).toBe(2);
  });
});

describe("indexSpeciesTree", () => {
  it("indexes every node in the tree by speciesId, including nested ones", () => {
    const records = [
      record({ speciesId: 1, originTick: 0 }),
      record({ speciesId: 2, parentSpeciesId: 1, originTick: 200 }),
      record({ speciesId: 3, parentSpeciesId: 2, originTick: 600 }),
    ];
    const roots = buildSpeciesTree(records);
    const index = indexSpeciesTree(roots);
    expect(index.size).toBe(3);
    expect(index.get(3)?.record.parentSpeciesId).toBe(2);
  });
});
