import { describe, it, expect } from "vitest";
import { World } from "../simulation/core/world";
import { buildRenderFrame, computeSpeciesAnalysis } from "../simulation/core/renderFrame";

const config = { width: 128, height: 128, seed: 3 } as never;

describe("v1.6.0 — reusing the species analysis between frames", () => {
  it("without a cache a frame computes the species analysis itself, exactly as before", () => {
    const world = new World(config, 60);
    for (let i = 0; i < 20; i++) world.step();
    const frame = buildRenderFrame(world);
    expect(frame.speciesTree.length).toBeGreaterThan(0);
    expect(frame.speciesGenomeStats.length).toBeGreaterThan(0);
    expect(frame.speciesGenomeStats.map((s) => s.speciesId)).toEqual(world.getSpeciesGenomeStats().map((s) => s.speciesId));
  });

  it("with a cache the frame carries that very analysis instead of recomputing it", () => {
    const world = new World(config, 60);
    for (let i = 0; i < 20; i++) world.step();
    const cache = computeSpeciesAnalysis(world);
    for (let i = 0; i < 20; i++) world.step();
    const frame = buildRenderFrame(world, cache);
    expect(frame.speciesTree).toBe(cache.speciesTree);
    expect(frame.speciesGenomeStats).toBe(cache.speciesGenomeStats);
  });

  it("a cached frame still reports the live organisms and stats of the current tick", () => {
    const world = new World(config, 60);
    const cache = computeSpeciesAnalysis(world);
    for (let i = 0; i < 25; i++) world.step();
    const frame = buildRenderFrame(world, cache);
    expect(frame.tick).toBe(25);
    expect(frame.organismsX.length).toBe(world.organisms.length);
    expect(frame.stats.tick).toBe(25);
  });
});
