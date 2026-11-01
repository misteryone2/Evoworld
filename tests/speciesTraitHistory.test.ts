import { describe, it, expect } from "vitest";
import {
  recordSpeciesSnapshots,
  buildTimeline,
  originSnapshot,
  TRAIT_SNAPSHOT_INTERVAL_TICKS,
  TRAIT_SNAPSHOT_MAX,
  type SpeciesSnapshot,
  type SpeciesTraitStore,
} from "../lib/speciesTraitHistory";
import type { RenderFrame, SpeciesRecord } from "../types";

const stat = (mean: number) => ({ mean, min: mean, max: mean, stdDev: 0 });
function frameAt(tick: number, speciesIds: number[], mean = 1): RenderFrame {
  return {
    tick,
    year: Math.floor(tick / 400),
    speciesGenomeStats: speciesIds.map((id) => ({
      speciesId: id,
      population: 10,
      genomeStats: { speed: stat(mean), carnivory: stat(0.1), vision: stat(5), evasion: stat(0.2), huntingSkill: stat(0.3) },
      distanceFromParentOrigin: null,
      distanceFromOtherSpecies: [],
    })),
  } as unknown as RenderFrame;
}
const record = (originTick = 0): SpeciesRecord =>
  ({
    speciesId: 1,
    originTick,
    originYear: Math.floor(originTick / 400),
    originGenomeSnapshot: { speed: 0.5, carnivory: 0.05, vision: 4, evasion: 0.1, huntingSkill: 0.2 },
  }) as unknown as SpeciesRecord;
const snap = (tick: number): SpeciesSnapshot => ({ tick, year: Math.floor(tick / 400), traits: { speed: 1, carnivory: 0, vision: 5, evasion: 0, huntingSkill: 0 } });

describe("v1.5.0 — species trait history", () => {
  it("records one snapshot per living species, and not again until the interval has passed", () => {
    const store: SpeciesTraitStore = new Map();
    recordSpeciesSnapshots(store, frameAt(100, [1, 2]));
    recordSpeciesSnapshots(store, frameAt(100 + TRAIT_SNAPSHOT_INTERVAL_TICKS - 1, [1, 2]));
    expect(store.get(1)).toHaveLength(1);
    expect(store.get(2)).toHaveLength(1);
    recordSpeciesSnapshots(store, frameAt(100 + TRAIT_SNAPSHOT_INTERVAL_TICKS, [1, 2]));
    expect(store.get(1)).toHaveLength(2);
  });

  it("stores the species' mean traits", () => {
    const store: SpeciesTraitStore = new Map();
    recordSpeciesSnapshots(store, frameAt(0, [1], 1.7));
    expect(store.get(1)![0].traits.speed).toBe(1.7);
    expect(store.get(1)![0].traits.vision).toBe(5);
  });

  it("starts over if the world is reset (time goes backwards)", () => {
    const store: SpeciesTraitStore = new Map();
    recordSpeciesSnapshots(store, frameAt(5000, [1]));
    recordSpeciesSnapshots(store, frameAt(10, [1]));
    expect(store.get(1)).toHaveLength(1);
    expect(store.get(1)![0].tick).toBe(10);
  });

  it("stays bounded over a very long run and keeps the first and the latest snapshot", () => {
    const store: SpeciesTraitStore = new Map();
    let last = 0;
    for (let i = 0; i < TRAIT_SNAPSHOT_MAX * 5; i++) {
      last = i * TRAIT_SNAPSHOT_INTERVAL_TICKS;
      recordSpeciesSnapshots(store, frameAt(last, [1]));
    }
    const list = store.get(1)!;
    expect(list.length).toBeLessThanOrEqual(TRAIT_SNAPSHOT_MAX);
    expect(list[0].tick).toBe(0);
    expect(list[list.length - 1].tick).toBe(last);
  });

  it("timeline always starts at the species' origin and ends at its current form", () => {
    const samples = buildTimeline(record(0), [snap(200), snap(400), snap(600)], snap(800), 5);
    expect(samples[0]).toEqual(originSnapshot(record(0)));
    expect(samples[samples.length - 1].tick).toBe(800);
  });

  it("picks evenly spaced moments when there are more than requested", () => {
    const many = Array.from({ length: 30 }, (_, i) => snap((i + 1) * 200));
    const samples = buildTimeline(record(0), many, snap(6200), 5);
    expect(samples).toHaveLength(5);
    const ticks = samples.map((s) => s.tick);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
  });

  it("an extinct species (no current form) ends at its last remembered moment", () => {
    const samples = buildTimeline(record(0), [snap(200), snap(400)], null, 5);
    expect(samples[samples.length - 1].tick).toBe(400);
  });

  it("a brand-new species with nothing recorded yet has just its origin", () => {
    expect(buildTimeline(record(100), [], null)).toHaveLength(1);
  });
});
