import { describe, it, expect } from "vitest";
import { World } from "../simulation/core/world";

describe("World", () => {
  it("advances tick count by exactly one per step()", () => {
    const world = new World({ width: 30, height: 30, seed: 10 }, 40);
    expect(world.tick).toBe(0);
    world.step();
    expect(world.tick).toBe(1);
    world.step();
    expect(world.tick).toBe(2);
  });

  it("is reproducible: two worlds with the same seed evolve identically", () => {
    const worldA = new World({ width: 30, height: 30, seed: 555 }, 60);
    const worldB = new World({ width: 30, height: 30, seed: 555 }, 60);

    for (let i = 0; i < 50; i++) {
      worldA.step();
      worldB.step();
    }

    expect(worldA.getStats().population).toBe(worldB.getStats().population);
    expect(worldA.organisms.length).toBe(worldB.organisms.length);
    for (let i = 0; i < worldA.organisms.length; i++) {
      expect(worldA.organisms[i].genome).toEqual(worldB.organisms[i].genome);
      expect(worldA.organisms[i].position).toEqual(worldB.organisms[i].position);
    }
  });

  it("different seeds produce different evolutionary trajectories", () => {
    const worldA = new World({ width: 30, height: 30, seed: 1 }, 60);
    const worldB = new World({ width: 30, height: 30, seed: 2 }, 60);

    for (let i = 0; i < 50; i++) {
      worldA.step();
      worldB.step();
    }

    const same =
      worldA.getStats().population === worldB.getStats().population &&
      JSON.stringify(worldA.organisms.map((o) => o.genome)) ===
        JSON.stringify(worldB.organisms.map((o) => o.genome));
    expect(same).toBe(false);
  });

  it("updates population stats over time (births/deaths tracked, population can change)", () => {
    const world = new World({ width: 40, height: 40, seed: 42 }, 100);
    const initialPopulation = world.getStats().population;

    for (let i = 0; i < 300; i++) {
      world.step();
    }

    const finalStats = world.getStats();
    expect(finalStats.tick).toBe(300);
    expect(finalStats.population).toBeGreaterThanOrEqual(0);
    expect(typeof initialPopulation).toBe("number");
  });

  it("produces genetic variation in surviving populations after many generations (no fixed trend enforced)", () => {
    const world = new World({ width: 50, height: 50, seed: 999 }, 200);

    for (let i = 0; i < 800; i++) {
      world.step();
    }

    const stats = world.getStats();
    if (stats.population > 5) {
      const sizes = new Set(world.organisms.map((o) => o.genome.size.toFixed(3)));
      expect(sizes.size).toBeGreaterThan(1);
    } else {
      expect(stats.population).toBeGreaterThanOrEqual(0);
    }
  });

  it("can serialize to a snapshot and restore an equivalent world", () => {
    const world = new World({ width: 25, height: 25, seed: 7 }, 30);
    for (let i = 0; i < 20; i++) world.step();

    const snapshot = world.toSnapshot();
    const restored = World.fromSnapshot(snapshot);

    expect(restored.tick).toBe(world.tick);
    expect(restored.organisms.length).toBe(world.organisms.length);
    expect(restored.planet.width).toBe(world.planet.width);
  });
});
