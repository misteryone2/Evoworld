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
/** Same value as MAX_ENERGY in predation.ts, duplicated for the same reason above — used only to normalize the energy sensory input to roughly [0, 1]. */
const MAX_ENERGY = 150;

/** Bucket size for the shared spatial index used by movement/behavior each tick. */
export const BEHAVIOR_BUCKET_SIZE = 4;

const FLOCK_SEPARATION_RADIUS = 1.5;
/**
 * These two constants control the *internal* balance between cohesion and
 * separation when aggregating multiple same-species neighbors into one
 * "flock" sensory channel — i.e. how raw stimuli get combined into a
 * single signal, closer to fixed sensory physiology than to a behavioral
 * decision. What to actually DO with that combined signal (how much to
 * care about it at all, relative to fear/hunting/territory/memory) is the
 * part left to the evolved brain (v0.8) — see brain.ts.
 */
const FLOCK_COHESION_WEIGHT = 0.35;
const FLOCK_SEPARATION_WEIGHT = 1.1;

/** Radius (grid cells) an organism defends around its home against same-species intruders. */
const TERRITORY_RADIUS = 6;

/** How lush a cell has to be before an organism bothers remembering it as a good feeding spot. */
const MEMORY_FOOD_VEGETATION_THRESHOLD = 0.5;
/** Ticks after which a memory (food or danger) is forgotten. */
const MEMORY_DECAY_TICKS = 300;

/** Detection radius for flocking/fear/hunting-seek/territoriality, scaled by the organism's own vision trait. */
function socialRadius(o: Organism): number {
  return Math.max(2, o.genome.vision);
}

/**
 * Raw sensed signals for one organism (v0.8), each an (x, y) direction —
 * NOT yet combined into a single movement decision. Up through v0.5 these
 * were summed with fixed hand-picked weights right here in behavior.ts;
 * from v0.8 on, that combination is instead the job of the organism's
 * evolved brain (see simulation/biology/brain.ts and movement.ts, which
 * assembles these channels plus energy and vegetation-direction into the
 * network's input vector). This function only does sensing, never
 * decides.
 */
export interface SensoryChannels {
  /** Current energy, normalized to roughly [0, 1]. */
  energyNorm: number;
  /** Same-species cohesion+separation, aggregated (see FLOCK_*_WEIGHT above for why this part stays fixed). */
  flockX: number;
  flockY: number;
  /** Direction away from the nearest organism that could hunt this one, scaled by proximity and this organism's own evasion trait. */
  fearX: number;
  fearY: number;
  /** Direction toward the nearest valid prey, only nonzero while this organism is itself a hungry, eligible hunter; scaled by proximity and its own huntingSkill trait. */
  huntX: number;
  huntY: number;
  /** Direction away from a same-species neighbor's defended home range, when this organism is intruding on it. */
  territoryX: number;
  territoryY: number;
  /** Direction toward a remembered food location, or away from a remembered danger location; fades linearly over MEMORY_DECAY_TICKS. */
  memoryX: number;
  memoryY: number;
}

const EMPTY_CHANNELS: SensoryChannels = {
  energyNorm: 0,
  flockX: 0,
  flockY: 0,
  fearX: 0,
  fearY: 0,
  huntX: 0,
  huntY: 0,
  territoryX: 0,
  territoryY: 0,
  memoryX: 0,
  memoryY: 0,
};

/**
 * Senses the local environment for one organism and returns each signal
 * separately (v0.8) — see SensoryChannels. Nothing here decides how much
 * any of this should matter; that combination happens in the organism's
 * evolved brain (movement.ts assembles these into the network's input
 * vector and calls evaluateBrain).
 */
export function computeSensoryChannels(
  organism: Organism,
  planet: Planet,
  buckets: Map<string, Organism[]>,
  bucketSize: number,
  tick: number,
): SensoryChannels {
  const channels: SensoryChannels = { ...EMPTY_CHANNELS };
  channels.energyNorm = Math.max(0, Math.min(1.2, organism.energy / MAX_ENERGY));

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
        channels.flockX -= ((other.position.x - organism.position.x) / d) * push * FLOCK_SEPARATION_WEIGHT;
        channels.flockY -= ((other.position.y - organism.position.y) / d) * push * FLOCK_SEPARATION_WEIGHT;
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
          const strength = (TERRITORY_RADIUS - distFromOtherHome) / TERRITORY_RADIUS;
          channels.territoryX += (dirX / mag) * strength;
          channels.territoryY += (dirY / mag) * strength;
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
    channels.flockX += (cohesionX / cohesionCount) * FLOCK_COHESION_WEIGHT * 0.1;
    channels.flockY += (cohesionY / cohesionCount) * FLOCK_COHESION_WEIGHT * 0.1;
  }

  if (nearestThreat) {
    const dirX = organism.position.x - nearestThreat.position.x;
    const dirY = organism.position.y - nearestThreat.position.y;
    const mag = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    const strength = (1 + organism.genome.evasion) * (1 - nearestThreatDist / vision);
    channels.fearX = (dirX / mag) * strength;
    channels.fearY = (dirY / mag) * strength;
  }

  if (nearestPrey) {
    const dirX = nearestPrey.position.x - organism.position.x;
    const dirY = nearestPrey.position.y - organism.position.y;
    const mag = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    const strength = (1 + organism.genome.huntingSkill) * (1 - nearestPreyDist / vision);
    channels.huntX = (dirX / mag) * strength;
    channels.huntY = (dirY / mag) * strength;
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
      const sign = organism.memory.kind === "food" ? 1 : -1;
      channels.memoryX = (dirX / mag) * sign * freshness;
      channels.memoryY = (dirY / mag) * sign * freshness;
    }
  }

  return channels;
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
