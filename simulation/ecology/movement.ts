import type { Organism } from "../../types";
import { Random } from "../core/random";
import { Planet } from "../planet/planet";
import { computeSensoryChannels, recordFoodMemory } from "./behavior";
import { evaluateBrain, SENSORY_INPUT_SIZE } from "../biology/brain";

/**
 * Below this combined output magnitude from the organism's brain, treat it
 * as "no meaningful directional signal" and fall back to a small random
 * wander instead. This matters most early on (freshly-seeded random
 * brains, near v0.8's INIT_WEIGHT_STD, can easily produce near-zero
 * outputs) — without this fallback, an unlucky organism whose brain
 * happens to output ~(0,0) would simply never move, and would starve
 * before it ever got a chance to reproduce and pass on (better) weights.
 * This is not a behavioral rule being smuggled back in: it only ever
 * activates in the degenerate near-zero case, it doesn't compete with or
 * override any real signal the brain does produce.
 */
const BRAIN_OUTPUT_DEADZONE = 0.05;

/**
 * Moves an organism by one step. As of v0.8, the final direction is
 * decided by the organism's evolved brain (see
 * simulation/biology/brain.ts): movement.ts only assembles the sensory
 * input vector — vegetation direction (from its own local grid scan,
 * unchanged since v0.1) plus energy/flock/fear/hunt/territory/memory
 * (from behavior.ts's computeSensoryChannels, v0.8) — and asks the brain
 * what to do with it. Nothing here hand-combines those signals with fixed
 * weights anymore; how much to care about each one is exactly the part
 * that evolves.
 */
export function moveOrganism(
  organism: Organism,
  planet: Planet,
  rng: Random,
  buckets: Map<string, Organism[]>,
  bucketSize: number,
  tick: number,
): void {
  const { x, y } = organism.position;
  const visionRadius = Math.max(1, Math.round(organism.genome.vision / 5));
  const speed = Math.max(1, Math.round(organism.genome.speed));

  let bestX = x;
  let bestY = y;
  let bestVeg = planet.getCell(Math.round(x), Math.round(y))?.vegetation ?? 0;

  for (let dy = -visionRadius; dy <= visionRadius; dy++) {
    for (let dx = -visionRadius; dx <= visionRadius; dx++) {
      const nx = wrap(Math.round(x) + dx, planet.width);
      const ny = wrap(Math.round(y) + dy, planet.height);
      const cell = planet.getCell(nx, ny);
      if (cell.terrain === "ocean") continue;
      if (cell.vegetation > bestVeg) {
        bestVeg = cell.vegetation;
        bestX = nx;
        bestY = ny;
      }
    }
  }

  const vegDirX = Math.sign(bestX - x);
  const vegDirY = Math.sign(bestY - y);

  const s = computeSensoryChannels(organism, planet, buckets, bucketSize, tick);
  const inputs: number[] = [
    s.energyNorm,
    vegDirX,
    vegDirY,
    s.flockX,
    s.flockY,
    s.fearX,
    s.fearY,
    s.huntX,
    s.huntY,
    s.territoryX,
    s.territoryY,
    s.memoryX,
    s.memoryY,
  ];
  // Defensive: keeps evaluateBrain's fixed-size loop and this array in sync if either ever drifts.
  if (inputs.length !== SENSORY_INPUT_SIZE) {
    throw new Error(`movement.ts sensory input length (${inputs.length}) does not match brain.ts SENSORY_INPUT_SIZE (${SENSORY_INPUT_SIZE})`);
  }

  const [outX, outY] = evaluateBrain(organism.brain, inputs);

  let dirX = outX;
  let dirY = outY;
  if (Math.abs(dirX) < BRAIN_OUTPUT_DEADZONE && Math.abs(dirY) < BRAIN_OUTPUT_DEADZONE) {
    dirX = rng.intRange(-1, 1);
    dirY = rng.intRange(-1, 1);
  }
  const mag = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
  dirX /= mag;
  dirY /= mag;

  const newX = wrap(x + dirX * speed * rng.range(0.5, 1), planet.width);
  const newY = wrap(y + dirY * speed * rng.range(0.5, 1), planet.height);

  // Only commit to the step if it lands on traversable terrain. Without
  // this check, an organism could end up on an ocean cell simply because
  // the directional step overshot past the shoreline — silently defeating
  // ocean as a real geographic barrier between landmasses. If the step
  // would land in water, the organism simply stays put for this tick.
  const landingCell = planet.getCell(Math.round(newX) % planet.width, Math.round(newY) % planet.height);
  if (landingCell.terrain === "ocean") return;

  organism.position.x = newX;
  organism.position.y = newY;
  recordFoodMemory(organism, landingCell.vegetation, tick);
}

function wrap(value: number, max: number): number {
  let v = value % max;
  if (v < 0) v += max;
  return v;
}
