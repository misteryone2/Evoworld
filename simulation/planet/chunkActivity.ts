/**
 * v1.1 — World Scale. Pure computation of which terrain chunks should be
 * "active" (simulated this tick) given the current organism population.
 * Kept separate from World/Planet and free of any World-shaped types so
 * it's trivially unit-testable and reusable (e.g. by tooling/benchmarks)
 * without constructing a full World.
 *
 * Cost is O(population * haloRing^2), not O(world area): even a
 * population in the tens of thousands only ever touches a small, bounded
 * number of chunk-key insertions per organism, regardless of how large
 * the planet's declared width/height are.
 */

interface OrganismLike {
  alive: boolean;
  position: { x: number; y: number };
}

function wrapCoord(value: number, max: number): number {
  let v = Math.floor(value) % max;
  if (v < 0) v += max;
  return v;
}

function wrapChunkCoord(value: number, count: number): number {
  let v = value % count;
  if (v < 0) v += count;
  return v;
}

/**
 * Every chunk containing a living organism, plus a `haloRadius`-chunk ring
 * around each — the halo guarantees an organism near a chunk boundary
 * still has fresh (non-dormant) terrain to sense/step into, since its
 * neighboring chunk is kept active too rather than only its own. See
 * CHUNK_ACTIVATION_HALO in simulation/core/constants.ts for how the
 * default is sized relative to vision/movement ranges.
 */
export function computeActiveChunkKeys(
  organisms: OrganismLike[],
  worldWidth: number,
  worldHeight: number,
  chunkSize: number,
  haloRadius: number,
): Set<string> {
  const chunksX = Math.ceil(worldWidth / chunkSize);
  const chunksY = Math.ceil(worldHeight / chunkSize);
  const active = new Set<string>();

  for (const o of organisms) {
    if (!o.alive) continue;
    const wx = wrapCoord(o.position.x, worldWidth);
    const wy = wrapCoord(o.position.y, worldHeight);
    const cx = Math.floor(wx / chunkSize);
    const cy = Math.floor(wy / chunkSize);

    for (let dx = -haloRadius; dx <= haloRadius; dx++) {
      for (let dy = -haloRadius; dy <= haloRadius; dy++) {
        const ncx = wrapChunkCoord(cx + dx, chunksX);
        const ncy = wrapChunkCoord(cy + dy, chunksY);
        active.add(`${ncx},${ncy}`);
      }
    }
  }

  return active;
}
