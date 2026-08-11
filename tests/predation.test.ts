import { describe, it, expect } from "vitest";
import { Random } from "../simulation/core/random";
import { Planet } from "../simulation/planet/planet";
import { createOrganism } from "../simulation/biology/organism";
import { huntPrey } from "../simulation/ecology/predation";
import type { Genome } from "../types";

const herbivoreGenome: Genome = {
  size: 1,
  speed: 1,
  metabolism: 1,
  vision: 5,
  fertility: 0.5,
  lifespan: 500,
  carnivory: 0,
  preferredTemperature: 20,
  temperatureTolerance: 20,
  preferredWater: 0.4,
  waterTolerance: 0.5,
    evasion: 0.2,
  huntingSkill: 0.2,

};

const strongCarnivoreGenome: Genome = {
  ...herbivoreGenome,
  size: 2.5,
  speed: 2.5,
  carnivory: 1,
};

const weakCarnivoreGenome: Genome = {
  ...herbivoreGenome,
  size: 0.3,
  speed: 0.3,
  carnivory: 0.6,
};

describe("predation — huntPrey", () => {
  it("herbivores (carnivory below threshold) never hunt, regardless of nearby prey", () => {
    const planet = new Planet({ width: 20, height: 20, seed: 1 });
    const rng = new Random(1);
    const herbivore = createOrganism(1, 1, 5, 5, { ...herbivoreGenome, carnivory: 0.1 }, 50);
    const prey = createOrganism(2, 2, 5, 5, herbivoreGenome, 50);

    const kills = huntPrey([herbivore, prey], planet, rng);

    expect(kills).toBe(0);
    expect(prey.alive).toBe(true);
  });

  it("a strong carnivore reliably kills a weak, distant-carnivory prey over repeated attempts", () => {
    const planet = new Planet({ width: 20, height: 20, seed: 2 });
    let successes = 0;
    const attempts = 60;

    for (let i = 0; i < attempts; i++) {
      const rng = new Random(1000 + i);
      const predator = createOrganism(1, 1, 5, 5, strongCarnivoreGenome, 50);
      const prey = createOrganism(2, 2, 5, 5, herbivoreGenome, 50);
      const kills = huntPrey([predator, prey], planet, rng);
      if (kills > 0) successes++;
    }

    expect(successes).toBeGreaterThan(attempts * 0.15);
  });

  it("predators never target prey with equal or higher carnivory than themselves", () => {
    const planet = new Planet({ width: 20, height: 20, seed: 3 });
    const predator = createOrganism(1, 1, 5, 5, { ...strongCarnivoreGenome, carnivory: 0.5 }, 50);
    const equallyCarnivorousNeighbor = createOrganism(2, 2, 5, 5, { ...strongCarnivoreGenome, carnivory: 0.5 }, 10);

    for (let i = 0; i < 50; i++) {
      const attemptRng = new Random(i);
      const kills = huntPrey([predator, equallyCarnivorousNeighbor], planet, attemptRng);
      expect(kills).toBe(0);
      expect(equallyCarnivorousNeighbor.alive).toBe(true);
    }
  });

  it("only preys within HUNT_RADIUS are ever targeted", () => {
    const planet = new Planet({ width: 50, height: 50, seed: 4 });
    const predator = createOrganism(1, 1, 5, 5, strongCarnivoreGenome, 50);
    const farPrey = createOrganism(2, 2, 45, 45, herbivoreGenome, 50);

    for (let i = 0; i < 30; i++) {
      const loopRng = new Random(i);
      huntPrey([predator, farPrey], planet, loopRng);
    }

    expect(farPrey.alive).toBe(true);
  });

  it("a successful kill removes the prey (marks it not alive) and transfers positive energy to the predator", () => {
    const planet = new Planet({ width: 20, height: 20, seed: 5 });
    let kill: { predatorEnergyBefore: number; predatorEnergyAfter: number } | null = null;

    for (let i = 0; i < 200 && !kill; i++) {
      const rng = new Random(i);
      const predator = createOrganism(1, 1, 5, 5, strongCarnivoreGenome, 40);
      const prey = createOrganism(2, 2, 5, 5, herbivoreGenome, 50);
      const before = predator.energy;
      const kills = huntPrey([predator, prey], planet, rng);
      if (kills > 0) {
        expect(prey.alive).toBe(false);
        kill = { predatorEnergyBefore: before, predatorEnergyAfter: predator.energy };
      }
    }

    expect(kill).not.toBeNull();
    expect(kill!.predatorEnergyAfter).toBeGreaterThan(kill!.predatorEnergyBefore);
  });

  it("a weaker predator can still occasionally win against stronger prey (not deterministic on size alone)", () => {
    const planet = new Planet({ width: 20, height: 20, seed: 6 });
    let anyWin = false;

    for (let i = 0; i < 300 && !anyWin; i++) {
      const rng = new Random(i);
      const predator = createOrganism(1, 1, 5, 5, weakCarnivoreGenome, 50);
      const prey = createOrganism(2, 2, 5, 5, { ...herbivoreGenome, size: 2, speed: 2 }, 50);
      const kills = huntPrey([predator, prey], planet, rng);
      if (kills > 0) anyWin = true;
    }

    expect(anyWin).toBe(true);
  });
});
