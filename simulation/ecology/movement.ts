import type { Organism } from "../../types";
import { Random } from "../core/random";
import { Planet } from "../planet/planet";

/**
 * Moves an organism by one step. Movement is simple for v0.1: a random walk
 * biased toward cells with more vegetation within the organism's vision
 * range, scaled by its speed trait. This is intentionally not a full
 * sensory/decision system (that belongs to a later roadmap version) but it
 * is enough for food-seeking behavior to matter for survival.
 */
export function moveOrganism(organism: Organism, planet: Planet, rng: Random): void {
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

  const dirX = Math.sign(bestX - x) || rng.intRange(-1, 1);
  const dirY = Math.sign(bestY - y) || rng.intRange(-1, 1);

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
}

function wrap(value: number, max: number): number {
  let v = value % max;
  if (v < 0) v += max;
  return v;
}
