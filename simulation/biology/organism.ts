import type { Genome, Organism } from "../../types";
import { Random } from "../core/random";
import { randomGenome } from "./genome";

const STARTING_ENERGY = 50;

export function createOrganism(
  id: number,
  speciesId: number,
  x: number,
  y: number,
  genome: Genome,
  energy: number = STARTING_ENERGY,
): Organism {
  return {
    id,
    speciesId,
    position: { x, y },
    energy,
    age: 0,
    genome,
    alive: true,
  };
}

export function createRandomOrganism(
  id: number,
  speciesId: number,
  x: number,
  y: number,
  rng: Random,
): Organism {
  return createOrganism(id, speciesId, x, y, randomGenome(rng));
}

/**
 * Energy cost paid every tick just for being alive. Larger and faster
 * organisms cost more energy per tick (a real tradeoff: no trait is free),
 * scaled by the organism's own metabolism trait.
 */
export function upkeepCost(organism: Organism): number {
  const { size, speed, metabolism, vision } = organism.genome;
  return (0.05 + size * 0.06 + speed * 0.05 + vision * 0.01) * metabolism;
}

/** Returns true if the organism should die this tick (starvation or old age). */
export function isDying(organism: Organism): boolean {
  if (organism.energy <= 0) return true;
  if (organism.age >= organism.genome.lifespan) return true;
  return false;
}
