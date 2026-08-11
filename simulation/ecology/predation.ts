import type { Organism } from "../../types";
import { Random } from "../core/random";
import { Planet } from "../planet/planet";

const MAX_ENERGY = 150;

/** Below this carnivory value, an organism never attempts to hunt. */
const CARNIVORY_HUNT_THRESHOLD = 0.35;

/** How far (in grid cells) a predator can detect and reach prey. */
const HUNT_RADIUS = 4;

/** Base probability per tick that an eligible predator attempts a hunt at all. */
const HUNT_ATTEMPT_RATE = 0.35;

/** Energy cost paid for every hunt attempt, whether or not it succeeds — hunting has a real metabolic cost and risk, not just an upside. */
const HUNT_ENERGY_COST = 12;

/** Predators only bother hunting when below this energy level — a well-fed organism doesn't hunt "for free" on top of an already full energy reserve. */
const HUNT_HUNGER_THRESHOLD = 110;

/** Energy value of a successful kill before scaling by the predator's carnivory. */
const MEAT_ENERGY_VALUE = 55;

/**
 * Predator hunting power. Both size and speed matter — a predator needs to
 * be able to catch and subdue prey, so this is not just "biggest wins":
 * a fast, smaller predator can still out-hunt a slow, larger one.
 * huntingSkill (v0.3.3) is a direct multiplier on top of raw physical
 * power, representing acumen (ambush timing, tracking, coordination) that
 * specifically evolves in response to how evasive local prey have become.
 */
function huntingPower(o: Organism): number {
  return o.genome.size * o.genome.speed * (1 + o.genome.huntingSkill);
}

/**
 * Prey defensive power against a hunt. Uses the same size*speed base (a
 * bigger/faster prey is inherently harder to catch too) plus a fixed
 * baseline evasion advantage, multiplied by the prey's own evasion trait
 * (v0.3.3) — vigilance/agility that specifically evolves in response to
 * how skilled local predators have become. This is the other half of the
 * arms race: evasion directly counters huntingSkill in the same formula,
 * so neither trait can "win" once and for all — a rise in one creates
 * selection pressure for the other to rise too.
 */
function defensivePower(o: Organism): number {
  return o.genome.size * o.genome.speed * (1.15 + o.genome.evasion);
}

function distanceWrapped(ax: number, ay: number, bx: number, by: number, planet: Planet): number {
  const dx = Math.min(Math.abs(ax - bx), planet.width - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), planet.height - Math.abs(ay - by));
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Groups living organisms into spatial buckets sized to the hunt radius, so
 * a predator only needs to scan its own bucket and its 8 neighbors instead
 * of every organism on the planet — O(n) on average instead of O(n^2),
 * which matters once populations reach the thousands.
 */
function buildBuckets(organisms: Organism[], bucketSize: number): Map<string, Organism[]> {
  const buckets = new Map<string, Organism[]>();
  for (const o of organisms) {
    if (!o.alive) continue;
    const bx = Math.floor(o.position.x / bucketSize);
    const by = Math.floor(o.position.y / bucketSize);
    const key = `${bx},${by}`;
    const list = buckets.get(key);
    if (list) list.push(o);
    else buckets.set(key, [o]);
  }
  return buckets;
}

function nearbyCandidates(predator: Organism, buckets: Map<string, Organism[]>, bucketSize: number): Organism[] {
  const bx = Math.floor(predator.position.x / bucketSize);
  const by = Math.floor(predator.position.y / bucketSize);
  const candidates: Organism[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const list = buckets.get(`${bx + dx},${by + dy}`);
      if (list) candidates.push(...list);
    }
  }
  return candidates;
}

/**
 * Runs one tick of predation. Eligible predators (carnivory above
 * CARNIVORY_HUNT_THRESHOLD) may attempt to hunt the nearest valid prey
 * within HUNT_RADIUS. A predator only targets organisms with strictly
 * lower carnivory than itself — this keeps apex carnivores from endlessly
 * preying on each other and gives the food chain a clear direction
 * (herbivores and lower-carnivory omnivores are what gets hunted), while
 * still leaving room for real omnivore/omnivore interactions.
 *
 * Hunt success is probabilistic, based on relative hunting power (size ×
 * speed × (1 + huntingSkill)) between predator and prey defensive power
 * (size × speed × (1.15 + evasion)) (v0.3.3) — huntingSkill and evasion are
 * directly opposed in this formula, which is what creates a genuine
 * coevolutionary arms race: a rise in average evasion among prey erodes
 * predators' success rate, creating selection pressure for higher
 * huntingSkill, which in turn erodes prey survival and re-creates pressure
 * for more evasion. Additionally (v0.3.1), success is reduced by local
 * interference competition: the more other eligible predators are crowded
 * into the same area relative to available prey, the harder it is for any
 * one of them to actually land a kill. On a successful hunt, the prey dies
 * immediately and the predator gains energy scaled by its own carnivory (a
 * partial carnivore still gets a partial benefit from a kill).
 *
 * Returns the number of successful kills, for statistics.
 */
export function huntPrey(organisms: Organism[], planet: Planet, rng: Random): number {
  const bucketSize = HUNT_RADIUS;
  const buckets = buildBuckets(organisms, bucketSize);
  let kills = 0;

  for (const predator of organisms) {
    if (!predator.alive) continue;
    if (predator.genome.carnivory < CARNIVORY_HUNT_THRESHOLD) continue;
    if (predator.energy >= HUNT_HUNGER_THRESHOLD) continue; // not hungry enough to bother
    if (!rng.chance(predator.genome.carnivory * HUNT_ATTEMPT_RATE)) continue;

    const candidates = nearbyCandidates(predator, buckets, bucketSize);

    let target: Organism | null = null;
    let bestDistance = Infinity;
    let rivalPredators = 0;
    let availablePrey = 0;
    for (const other of candidates) {
      if (other === predator || !other.alive) continue;
      if (other.genome.carnivory >= CARNIVORY_HUNT_THRESHOLD) {
        rivalPredators++;
        continue;
      }
      if (other.genome.carnivory < predator.genome.carnivory) availablePrey++;
      if (other.genome.carnivory >= predator.genome.carnivory) continue;
      const d = distanceWrapped(predator.position.x, predator.position.y, other.position.x, other.position.y, planet);
      if (d <= HUNT_RADIUS && d < bestDistance) {
        bestDistance = d;
        target = other;
      }
    }
    if (!target) continue;

    // Hunting has a real cost: the attempt itself burns energy regardless
    // of whether it succeeds.
    predator.energy -= HUNT_ENERGY_COST;

    const predatorPower = huntingPower(predator);
    const preyPower = defensivePower(target);
    const baseChance = predatorPower / (predatorPower + preyPower);

    // Interference competition: more rival predators sharing a thinner
    // prey pool means each individual hunt is less likely to land.
    const interference = rivalPredators / (availablePrey + 1);
    const successChance = baseChance / (1 + interference);

    if (rng.chance(successChance)) {
      const energyGained = Math.min(MEAT_ENERGY_VALUE, target.energy + 30) * predator.genome.carnivory;
      predator.energy = Math.min(MAX_ENERGY, predator.energy + energyGained);
      target.alive = false;
      kills++;
    }
  }

  return kills;
}
