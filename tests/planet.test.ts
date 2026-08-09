import { describe, it, expect } from "vitest";
import { Planet } from "../simulation/planet/planet";

describe("Planet — biomes and climate", () => {
  it("generates a grid with the requested dimensions", () => {
    const planet = new Planet({ width: 20, height: 15, seed: 1 });
    expect(planet.cells.length).toBe(20 * 15);
    expect(planet.width).toBe(20);
    expect(planet.height).toBe(15);
  });

  it("assigns every cell a valid terrain type", () => {
    const planet = new Planet({ width: 30, height: 30, seed: 2 });
    const validTerrains = new Set(["ocean", "mountain", "plains", "desert", "forest", "tundra", "savanna"]);
    for (const cell of planet.cells) {
      expect(validTerrains.has(cell.terrain)).toBe(true);
    }
  });

  it("cycles through all four seasons across one simulated year", () => {
    const seasonsSeen = new Set<string>();
    for (let tick = 0; tick < 400; tick += 10) {
      seasonsSeen.add(Planet.seasonForTick(tick));
    }
    expect(seasonsSeen.size).toBe(4);
  });

  it("season cycle repeats identically every year", () => {
    expect(Planet.seasonForTick(0)).toBe(Planet.seasonForTick(400));
    expect(Planet.seasonForTick(150)).toBe(Planet.seasonForTick(550));
  });

  it("ocean cells never regrow vegetation or change terrain", () => {
    const planet = new Planet({ width: 25, height: 25, seed: 3 });
    const oceanIndices = planet.cells
      .map((c, i) => (c.terrain === "ocean" ? i : -1))
      .filter((i) => i !== -1);

    for (let tick = 1; tick <= 500; tick++) planet.update(tick);

    for (const i of oceanIndices) {
      expect(planet.cells[i].terrain).toBe("ocean");
      expect(planet.cells[i].vegetation).toBe(0);
    }
  });

  it("land vegetation stays within valid [0,1] bounds over many ticks", () => {
    const planet = new Planet({ width: 25, height: 25, seed: 4 });
    for (let tick = 1; tick <= 1000; tick++) planet.update(tick);
    for (const cell of planet.cells) {
      expect(cell.vegetation).toBeGreaterThanOrEqual(0);
      expect(cell.vegetation).toBeLessThanOrEqual(1);
    }
  });

  it("biomes can dynamically reclassify as climate/vegetation change over time", () => {
    const planet = new Planet({ width: 25, height: 25, seed: 5 });
    const initialTerrain = planet.cells.map((c) => c.terrain);

    for (let tick = 1; tick <= 3000; tick++) planet.update(tick);

    const finalTerrain = planet.cells.map((c) => c.terrain);
    // At least some land cells should have changed biome classification
    // over a long enough time horizon with seasonal cycling.
    let changed = 0;
    for (let i = 0; i < initialTerrain.length; i++) {
      if (initialTerrain[i] !== finalTerrain[i]) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });
});
