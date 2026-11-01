import { describe, it, expect } from "vitest";
import { World } from "../simulation/core/world";
import { computeSpeciesGenomeStats } from "../simulation/evolution/speciesAnalysis";
import { sampleHistoryPoint } from "../lib/historyAccumulation";
import { TERRAIN_LABELS } from "../lib/terrainLabels";
import type { RenderFrame, SpeciesGenomeStats, TerrainType } from "../types";

const config = { width: 256, height: 256, seed: 5 } as never;

describe("v1.4.0 — species habitat (adattamento ai biomi)", () => {
  it("a world reports a habitat for every living species", () => {
    const world = new World(config, 120);
    for (let i = 0; i < 30; i++) world.step();
    const stats = world.getSpeciesGenomeStats();
    expect(stats.length).toBeGreaterThan(0);
    for (const s of stats) expect(s.habitat).toBeDefined();
  });

  it("biome shares sum to 1 and the dominant biome has the largest share", () => {
    const world = new World(config, 120);
    for (let i = 0; i < 30; i++) world.step();
    for (const s of world.getSpeciesGenomeStats()) {
      const h = s.habitat!;
      const shares = Object.values(h.biomeShares) as number[];
      expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      expect(h.biomeShares[h.dominantBiome]).toBeCloseTo(Math.max(...shares), 10);
    }
  });

  it("mean fitness is a plausible environmental-fitness value", () => {
    const world = new World(config, 120);
    for (let i = 0; i < 30; i++) world.step();
    for (const s of world.getSpeciesGenomeStats()) {
      expect(s.habitat!.meanFitness).toBeGreaterThanOrEqual(0);
      expect(s.habitat!.meanFitness).toBeLessThan(1.8);
    }
  });

  it("computeSpeciesGenomeStats still works without a planet and then reports no habitat", () => {
    const world = new World(config, 60);
    const noPlanet = computeSpeciesGenomeStats(world.organisms, new Map(world.getSpeciesTree().map((r) => [r.speciesId, r])));
    expect(noPlanet.length).toBeGreaterThan(0);
    for (const s of noPlanet) expect(s.habitat).toBeUndefined();
  });

  it("has an Italian label for every land and sea terrain type", () => {
    const all: TerrainType[] = ["ocean", "mountain", "plains", "desert", "forest", "tundra", "savanna"];
    for (const t of all) expect(TERRAIN_LABELS[t].length).toBeGreaterThan(0);
  });
});

describe("v1.4.0 — history avgFitness", () => {
  function frameWith(species: Partial<SpeciesGenomeStats>[]): RenderFrame {
    return {
      tick: 100,
      year: 0,
      stats: { population: 100, speciesAlive: species.length, averageGenome: null },
      speciesGenomeStats: species as SpeciesGenomeStats[],
      avgVegetation: 0.5,
    } as unknown as RenderFrame;
  }

  it("is the population-weighted mean of the species' mean fitness", () => {
    const point = sampleHistoryPoint(
      frameWith([
        { speciesId: 1, population: 75, habitat: { dominantBiome: "plains", biomeShares: { plains: 1 }, meanFitness: 0.8 } },
        { speciesId: 2, population: 25, habitat: { dominantBiome: "forest", biomeShares: { forest: 1 }, meanFitness: 0.4 } },
      ]),
    );
    expect(point.avgFitness).toBeCloseTo(0.7, 6);
  });

  it("is 0 when no species carries habitat data", () => {
    const point = sampleHistoryPoint(frameWith([{ speciesId: 1, population: 10 }]));
    expect(point.avgFitness).toBe(0);
  });
});
