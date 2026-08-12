import type { Organism } from "../../types";
import { Planet } from "../planet/planet";
import { nearbyOrganisms, distanceWrapped } from "./spatialIndex";

/**
 * Same thresholds used in predation.ts to decide whether an organism is a
 * viable/hungry hunter. Duplicated here (not imported) to avoid a circular
 * dependency, since predation.ts imports recordDangerMemory from this file.
 * If predation.ts's thresholds of the same name ever change, update these
 * too.
 */
const CARNIVORY_HUNT_THRESHOLD = 0.35;
const HUNT_HUNGER_THRESHOLD = 110;

/** Bucket size for the shared spatial index used by movement/behavior each tick. */
export const BEHAVIOR_BUCKET_SIZE = 4;

const FLOCK_SEPARATION_RADIUS = 1.5;
const FLOCK_COHESION_WEIGHT = 0.35;
const FLOCK_SEPARATION_WEIGHT = 1.1;

const FEAR_WEIGHT = 1.3;
const HUNT_SEEK_WEIGHT = 0.9;

/** Radius (grid cells) an organism defends around its home against same-species intruders. */
const TERRITORY_RADIUS = 6;
const TERRITORY_WEIGHT = 0.7;

/** How lush a cell has to be before an organism bothers remembering it as a good feeding spot. */
const MEMORY_FOOD_VEGETATION_THRESHOLD = 0.5;
/** Ticks after which a memory (food or danger) is forgotten. */
const MEMORY_DECAY_TICKS = 300;
const MEMORY_ATTRACT_WEIGHT = 0.6;
const MEMORY_AVOID_WEIGHT = 1.1;

/** Detection radius for flocking/fear/hunting-seek/territoriality, scaled by the organism's own vision trait. */
function socialRadius(o: Organism): number {
  return Math.max(2, o.genome.vision);
}

export interface BehaviorBias {
  dx: number;
  dy: number;
}

/**
 * Computes a single blended movement-bias vector for one organism (v0.5),
 * layered on top of the existing vegetation-seeking movement in
 * movement.ts. Four independent behavioral pressures, plus spatial memory:
 *
 *  - flocking: same-species cohesion (drift toward nearby kin) and
 *    separation (don't crowd them) — a small boids-style pair of forces
 *    that produces loose group movement with no central coordination;
 *  - fear: bias away from the nearest organism that could hunt this one
 *    (higher carnivory, above the hunting threshold), strengthened by this
 *    organism's own evasion trait;
 *  - hunting-seek: a hungry, sufficiently carnivorous organism biases
 *    toward the nearest valid prey within sight, strengthened by its own
 *    huntingSkill trait. This does not replace the probabilistic
 *    contact-hunt in predation.ts — it only makes a hungry predator more
 *    likely to actually get within hunting range of prey in the first
 *    place;
 *  - territoriality: a same-species organism currently near its own home
 *    repels intruders (other same-species organisms not currently near
 *    their own home) that wander into its territory;
 *  - memory: an organism with a remembered food location is attracted
 *    toward it; one with a remembered danger location is repelled from it.
 *    Only the single most recent salient event is remembered (see
 *    OrganismMemory) and it fades linearly over MEMORY_DECAY_TICKS.
 *
 * None of this changes selection, reproduction, or mutation directly: it
 * only changes *where* an organism ends up, which then feeds into the
 * existing feeding/predation/reproduction mechanics exactly as before.
 */
export function computeBehaviorBias(
  organism: Organism,
  planet: Planet,
  buckets: Map<string, Organism[]>,
  bucketSize: number,
  tick: number,
): BehaviorBias {
  let dx = 0;
  let dy = 0;

  const vision = socialRadius(organism);
  const candidates = nearbyOrganisms(organism.position, buckets, bucketSize);

  let cohesionX = 0;
  let cohesionY = 0;
  let cohesionCount = 0;

  let nearestThreat: Organism | null = null;
  let nearestThreatDist = Infinity;

  let nearestPrey: Organism | null = null;
  let nearestPreyDist = Infinity;

  const isHunter = organism.genome.carnivory >= CARNIVORY_HUNT_THRESHOLD && organism.energy < HUNT_HUNGER_THRESHOLD;
  const selfNearHome = distanceWrapped(organism.position.x, organism.position.y, organism.home.x, organism.home.y, planet) < TERRITORY_RADIUS;

  for (const other of candidates) {
    if (other === organism || !other.alive) continue;
    const d = distanceWrapped(organism.position.x, organism.position.y, other.position.x, other.position.y, planet);
    if (d > vision || d === 0) continue;

    if (other.speciesId === organism.speciesId) {
      cohesionX += other.position.x - organism.position.x;
      cohesionY += other.position.y - organism.position.y;
      cohesionCount++;

      if (d < FLOCK_SEPARATION_RADIUS) {
        const push = (FLOCK_SEPARATION_RADIUS - d) / FLOCK_SEPARATION_RADIUS;
        dx -= ((other.position.x - organism.position.x) / d) * push * FLOCK_SEPARATION_WEIGHT;
        dy -= ((other.position.y - organism.position.y) / d) * push * FLOCK_SEPARATION_WEIGHT;
      }

      // Territoriality: `other` is a same-species neighbor defending its
      // own home range, and we are not defending ours right now, so if we
      // are inside its territory, it pushes us out.
      if (!selfNearHome) {
        const otherNearOwnHome = distanceWrapped(other.position.x, other.position.y, other.home.x, other.home.y, planet) < TERRITORY_RADIUS;
        const selfInsideOthersTerritory = distanceWrapped(organism.position.x, organism.position.y, other.home.x, other.home.y, planet) < TERRITORY_RADIUS;
        if (otherNearOwnHome && selfInsideOthersTerritory) {
          const distFromOtherHome = distanceWrapped(organism.position.x, organism.position.y, other.home.x, other.home.y, planet);
          const dirX = organism.position.x - other.home.x;
          const dirY = organism.position.y - other.home.y;
          const mag = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
          const strength = ((TERRITORY_RADIUS - distFromOtherHome) / TERRITORY_RADIUS) * TERRITORY_WEIGHT;
          dx += (dirX / mag) * strength;
          dy += (dirY / mag) * strength;
        }
      }
    } else {
      if (other.genome.carnivory >= CARNIVORY_HUNT_THRESHOLD && other.genome.carnivory > organism.genome.carnivory && d < nearestThreatDist) {
        nearestThreat = other;
        nearestThreatDist = d;
      }
      if (isHunter && other.genome.carnivory < organism.genome.carnivory && d < nearestPreyDist) {
        nearestPrey = other;
        nearestPreyDist = d;
      }
    }
  }

  if (cohesionCount > 0) {
    dx += (cohesionX / cohesionCount) * FLOCK_COHESION_WEIGHT * 0.1;
    dy += (cohesionY / cohesionCount) * FLOCK_COHESION_WEIGHT * 0.1;
  }

  if (nearestThreat) {
    const dirX = organism.position.x - nearestThreat.position.x;
    const dirY = organism.position.y - nearestThreat.position.y;
    const mag = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    const strength = (1 + organism.genome.evasion) * FEAR_WEIGHT * (1 - nearestThreatDist / vision);
    dx += (dirX / mag) * strength;
    dy += (dirY / mag) * strength;
  }

  if (nearestPrey) {
    const dirX = nearestPrey.position.x - organism.position.x;
    const dirY = nearestPrey.position.y - organism.position.y;
    const mag = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    const strength = (1 + organism.genome.huntingSkill) * HUNT_SEEK_WEIGHT * (1 - nearestPreyDist / vision);
    dx += (dirX / mag) * strength;
    dy += (dirY / mag) * strength;
  }

  if (organism.memory) {
    const age = tick - organism.memory.tick;
    if (age > MEMORY_DECAY_TICKS) {
      organism.memory = null;
    } else {
      const dirX = organism.memory.x - organism.position.x;
      const dirY = organism.memory.y - organism.position.y;
      const mag = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
      const freshness = 1 - age / MEMORY_DECAY_TICKS;
      const weight = (organism.memory.kind === "food" ? MEMORY_ATTRACT_WEIGHT : -MEMORY_AVOID_WEIGHT) * freshness;
      dx += (dirX / mag) * weight;
      dy += (dirY / mag) * weight;
    }
  }

  return { dx, dy };
}

/** Records the current location as a good feeding spot if it clears the "worth remembering" threshold. Overwrites any existing memory (only the most recent salient event is kept). */
export function recordFoodMemory(organism: Organism, vegetation: number, tick: number): void {
  if (vegetation >= MEMORY_FOOD_VEGETATION_THRESHOLD) {
    organism.memory = { x: organism.position.x, y: organism.position.y, tick, kind: "food" };
  }
}

/** Records the current location as dangerous — called when an organism survives a real hunting attempt against it. Always overwrites any existing memory: a near-death experience is the most salient thing that can happen. */
export function recordDangerMemory(organism: Organism, tick: number): void {
  organism.memory = { x: organism.position.x, y: organism.position.y, tick, kind: "danger" };
}
