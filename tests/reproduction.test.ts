import { describe, it, expect } from "vitest";
import { Random } from "../simulation/core/random";
import { reproduceOrganisms } from "../simulation/evolution/reproduction";
import { createOrganism } from "../simulation/biology/organism";
import { Planet } from "../simulation/planet/planet";
import type { Genome } from "../types";

const genome: Genome = {
  size: 1,
  speed: 1,
  metabolism: 1,
  vision: 5,
  fertility: 1, // guarantee reproduction attempts for deterministic testing
  lifespan: 1000,
  carnivory: 0,
};

describe("reproduction", () => {
  it("creates offspring only from eligible (high energy, matured) organisms", () => {
    const planet = new Planet({ width: 20, height: 20, seed: 1 });
    const rng = new Random(1);
    let nextId = 100;

    const ineligible = createOrganism(1, 1, 5, 5, genome, 10); // too little energy
    ineligible.age = 500;
    const population = [ineligible];

    const offspring = reproduceOrganisms(population, planet, rng, () => nextId++);
    expect(offspring.length).toBe(0);
  });

  it("produces offspring with genomes inherited from parents, within valid bounds", () => {
    const planet = new Planet({ width: 20, height: 20, seed: 2 });
    const rng = new Random(2);
    let nextId = 100;

    let offspring: ReturnType<typeof reproduceOrganisms> = [];
    for (let attempt = 0; attempt < 20 && offspring.length === 0; attempt++) {
      const a = createOrganism(1, 1, 5, 5, genome, 100);
      a.age = 500;
      const b = createOrganism(2, 1, 5, 5, genome, 100);
      b.age = 500;
      offspring = reproduceOrganisms([a, b], planet, rng, () => nextId++);
    }

    expect(offspring.length).toBeGreaterThan(0);
    for (const child of offspring) {
      expect(child.energy).toBeGreaterThan(0);
      expect(child.age).toBe(0);
      expect(child.genome.size).toBeGreaterThan(0);
    }
  });

  it("deducts energy cost from parents that reproduce", () => {
    const planet = new Planet({ width: 20, height: 20, seed: 3 });
    const rng = new Random(3);
    let nextId = 100;

    const a = createOrganism(1, 1, 5, 5, genome, 100);
    a.age = 500;
    const b = createOrganism(2, 1, 5, 5, genome, 100);
    b.age = 500;
    const population = [a, b];

    reproduceOrganisms(population, planet, rng, () => nextId++);

    const totalEnergyAfter = population.reduce((sum, o) => sum + o.energy, 0);
    expect(totalEnergyAfter).toBeLessThan(200);
  });
});
