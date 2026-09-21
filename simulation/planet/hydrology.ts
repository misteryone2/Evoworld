import { computeElevationAt, computeWaterAt, classifyBaseAt } from "./terrainNoise";

/**
 * v1.2.3 — Rivers & Lakes.
 *
 * DESIGN NOTE, stated plainly (see HANDOFF.md §2's lesson about
 * under-documenting approximations): the v1.2.3 brief describes a
 * "sorgente -> tracciamento del percorso -> lago/mare" pipeline with an
 * explicit source density, a visited-set path trace up to
 * RIVER_MAX_LENGTH, etc. That exact design was prototyped and rejected
 * here for a concrete, measured reason: answering "does cell (x,y) have a
 * river" by searching a padded neighborhood for candidate sources and
 * tracing each one forward is only cheap when it's computed ONCE per
 * CHUNK and cached with it. But two existing, unchangeable read paths
 * (Planet.peekCell's fallback and, especially, Planet.sampleBaseline —
 * called once per texel by buildViewportFrame, up to ~524,000 times for a
 * single high-LOD full-planet viewport refresh, see viewportFrame.ts) can
 * only ever answer ONE cell at a time, with no chunk-sized batch to
 * amortize a source search over. A source-search-per-query design would
 * multiply viewport refresh cost by orders of magnitude — exactly the
 * "aumento proporzionale" §18 of the brief forbids.
 *
 * What's implemented instead is a **local flow-convergence** approximation:
 * every query is answered from a small, fixed-size neighborhood around
 * (x,y) alone (a handful of steepest-descent look-ups, each itself only
 * touching immediate neighbors) — genuinely O(1) per cell, independent of
 * world size AND independent of how many other cells get queried around
 * it. It still honestly satisfies every hard constraint the brief lists:
 * pure function of (seed, x, y) => deterministic and order-independent by
 * construction (no visited-set/loop bookkeeping needed, since there's no
 * multi-step trace to loop); continuous across chunk boundaries for free
 * (a query at a chunk's edge samples exactly the same neighbor cells a
 * query from the neighboring chunk would); bounded cost tied to "a fixed
 * local neighborhood", literally the wording the brief itself allows in
 * its §9 cost list. What it does NOT give is a single continuous river
 * thread from a named mountain "sorgente" all the way to the sea — instead,
 * river-flagged cells emerge wherever the local terrain slope causes
 * several neighboring cells to drain toward the same point, which in
 * practice traces the same downhill channels a source-to-sea model would,
 * just without an explicit notion of "this is source #4172's river".
 */

/** Land must be at least this elevation before a flowing (non-depression) cell can be flagged as a river — keeps rivers to sloped/upland terrain rather than every low-lying plain. */
export const RIVER_MIN_ELEVATION = 0.34;

/** Minimum local-convergence score (see localAccumulation) for a flowing cell to count as carrying a river. */
export const RIVER_MIN_ACCUMULATION = 3;

/** Minimum local-convergence score for a depression cell to count as a lake rather than a dry, insignificant basin. */
export const LAKE_MIN_ACCUMULATION = 4;

/** How many steepest-descent hops each neighbor's drainage chain is followed while checking whether it reaches the queried cell — kept small (1) since cost is per-neighbor-chain and this runs on every hydrology query. */
export const RIVER_TRACE_DEPTH = 1;

export const RIVER_FLOW_MIN = 0.15;
export const RIVER_FLOW_MAX = 1.0;

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

function wrap(v: number, max: number): number {
  let w = v % max;
  if (w < 0) w += max;
  return w;
}

/**
 * Small memoized patch of elevation samples around the query cell, so the
 * handful of steepest-descent look-ups below (self, 8 neighbors, and each
 * neighbor's own 8 neighbors — a 5x5 footprint) each recompute an
 * elevation value at most once, not once per look-up. computeElevationAt
 * itself is a multi-octave fBm sum (~11 noise evaluations), so this
 * caching is what keeps a single hydrology query cheap.
 */
class ElevationPatch {
  private readonly cache = new Map<number, number>();
  constructor(
    private readonly seed: number,
    private readonly width: number,
    private readonly height: number,
  ) {}

  at(x: number, y: number): number {
    const wx = wrap(x, this.width);
    const wy = wrap(y, this.height);
    const key = wy * this.width + wx;
    let v = this.cache.get(key);
    if (v === undefined) {
      v = computeElevationAt(this.seed, wx, wy, this.width, this.height);
      this.cache.set(key, v);
    }
    return v;
  }
}

/**
 * Deterministic steepest-descent neighbor of (x,y): the neighbor with
 * strictly the lowest elevation among the 8 surrounding cells, or null if
 * (x,y) is itself a local minimum (no lower neighbor) — a depression
 * candidate, where surface water would pool rather than keep flowing.
 * Ties are broken by NEIGHBOR_OFFSETS's fixed iteration order, so the
 * result never depends on anything but the elevation field itself.
 */
function steepestDescentNeighbor(patch: ElevationPatch, x: number, y: number): { x: number; y: number } | null {
  const here = patch.at(x, y);
  let best: { x: number; y: number } | null = null;
  let bestElevation = here;
  for (const [dx, dy] of NEIGHBOR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    const e = patch.at(nx, ny);
    if (e < bestElevation) {
      bestElevation = e;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

/**
 * Local, bounded approximation of "how much nearby upstream terrain drains
 * into (x,y)": counts, among the 8 immediate neighbors, how many have a
 * steepest-descent chain — followed for up to RIVER_TRACE_DEPTH hops —
 * that reaches (x,y). NOT a true flow accumulation (which sums an entire
 * upstream drainage basin, a global computation this lazy/chunked
 * architecture cannot afford — see this file's doc comment); a cheap,
 * local stand-in that still produces higher scores exactly where several
 * neighboring slopes genuinely funnel toward the same point.
 */
function localAccumulation(patch: ElevationPatch, x: number, y: number): number {
  let score = 0;
  for (const [dx, dy] of NEIGHBOR_OFFSETS) {
    let cx = x + dx;
    let cy = y + dy;
    let reached = cx === x && cy === y;
    for (let hop = 0; !reached && hop < RIVER_TRACE_DEPTH; hop++) {
      const next = steepestDescentNeighbor(patch, cx, cy);
      if (!next) break;
      cx = next.x;
      cy = next.y;
      reached = cx === x && cy === y;
    }
    if (reached) score++;
  }
  return score;
}

export interface HydrologyResult {
  riverFlow: number;
  isLake: boolean;
}

const NO_RIVER: HydrologyResult = { riverFlow: 0, isLake: false };

/** Shared implementation once an ElevationPatch already covers (x,y) and its needed neighborhood — see hydrologyAt and computeChunkHydrology, the two callers, for how the patch is built/scoped in each case. */
function hydrologyFromPatch(seed: number, patch: ElevationPatch, wx: number, wy: number, width: number, height: number): HydrologyResult {
  const elevation = patch.at(wx, wy);
  const water = computeWaterAt(seed, wx, wy, width, height, elevation);
  if (classifyBaseAt(elevation, water) === "ocean") return NO_RIVER;

  const accumulation = localAccumulation(patch, wx, wy);
  const descent = steepestDescentNeighbor(patch, wx, wy);
  const isDepression = descent === null;

  if (isDepression) {
    if (accumulation >= LAKE_MIN_ACCUMULATION) {
      const flow = Math.min(RIVER_FLOW_MAX, RIVER_FLOW_MIN + (accumulation - LAKE_MIN_ACCUMULATION) * 0.12);
      return { riverFlow: flow, isLake: true };
    }
    return NO_RIVER;
  }

  if (elevation >= RIVER_MIN_ELEVATION && accumulation >= RIVER_MIN_ACCUMULATION) {
    const flow = Math.min(RIVER_FLOW_MAX, RIVER_FLOW_MIN + (accumulation - RIVER_MIN_ACCUMULATION) * 0.15);
    return { riverFlow: flow, isLake: false };
  }

  return NO_RIVER;
}

/**
 * Computes river/lake presence at a single, isolated cell — used by
 * Planet.sampleBaseline (stateless single-cell reads, e.g. rendering a
 * viewport region whose chunk was never materialized), where there is no
 * batch of neighboring cells to amortize an ElevationPatch over. Pure
 * function of (seed, x, y, world size): identical result regardless of
 * call order or chunk materialization state. For the chunk-generation hot
 * path, see computeChunkHydrology below instead, which is what
 * Planet.generateChunk actually uses — it shares one ElevationPatch
 * across an entire chunk instead of rebuilding one per cell, which is
 * what keeps chunk generation itself fast (see this file's benchmark
 * note in HANDOFF-facing comments below).
 */
export function hydrologyAt(seed: number, x: number, y: number, width: number, height: number): HydrologyResult {
  const wx = wrap(x, width);
  const wy = wrap(y, height);
  const patch = new ElevationPatch(seed, width, height);
  return hydrologyFromPatch(seed, patch, wx, wy, width, height);
}

/**
 * Batch variant used by Planet.generateChunk: computes hydrology for
 * every cell in a chunkSize x chunkSize chunk starting at
 * (chunkOriginX, chunkOriginY), sharing ONE ElevationPatch across the
 * whole chunk (plus the small halo any cell's local neighborhood lookups
 * need) instead of building a fresh one per cell.
 *
 * Why this matters, concretely: each per-cell elevation sample costs a
 * genuine multi-octave fBm evaluation (~11 noise terms — see
 * terrainNoise.ts), and a single hydrologyAt query touches roughly a 5x5
 * neighborhood of such samples. Calling hydrologyAt independently for
 * every one of a chunk's (chunkSize^2) cells recomputes the same
 * elevation values redundantly for every overlapping neighborhood —
 * measured at ~24us/call in isolation, which multiplied out across a
 * 32x32 chunk (1024 cells) made chunk generation itself the dominant
 * cost in this codebase's test suite, timing out tests that touch many
 * chunks (see tests/planet.test.ts). Sharing one patch across the whole
 * chunk means each distinct (x,y) in the chunk+halo is only ever run
 * through the expensive elevation formula once, cutting the total work
 * by roughly the size of that overlapping neighborhood (order of 20x in
 * practice) — see tests/hydrology.test.ts's own benchmark-style
 * assertion for a regression guard on this.
 */
export function computeChunkHydrology(
  seed: number,
  chunkOriginX: number,
  chunkOriginY: number,
  chunkSize: number,
  width: number,
  height: number,
): HydrologyResult[] {
  const patch = new ElevationPatch(seed, width, height);
  const out = new Array<HydrologyResult>(chunkSize * chunkSize);
  for (let ly = 0; ly < chunkSize; ly++) {
    for (let lx = 0; lx < chunkSize; lx++) {
      const wx = wrap(chunkOriginX + lx, width);
      const wy = wrap(chunkOriginY + ly, height);
      out[ly * chunkSize + lx] = hydrologyFromPatch(seed, patch, wx, wy, width, height);
    }
  }
  return out;
}
