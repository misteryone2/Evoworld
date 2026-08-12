import type { Organism, Vector2 } from "../../types";
import { Planet } from "../planet/planet";

/**
 * Groups living organisms into spatial buckets of the given size so nearby
 * queries only need to scan a 3x3 neighborhood of buckets instead of every
 * organism on the planet — O(n) on average instead of O(n^2). Shared by
 * predation.ts (hunting) and behavior.ts (flocking/fear/territoriality),
 * so both use the same neighbor-finding logic.
 */
export function buildOrganismBuckets(organisms: Organism[], bucketSize: number): Map<string, Organism[]> {
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

/** Every organism in the 3x3 bucket neighborhood around a position (candidates only — still needs an actual distance check). */
export function nearbyOrganisms(origin: Vector2, buckets: Map<string, Organism[]>, bucketSize: number): Organism[] {
  const bx = Math.floor(origin.x / bucketSize);
  const by = Math.floor(origin.y / bucketSize);
  const candidates: Organism[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const list = buckets.get(`${bx + dx},${by + dy}`);
      if (list) candidates.push(...list);
    }
  }
  return candidates;
}

/** Distance between two points on the planet, accounting for east-west/north-south wraparound. */
export function distanceWrapped(ax: number, ay: number, bx: number, by: number, planet: Planet): number {
  const dx = Math.min(Math.abs(ax - bx), planet.width - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), planet.height - Math.abs(ay - by));
  return Math.sqrt(dx * dx + dy * dy);
}
