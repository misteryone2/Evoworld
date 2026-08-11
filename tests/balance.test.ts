import { describe, it, expect } from "vitest";
import { Random } from "../simulation/core/random";
import { Planet } from "../simulation/planet/planet";
import { createOrganism, upkeepCost } from "../simulation/biology/organism";
import { huntPrey } from "../simulation/ecology/predation";
import type { Genome } from "../types";

const baseGenome: Genome = {
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

describe("v0.3.1 — convex carnivory cost", () => {
  it("cost increases with carnivory", () => {
    const low = createOrganism(1, 1, 0, 0, { ...baseGenome, carnivory: 0.2 });
    const mid = createOrganism(2, 1, 0, 0, { ...baseGenome, carnivory: 0.5 });
    const high = createOrganism(3, 1, 0, 0, { ...baseGenome, carnivory: 0.85 });
    expect(upkeepCost(mid)).toBeGreaterThan(upkeepCost(low));
    expect(upkeepCost(high)).toBeGreaterThan(upkeepCost(mid));
  });

  it("the marginal cost of carnivory grows faster near the extreme than near zero (convexity)", () => {
    const herbivore = createOrganism(1, 1, 0, 0, { ...baseGenome, carnivory: 0 });
    const lowMid = createOrganism(2, 1, 0, 0, { ...baseGenome, carnivory: 0.3 });
    const midHigh = createOrganism(3, 1, 0, 0, { ...baseGenome, carnivory: 0.55 });
    const extreme = createOrganism(4, 1, 0, 0, { ...baseGenome, carnivory: 0.85 });

    const marginalLow = upkeepCost(lowMid) - upkeepCost(herbivore);
    const marginalHigh = upkeepCost(extreme) - upkeepCost(midHigh);

    expect(marginalHigh).toBeGreaterThan(marginalLow);
  });
});

describe("v0.3.1 — predator interference competition", () => {
  const strongCarnivoreGenome: Genome = { ...baseGenome, size: 2, speed: 2, carnivory: 0.8 };
  const preyGenome: Genome = { ...baseGenome, carnivory: 0 };

  it("a lone predator with abundant prey hunts more successfully than several predators sharing scarce prey", () => {
    const planet = new Planet({ width: 20, height: 20, seed: 1 });

    let soloKills = 0;
    for (let i = 0; i < 150; i++) {
      const rng = new Random(i);
      const predator = createOrganism(1, 1, 10, 10, strongCarnivoreGenome, 40);
      const prey = Array.from({ length: 5 }, (_, j) => createOrganism(10 + j, 2, 10, 10, preyGenome, 50));
      soloKills += huntPrey([predator, ...prey], planet, rng);
    }

    let crowdedKills = 0;
    for (let i = 0; i < 150; i++) {
      const rng = new Random(i);
      const predators = Array.from({ length: 5 }, (_, j) => createOrganism(1 + j, 1, 10, 10, strongCarnivoreGenome, 40));
      const prey = createOrganism(20, 2, 10, 10, preyGenome, 50);
      crowdedKills += huntPrey([...predators, prey], planet, rng);
    }

    const soloRatePerPredator = soloKills / 150 / 1;
    const crowdedRatePerPredator = crowdedKills / 150 / 5;
    expect(soloRatePerPredator).toBeGreaterThan(crowdedRatePerPredator);
  });
});
