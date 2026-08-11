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
  evasion: 0,
  huntingSkill: 0,
};

const predatorGenome: Genome = { ...baseGenome, size: 1.5, speed: 1.5, carnivory: 0.7 };

function huntSuccessRate(predatorEvasionOrSkill: Partial<Genome>, preyEvasionOrSkill: Partial<Genome>, seedOffset: number): number {
  const planet = new Planet({ width: 20, height: 20, seed: 1 });
  let successes = 0;
  const attempts = 150;
  for (let i = 0; i < attempts; i++) {
    const rng = new Random(seedOffset + i);
    const predator = createOrganism(1, 1, 5, 5, { ...predatorGenome, ...predatorEvasionOrSkill }, 40);
    const prey = createOrganism(2, 2, 5, 5, { ...baseGenome, ...preyEvasionOrSkill }, 50);
    if (huntPrey([predator, prey], planet, rng) > 0) successes++;
  }
  return successes / attempts;
}

describe("v0.3.3 — coevolutionary traits", () => {
  it("evasion and huntingSkill each carry a real metabolic cost", () => {
    const plain = createOrganism(1, 1, 0, 0, baseGenome);
    const evasive = createOrganism(2, 1, 0, 0, { ...baseGenome, evasion: 0.7 });
    const skilled = createOrganism(3, 1, 0, 0, { ...baseGenome, huntingSkill: 0.7 });
    expect(upkeepCost(evasive)).toBeGreaterThan(upkeepCost(plain));
    expect(upkeepCost(skilled)).toBeGreaterThan(upkeepCost(plain));
  });

  it("higher prey evasion reduces the predator's hunting success rate", () => {
    const lowEvasionRate = huntSuccessRate({}, { evasion: 0 }, 1000);
    const highEvasionRate = huntSuccessRate({}, { evasion: 0.8 }, 1000);
    expect(highEvasionRate).toBeLessThan(lowEvasionRate);
  });

  it("higher predator huntingSkill increases hunting success rate against the same prey", () => {
    const lowSkillRate = huntSuccessRate({ huntingSkill: 0 }, {}, 2000);
    const highSkillRate = huntSuccessRate({ huntingSkill: 0.8 }, {}, 2000);
    expect(highSkillRate).toBeGreaterThan(lowSkillRate);
  });

  it("a highly evasive prey and a highly skilled predator roughly offset each other, relative to their unskilled baselines", () => {
    const bothLow = huntSuccessRate({ huntingSkill: 0 }, { evasion: 0 }, 3000);
    const bothHigh = huntSuccessRate({ huntingSkill: 0.8 }, { evasion: 0.8 }, 3000);
    const predatorGainedNothing = huntSuccessRate({ huntingSkill: 0 }, { evasion: 0.8 }, 3000);
    expect(Math.abs(bothHigh - bothLow)).toBeLessThan(Math.abs(predatorGainedNothing - bothLow));
  });
});

describe("v0.3.3 — synthetic arms-race demonstration", () => {
  it("iteratively favoring survivors on each side pushes evasion and huntingSkill both upward over generations", () => {
    const rng = new Random(77);
    const planet = new Planet({ width: 20, height: 20, seed: 5 });

    let preyEvasion = 0;
    let predatorSkill = 0;

    const generations = 25;
    for (let gen = 0; gen < generations; gen++) {
      const preyPopulation = Array.from({ length: 20 }, () => Math.min(0.8, Math.max(0, preyEvasion + rng.gaussian(0, 0.05))));
      const predatorPopulation = Array.from({ length: 20 }, () => Math.min(0.8, Math.max(0, predatorSkill + rng.gaussian(0, 0.05))));

      let survivedEvasionSum = 0;
      let survivedCount = 0;
      let succeededSkillSum = 0;
      let succeededCount = 0;

      for (let i = 0; i < 20; i++) {
        const predator = createOrganism(1, 1, 5, 5, { ...predatorGenome, huntingSkill: predatorPopulation[i] }, 40);
        const prey = createOrganism(2, 2, 5, 5, { ...baseGenome, evasion: preyPopulation[i] }, 50);
        const killed = huntPrey([predator, prey], planet, rng) > 0;
        if (!killed) {
          survivedEvasionSum += preyPopulation[i];
          survivedCount++;
        } else {
          succeededSkillSum += predatorPopulation[i];
          succeededCount++;
        }
      }

      if (survivedCount > 0) preyEvasion = survivedEvasionSum / survivedCount;
      if (succeededCount > 0) predatorSkill = succeededSkillSum / succeededCount;
    }

    expect(preyEvasion).toBeGreaterThan(0.05);
    expect(predatorSkill).toBeGreaterThan(0.05);
  });
});
