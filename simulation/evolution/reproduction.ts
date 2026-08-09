import type { Organism } from "../../types";
import { Random } from "../core/random";
import { inheritGenome, cloneWithMutation } from "../biology/genome";
import { createOrganism } from "../biology/organism";
import { Planet } from "../planet/planet";

const REPRODUCTION_ENERGY_THRESHOLD = 90;
const REPRODUCTION_ENERGY_COST = 40;
const MIN_REPRODUCTION_AGE_FRACTION = 0.1; // must reach 10% of lifespan first
const MATE_SEARCH_RADIUS = 2;

/**
 * Attempts reproduction for the current population. An organism can
 * reproduce only if it has enough energy and has matured past a minimum
 * fraction of its lifespan. Whether reproduction actually happens (and
 * whether a mate is found) is probabilistic and scaled by fertility.
 */
export function reproduceOrganisms(
  organisms: Organism[],
  planet: Planet,
  rng: Random,
  nextId: () => number,
): Organism[] {
  const offspring: Organism[] = [];
  const eligible = organisms.filter(
    (o) =>
      o.alive &&
      o.energy >= REPRODUCTION_ENERGY_THRESHOLD &&
      o.age >= o.genome.lifespan * MIN_REPRODUCTION_AGE_FRACTION,
  );

  const paired = new Set<number>();

  for (const organism of eligible) {
    if (paired.has(organism.id)) continue;
    if (!rng.chance(organism.genome.fertility * 0.3)) continue;

    const mate = eligible.find(
      (other) =>
        other.id !== organism.id &&
        !paired.has(other.id) &&
        other.speciesId === organism.speciesId &&
        distanceWrapped(organism, other, planet) <= MATE_SEARCH_RADIUS,
    );

    let childGenome;
    if (mate) {
      paired.add(organism.id);
      paired.add(mate.id);
      childGenome = inheritGenome(organism.genome, mate.genome, rng);
      mate.energy -= REPRODUCTION_ENERGY_COST;
    } else {
      if (!rng.chance(0.15)) continue;
      paired.add(organism.id);
      childGenome = cloneWithMutation(organism.genome, rng);
    }

    organism.energy -= REPRODUCTION_ENERGY_COST;

    const child = createOrganism(
      nextId(),
      organism.speciesId,
      organism.position.x,
      organism.position.y,
      childGenome,
    );
    offspring.push(child);
  }

  return offspring;
}

function distanceWrapped(a: Organism, b: Organism, planet: Planet): number {
  const dx = Math.min(
    Math.abs(a.position.x - b.position.x),
    planet.width - Math.abs(a.position.x - b.position.x),
  );
  const dy = Math.min(
    Math.abs(a.position.y - b.position.y),
    planet.height - Math.abs(a.position.y - b.position.y),
  );
  return Math.sqrt(dx * dx + dy * dy);
}
