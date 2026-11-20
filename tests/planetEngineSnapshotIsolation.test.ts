import { describe, expect, it } from "vitest";
import { createEarthLikeConfig } from "../simulation/planetEngine/core/PlanetCore";
import type { PlanetSchedulerConfig } from "../simulation/planetEngine/contracts";
import {
  BiomeMemoryStore,
  type BiomeDecision,
  type SerializedBiomeMemory,
} from "../simulation/planetEngine/biomes/stability";
import { PlanetEngine } from "../simulation/planetEngine/runtime/PlanetEngine";

const SMALL_SURFACE = { gridWidth: 16, gridHeight: 16 };
const SCHEDULER: PlanetSchedulerConfig = {
  climateIntervalTicks: 1,
  hydrologyIntervalTicks: 1,
  geologyIntervalTicks: 1000,
};

function engineAt(tick: number): PlanetEngine {
  const engine = new PlanetEngine(createEarthLikeConfig({
    seed: 7,
    surface: SMALL_SURFACE,
    scheduler: SCHEDULER,
  }));
  for (let i = 0; i < tick; i += 1) engine.step(3600);
  return engine;
}

describe("P1 — historical EnvironmentSnapshot isolation", () => {
  it("a tick-10 snapshot cannot rewrite tick-20 biome memory", () => {
    const engine = engineAt(10);
    const oldSnapshot = engine.createEnvironmentSnapshot();
    const oldSample = oldSnapshot.sample(3, 4);
    const memoryAt10 = JSON.stringify(engine.getBiomeMemory().toJSON());
    expect(JSON.parse(memoryAt10).every((record: SerializedBiomeMemory) => record.tick === 10)).toBe(true);

    for (let i = 0; i < 10; i += 1) engine.step(3600);
    expect(engine.getState().tick).toBe(20);

    const newSnapshot = engine.createEnvironmentSnapshot();
    const newSample = newSnapshot.sample(3, 4);
    const memoryAt20 = JSON.stringify(engine.getBiomeMemory().toJSON());
    expect(JSON.parse(memoryAt20).every((record: SerializedBiomeMemory) => record.tick === 20)).toBe(true);

    // Re-query the old snapshot, including a full materialization.
    expect(oldSnapshot.sample(3, 4)).toEqual(oldSample);
    oldSnapshot.materialize();
    expect(oldSnapshot.toLegacyCell(3, 4).terrain).toBe(oldSample.biome);
    expect(newSnapshot.sample(3, 4)).toEqual(newSample);
    expect(JSON.stringify(engine.getBiomeMemory().toJSON())).toBe(memoryAt20);
  });

  it("rejects temporal regression at the store boundary", () => {
    const engine = engineAt(20);
    const store = BiomeMemoryStore.fromJSON(engine.getBiomeMemory().toJSON());
    const before = JSON.stringify(store.toJSON());
    const stale: BiomeDecision = { biome: "desert", stability: 0.1, changed: true };
    for (const record of store.toJSON()) {
      const returned = store.commit(record.index, stale, record.tick - 1);
      expect(returned.tick).toBe(record.tick);
    }
    expect(JSON.stringify(store.toJSON())).toBe(before);
    expect(() => store.commit(0, stale, -1)).toThrow();
    expect(() => store.commit(0, stale, 1.5)).toThrow();
  });

  it("exposes only an immutable facade to consumers", () => {
    const engine = engineAt(20);
    const facade = engine.getBiomeMemory();
    const exposed = facade as unknown as Record<string, unknown>;
    expect(Object.isFrozen(facade)).toBe(true);
    expect(exposed.set).toBeUndefined();
    expect(exposed.commit).toBeUndefined();
    expect(exposed.clear).toBeUndefined();

    const first = facade.get(0);
    expect(first).toBeDefined();
    expect(Object.isFrozen(first)).toBe(true);
    const attemptedWrite = first as { biome: string };
    expect(() => { attemptedWrite.biome = "desert"; }).toThrow(TypeError);
    expect(facade.get(0)?.biome).toBe(first?.biome);

    const snapshot = engine.createEnvironmentSnapshot();
    snapshot.materialize();
    expect(JSON.stringify(engine.getBiomeMemory().toJSON()))
      .toBe(JSON.stringify(facade.toJSON()));
  });

  it("is independent of cell access order", () => {
    const a = engineAt(20);
    const b = engineAt(20);
    const snapshotA = a.createEnvironmentSnapshot();
    const snapshotB = b.createEnvironmentSnapshot();

    for (let i = 0; i < SMALL_SURFACE.gridWidth; i += 1) {
      snapshotA.sample(i, 2);
      snapshotB.sample(SMALL_SURFACE.gridWidth - 1 - i, 2);
      snapshotA.sample(2, SMALL_SURFACE.gridHeight - 1 - i);
      snapshotB.sample(2, i);
    }

    expect(a.getBiomeMemory().toJSON()).toEqual(b.getBiomeMemory().toJSON());
    expect(snapshotA.sample(5, 9)).toEqual(snapshotB.sample(5, 9));
  });

  it("serializes and restores with reproducible samples", () => {
    const source = engineAt(20);
    const serialized = source.getBiomeMemory().toJSON();
    const sourceSamples = Array.from({ length: 16 }, (_, i) =>
      source.createEnvironmentSnapshot().sample(i % SMALL_SURFACE.gridWidth, Math.floor(i / SMALL_SURFACE.gridWidth)),
    );

    const restored = engineAt(20);
    restored.restoreBiomeMemory(serialized);
    expect(BiomeMemoryStore.fromJSON(restored.getBiomeMemory().toJSON()).toJSON())
      .toEqual(restored.getBiomeMemory().toJSON());
    expect(restored.getBiomeMemory().toJSON()).toEqual(serialized);

    const restoredSamples = Array.from({ length: 16 }, (_, i) =>
      restored.createEnvironmentSnapshot().sample(i % SMALL_SURFACE.gridWidth, Math.floor(i / SMALL_SURFACE.gridWidth)),
    );
    expect(restoredSamples).toEqual(sourceSamples);
    expect(JSON.stringify(restored.getBiomeMemory().toJSON())).toBe(JSON.stringify(serialized));
  });
});
