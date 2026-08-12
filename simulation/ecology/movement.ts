import type { Organism } from "../../types";
import { Random } from "../core/random";
import { Planet } from "../planet/planet";
import { computeBehaviorBias, recordFoodMemory } from "./behavior";

/** Relative weight of vegetation-seeking versus the combined behavioral bias (flocking/fear/hunting-seek/territoriality/memory). */
const VEGETATION_SEEK_WEIGHT = 1;

/**
 * Moves an organism by one step. The base drive (since v0.1) is a bias
 * toward cells with more vegetation within the organism's vision range,
 * scaled by its speed trait. Since v0.5, that vegetation-seeking direction
 * is blended with a behavioral bias vector (see behavior.ts: flocking,
 * fear, hunting-seek, territoriality, spatial memory) before the organism
 * actually commits to a step — so a hungry herbivore might still veer
 * toward the best-looking patch of grass, but a nearby predator, a remembered
 * danger spot, or the pull of its own flock can override or bend that path.
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

  const behavior = computeBehaviorBias(organism, planet, buckets, bucketSize, tick);

  let dirX = Math.sign(bestX - x) * VEGETATION_SEEK_WEIGHT + behavior.dx;
  let dirY = Math.sign(bestY - y) * VEGETATION_SEEK_WEIGHT + behavior.dy;

  if (Math.abs(dirX) < 0.01 && Math.abs(dirY) < 0.01) {
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
