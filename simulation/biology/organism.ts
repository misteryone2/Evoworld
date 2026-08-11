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
 * Energy cost paid every tick just for being alive. Larger, faster and more
 * carnivorous organisms cost more energy per tick (a real tradeoff: no
 * trait is free), scaled by the organism's own metabolism trait.
 *
 * Carnivory's cost is convex (linear term + cubic term), not just linear
 * (v0.3.1): a moderately carnivorous build is only mildly more expensive
 * than a herbivore, but pushing toward the extreme gets disproportionately
 * costly. This creates a genuine interior fitness optimum for diet instead
 * of "more carnivory is always better", which previously caused the whole
 * population to converge on maximal carnivory regardless of how much
 * hunting was actually succeeding.
 *
 * evasion and huntingSkill (v0.3.3) each carry their own mild, linear
 * upkeep cost too — maintaining constant vigilance or specialized hunting
 * acumen is metabolically expensive whether or not it's ever put to use
 * that particular tick.
 */
export function upkeepCost(organism: Organism): number {
  const { size, speed, metabolism, vision, carnivory, evasion, huntingSkill } = organism.genome;
  const carnivoryCost = carnivory * 0.08 + Math.pow(carnivory, 3) * 0.55;
  return (
    (0.05 + size * 0.06 + speed * 0.05 + vision * 0.01 + carnivoryCost + evasion * 0.04 + huntingSkill * 0.04) *
    metabolism
  );
}

/** Returns true if the organism should die this tick (starvation or old age). */
export function isDying(organism: Organism): boolean {
  if (organism.energy <= 0) return true;
  if (organism.age >= organism.genome.lifespan) return true;
  return false;
}
