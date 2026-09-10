/**
 * v1.2 — EXPERIMENTAL, under evaluation. Tracks how "established" each
 * feeding region (see FEEDING_REGION_SIZE in feeding.ts) is: a value in
 * [0, 1] that grows while the region is continuously occupied and decays
 * while it sits empty. A freshly colonized region starts at 0 (raw,
 * unexploited land a founder has just reached) and only gradually
 * approaches 1 (a mature, fully-exploited local ecosystem) — modeling the
 * real biological/ecological lag between "a species reaches a place" and
 * "a species is actually thriving there": unfamiliar predators and
 * hazards, immature social/foraging knowledge of the local terrain, and
 * an area that hasn't yet been shaped by sustained grazing/hunting
 * pressure into its long-run productive equilibrium.
 *
 * This is separate, region-level state — NOT a per-organism property —
 * which is the whole point: an individual born in a newly-settled region
 * doesn't inherit "already established" status just because it hatched
 * there (see organism.dispersalCost's doc comment for why a founder's
 * *offspring* don't pay the individual dispersal cost; establishment is
 * the complementary mechanism that keeps a young region's *overall*
 * productivity low regardless of who's living there, until it's had time
 * to mature).
 */

/** Ticks-ish to go from a brand new region (0) to fully established (1), since growth is linear: 1 / GROWTH_RATE. */
const GROWTH_RATE = 0.003;
/** Slower than growth: an abandoned region doesn't instantly revert to wild, but does over a long enough absence. */
const DECAY_RATE = 0.001;

export class RegionEstablishment {
  private levels = new Map<string, number>();

  /** Establishment level for a region, 0 (untouched) if never tracked. */
  get(key: string): number {
    return this.levels.get(key) ?? 0;
  }

  /**
   * v1.2 — marks regions as already fully established, bypassing the
   * growth ramp entirely. Used exactly once, at World construction, for
   * the regions the *founding* population is seeded into: the starting
   * population represents organisms already settled in the world, not
   * colonizers — only regions reached *later*, by organisms dispersing
   * out from where they already are, go through the settlement phase.
   */
  seedEstablished(keys: Iterable<string>): void {
    for (const key of keys) this.levels.set(key, 1);
  }

  /**
   * Advances every tracked region by one tick: occupied regions (present
   * in `occupiedKeys`) grow toward 1; everything else decays toward 0
   * (and is dropped once it reaches exactly 0, so abandoned regions don't
   * accumulate forever in memory — bounded by how many regions have ever
   * been visited, same reasoning as the rest of v1.1/v1.2's architecture).
   */
  update(occupiedKeys: Iterable<string>): void {
    const occupied = occupiedKeys instanceof Set ? occupiedKeys : new Set(occupiedKeys);

    for (const key of occupied) {
      const current = this.levels.get(key) ?? 0;
      this.levels.set(key, Math.min(1, current + GROWTH_RATE));
    }

    for (const [key, level] of this.levels) {
      if (occupied.has(key)) continue;
      const next = level - DECAY_RATE;
      if (next <= 0) this.levels.delete(key);
      else this.levels.set(key, next);
    }
  }

  /** Number of regions currently tracked (occupied now or recently), for diagnostics/benchmarking. */
  get trackedRegionCount(): number {
    return this.levels.size;
  }
}
