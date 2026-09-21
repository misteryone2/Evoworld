import type { Cell, PlanetChunkSnapshot, PlanetConfig, Season, TerrainType } from "../../types";
import { TICKS_PER_YEAR, DEFAULT_CHUNK_SIZE } from "../core/constants";
import { hashNoise, computeElevationAt, computeWaterAt, classifyBaseAt } from "./terrainNoise";
import { hydrologyAt, computeChunkHydrology, type HydrologyResult } from "./hydrology";

/** Wraps a coordinate into [0, max). */
function wrapCoord(value: number, max: number): number {
  let v = Math.floor(value) % max;
  if (v < 0) v += max;
  return v;
}

/** "cx,cy" chunk map key. */
function chunkKeyOf(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

function parseChunkKey(key: string): { cx: number; cy: number } {
  const [cx, cy] = key.split(",").map(Number);
  return { cx, cy };
}

/**
 * Season-dependent vegetation growth multiplier for a given tick — the
 * same formula Planet.update has always used, pulled out so the exact
 * per-tick path and the dormant-chunk catch-up path (see catchUpCell)
 * can both call it.
 */
function growthFactorForTick(tick: number): number {
  const season = Planet.seasonForTick(tick);
  return season === "inverno" ? 0.3 : season === "estate" ? 1.6 : 1;
}

/** Average of growthFactorForTick over a full year — the closed-form limit catch-up uses for long dormancy spans (>= one year). */
const YEARLY_AVG_GROWTH_FACTOR = (1 + 1.6 + 1 + 0.3) / 4; // primavera + estate + autunno + inverno

/**
 * Planet owns the world's terrain as a lazily-generated, chunked grid of
 * Cells (v1.1 — World Scale) and the logic to generate and evolve the
 * environment over time (seasonal temperature cycle, vegetation regrowth,
 * dynamic biome reclassification). It has no knowledge of organisms,
 * genetics, or rendering.
 *
 * ARCHITECTURE (v1.1): the planet's *declared* size (config.width/height)
 * is completely decoupled from how much terrain is actually held in
 * memory or updated per tick. Terrain is divided into square chunks
 * (config.chunkSize, default DEFAULT_CHUNK_SIZE); a chunk is generated —
 * pure function of (seed, chunk coords), independent of visit order — the
 * first time any cell inside it is read via getCell, and only chunks
 * passed to update() as "active" (i.e. containing organisms, plus a
 * halo — see World.step and chunkActivity.ts) are advanced through
 * climate/vegetation simulation each tick. A chunk that goes dormant
 * (no organism nearby) simply stops being touched — its cells hold
 * whatever state they had; when it reactivates, catchUpCell applies a
 * closed-form approximation of the elapsed vegetation regrowth and
 * recomputes a plausible current temperature, rather than replaying every
 * skipped tick one by one (see catchUpCell for the exact math and its
 * documented approximations).
 *
 * This means memory and per-tick CPU cost track how much of the world has
 * actually been visited/populated, not its nominal width*height — a
 * 2048x2048 "Grande" world with a population clustered in one region costs
 * roughly the same as a much smaller world would have, pre-v1.1.
 */
export class Planet {
  readonly config: PlanetConfig;
  readonly chunkSize: number;

  private chunks = new Map<string, Cell[]>();
  private chunkLastActiveTick = new Map<string, number>();

  constructor(config: PlanetConfig) {
    this.config = config;
    this.chunkSize = config.chunkSize ?? DEFAULT_CHUNK_SIZE;
    // v1.2.1 — terrain generation is now purely hash/noise-based (see
    // fbm2D/valueNoise2D above), a pure function of (seed, x, y) with no
    // state to precompute at all — not even the ~11 field points v1.1
    // used to seed once here. One fewer moving part, and one fewer thing
    // that would need to be serialized to stay reproducible.
  }

  get width(): number {
    return this.config.width;
  }

  get height(): number {
    return this.config.height;
  }

  get chunksX(): number {
    return Math.ceil(this.config.width / this.chunkSize);
  }

  get chunksY(): number {
    return Math.ceil(this.config.height / this.chunkSize);
  }

  /** Row-major index for (x, y) within the planet's declared width — a stable per-cell key, independent of chunking. */
  index(x: number, y: number): number {
    return y * this.config.width + x;
  }

  /**
   * v1.2.1 — continent/ocean/mountain-scale elevation, replacing the old
   * flat sum of ~6 random "blobs" (which gave plausible-looking but
   * structurally shallow noise — no real macro-scale landmasses, no
   * ridge-like mountain ranges). Three fBm layers, each with a distinct
   * role, matching the spec's low/mid/high-frequency breakdown:
   *
   *  - continental (low frequency, large amplitude): the dominant term —
   *    where the large landmasses and ocean basins actually are.
   *  - ridged (mid frequency, `1 - |noise|` transform): produces
   *    ridge-line structure instead of smooth bumps, i.e. actual mountain
   *    *ranges* rather than isolated random peaks. Weighted by a smooth
   *    land mask derived from the continental layer, so ranges form
   *    preferentially on already-elevated land — mountains emerging from
   *    continents, not scattered mid-ocean, the way real orogeny works.
   *  - detail (high frequency, small amplitude): local roughness on top.
   *
   * The weighted sum is redistributed through a mild power curve (see
   * ELEVATION_REDISTRIBUTION_POWER) to sharpen the ocean/continent
   * contrast — wide, mostly-flat ocean basins and mostly-flat lowlands,
   * with elevation rising more steeply near landmass cores — a common,
   * well-understood fBm terrain technique, not a hand-authored shape.
   */
  private computeElevation(x: number, y: number): number {
    const { width, height, seed } = this.config;
    return computeElevationAt(seed, x, y, width, height);
  }

  /**
   * v1.2.1 — water field. Still primarily its own noise layer at this
   * stage (full geographic coupling to actual oceans/rivers/lakes is
   * v1.2.4's job, deliberately not done here — see that version's plan),
   * but no longer *entirely* decoupled from elevation as the old blob
   * field was: low-lying terrain gets a mild wetness bias (basins collect
   * water, peaks don't), which is the minimal, honest first step the
   * v1.2.1 brief asked for ("prepara una base coerente con la futura
   * integrazione geografica") without overreaching into v1.2.4's scope.
   */
  private computeWater(x: number, y: number, elevation: number): number {
    const { width, height, seed } = this.config;
    return computeWaterAt(seed, x, y, width, height, elevation);
  }

  /** Structural classification from elevation/water — fixed for the planet's lifetime. */
  private static classifyBase(elevation: number, water: number): "ocean" | "mountain" | null {
    return classifyBaseAt(elevation, water);
  }

  /** Climate-dependent biome for non-ocean, non-mountain land — see Planet.update's doc comment on the class for why this is re-evaluated over time. */
  private static classifyBiome(temperature: number, water: number, vegetation: number): TerrainType {
    if (temperature < 2) return "tundra";
    if (water < 0.22 && vegetation < 0.35) return "desert";
    if (vegetation > 0.62) return "forest";
    if (temperature > 24 && vegetation < 0.5) return "savanna";
    return "plains";
  }

  /**
   * Computes one cell's baseline (freshly-generated) value, purely from
   * its coordinates — no chunk materialization, no caching, no time
   * dependency. This is the exact same formula a chunk is generated with
   * (see generateChunk); it's also used directly by sampleBaseline for
   * cheap, memory-free terrain reads (e.g. a distant/never-visited region
   * shown in an overview render).
   */
  /**
   * `precomputedHydro`, when given, skips a fresh per-cell hydrologyAt
   * call in favor of a result already computed by computeChunkHydrology's
   * shared, chunk-wide ElevationPatch — see generateChunk, the only
   * caller that passes it, and hydrology.ts's doc comment on
   * computeChunkHydrology for why this batching matters for performance.
   * sampleBaseline (single isolated cells, no chunk context) omits it and
   * falls back to the per-cell hydrologyAt path instead.
   */
  private computeCellBaseline(x: number, y: number, precomputedHydro?: HydrologyResult | null): Cell {
    const { width, height, seed } = this.config;
    const elevation = this.computeElevation(x, y);
    const water = this.computeWater(x, y, elevation);
    const latitude = Math.abs(y / height - 0.5) * 2; // 0 at equator, 1 at poles
    const temperature = 32 - latitude * 40 - elevation * 10 + hashNoise(seed, x, y) * 2;

    const base = Planet.classifyBase(elevation, water);
    const vegetation = base === "ocean"
      ? 0
      : Math.max(0, Math.min(1, (1 - Math.abs(temperature - 22) / 40) * (1 - Math.abs(water - 0.4))));

    const terrain: TerrainType = base ?? Planet.classifyBiome(temperature, water, vegetation);

    // v1.2.3 — Rivers & Lakes: a small, bounded, local-neighborhood query
    // (see hydrology.ts's doc comment for why this — not global flow
    // accumulation or long source-to-sea path tracing — is what the
    // lazy/chunked architecture can afford), pure function of (seed, x, y)
    // like every other channel here, so it's automatically deterministic,
    // order-independent and continuous across chunk boundaries with zero
    // extra bookkeeping.
    const hydro = base === "ocean" ? null : (precomputedHydro !== undefined ? precomputedHydro : hydrologyAt(seed, x, y, width, height));

    return {
      elevation,
      temperature,
      water,
      vegetation,
      terrain,
      riverFlow: hydro && hydro.riverFlow > 0 ? hydro.riverFlow : undefined,
      isLake: hydro?.isLake || undefined,
    };
  }

  private generateChunk(cx: number, cy: number): Cell[] {
    const cs = this.chunkSize;
    const { width, height, seed } = this.config;
    const cells = new Array<Cell>(cs * cs);
    // v1.2.3 — one shared ElevationPatch for the whole chunk (see
    // hydrology.ts's computeChunkHydrology doc comment) instead of a
    // fresh per-cell query; this is what keeps chunk generation itself
    // fast now that every cell also carries a hydrology result.
    const chunkHydro = computeChunkHydrology(seed, cx * cs, cy * cs, cs, width, height);
    for (let ly = 0; ly < cs; ly++) {
      for (let lx = 0; lx < cs; lx++) {
        const wx = cx * cs + lx;
        const wy = cy * cs + ly;
        // Boundary chunks on a world whose size isn't an exact multiple
        // of chunkSize (only possible for small/legacy configs — every
        // v1.1 preset is an exact multiple) have local slots beyond the
        // planet's real width/height that no wrapped (x, y) ever maps
        // to; still generated for code simplicity, just never read.
        cells[ly * cs + lx] = this.computeCellBaseline(wx, wy, chunkHydro[ly * cs + lx]);
      }
    }
    return cells;
  }

  /**
   * Authoritative cell accessor: materializes (generates once, then
   * caches) the owning chunk if it isn't already resident. Used by the
   * simulation (movement/feeding/predation) — the only code path allowed
   * to grow chunk memory, by design (see sampleBaseline/peekCell for the
   * read-only, non-materializing alternatives used by rendering).
   */
  getCell(x: number, y: number): Cell {
    const wx = wrapCoord(x, this.config.width);
    const wy = wrapCoord(y, this.config.height);
    const cx = Math.floor(wx / this.chunkSize);
    const cy = Math.floor(wy / this.chunkSize);
    const lx = wx - cx * this.chunkSize;
    const ly = wy - cy * this.chunkSize;
    const key = chunkKeyOf(cx, cy);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = this.generateChunk(cx, cy);
      this.chunks.set(key, chunk);
    }
    return chunk[ly * this.chunkSize + lx];
  }

  /**
   * Read-only cell accessor for rendering: returns the *real, live* cell
   * if its chunk has already been materialized by the simulation, or null
   * otherwise — never generates/caches a new chunk. This is what lets the
   * render path show accurate detail exactly where the simulation is
   * actually active (near organisms) while staying O(1) and memory-free
   * everywhere else (see sampleBaseline for the fallback used there).
   */
  peekCell(x: number, y: number): Cell | null {
    const wx = wrapCoord(x, this.config.width);
    const wy = wrapCoord(y, this.config.height);
    const cx = Math.floor(wx / this.chunkSize);
    const cy = Math.floor(wy / this.chunkSize);
    const chunk = this.chunks.get(chunkKeyOf(cx, cy));
    if (!chunk) return null;
    const lx = wx - cx * this.chunkSize;
    const ly = wy - cy * this.chunkSize;
    return chunk[ly * this.chunkSize + lx];
  }

  /**
   * Stateless baseline read: the same value getCell would produce for a
   * chunk seen for the very first time, computed directly with no chunk
   * materialization or caching at all. Used for cheap, memory-free
   * overview rendering of regions the simulation has never touched — see
   * simulation/core/viewportFrame.ts.
   */
  sampleBaseline(x: number, y: number): Cell {
    const wx = wrapCoord(x, this.config.width);
    const wy = wrapCoord(y, this.config.height);
    return this.computeCellBaseline(wx, wy);
  }

  hasChunk(cx: number, cy: number): boolean {
    return this.chunks.has(chunkKeyOf(cx, cy));
  }

  /** Returns the current season for a given tick, based on a full-year cycle. */
  static seasonForTick(tick: number): Season {
    const phase = (tick % TICKS_PER_YEAR) / TICKS_PER_YEAR; // 0..1 through the year
    if (phase < 0.25) return "primavera";
    if (phase < 0.5) return "estate";
    if (phase < 0.75) return "autunno";
    return "inverno";
  }

  /**
   * Exact single-tick update for one cell, identical to the formula
   * Planet.update used pre-v1.1 (kept bit-for-bit so a continuously
   * active chunk behaves exactly as before — this path only ever runs
   * with elapsed <= 1, see update()).
   */
  private stepCellOneTick(cell: Cell, tick: number, seasonalOffset: number, climateDrift: number, growthFactor: number): void {
    if (cell.terrain === "ocean") return;

    cell.temperature = cell.temperature * 0.999 + (cell.temperature + seasonalOffset * 0.02 + climateDrift * 0.005) * 0.001;

    if (cell.terrain !== "mountain") {
      const regrowth = 0.005 * growthFactor * (1 - cell.vegetation) * (cell.water > 0.1 ? 1 : 0.2);
      cell.vegetation = Math.max(0, Math.min(1, cell.vegetation + regrowth));
      cell.terrain = Planet.classifyBiome(cell.temperature, cell.water, cell.vegetation);
    }
  }

  /**
   * Approximate catch-up for a cell in a chunk that just reactivated
   * after `elapsedTicks` of dormancy (>= 2 — a single-tick gap uses the
   * exact stepCellOneTick instead). Rather than replaying every skipped
   * tick:
   *  - vegetation regrowth (`v += rate*(1-v)` each tick) has an exact
   *    closed form, `v_n = 1 - (1-v_0)*(1-rate)^n`, so it's applied
   *    directly using an *average* growth-rate over the dormant span
   *    (exact if the season didn't change during the gap; a small,
   *    honestly-documented approximation otherwise — see
   *    averageGrowthFactor).
   *  - temperature's per-tick drift is tiny (bounded by roughly ±0.00017
   *    per tick) and only ever oscillates within a narrow seasonal band,
   *    so rather than accumulate that drift tick-by-tick, catch-up simply
   *    recomputes a fresh, plausible "current" temperature from latitude,
   *    elevation and the *current* season — arguably more representative
   *    of "what this cell's climate looks like right now" than replaying
   *    a long chain of ±0.0002 nudges would be.
   */
  private catchUpCell(cell: Cell, x: number, y: number, elapsedTicks: number, tick: number): void {
    if (cell.terrain === "ocean") return;

    const latitude = Math.abs(y / this.config.height - 0.5) * 2;
    const seasonalOffset = Math.sin((tick / TICKS_PER_YEAR) * Math.PI * 2) * 8;
    cell.temperature = 32 - latitude * 40 - cell.elevation * 10 + seasonalOffset * 0.25;

    if (cell.terrain !== "mountain") {
      const growthFactor = Planet.averageGrowthFactor(tick - elapsedTicks, tick);
      const waterFactor = cell.water > 0.1 ? 1 : 0.2;
      const rate = 0.005 * growthFactor * waterFactor;
      cell.vegetation = Math.max(0, Math.min(1, 1 - (1 - cell.vegetation) * Math.pow(1 - rate, elapsedTicks)));
      cell.terrain = Planet.classifyBiome(cell.temperature, cell.water, cell.vegetation);
    }
  }

  /** Average vegetation growth-factor over [fromTick, toTick] — exact yearly average once the span covers a full year, sampled otherwise. */
  private static averageGrowthFactor(fromTick: number, toTick: number): number {
    const elapsed = toTick - fromTick;
    if (elapsed >= TICKS_PER_YEAR) return YEARLY_AVG_GROWTH_FACTOR;
    const samples = 4;
    let sum = 0;
    for (let i = 0; i < samples; i++) {
      const t = fromTick + Math.round((elapsed * (i + 0.5)) / samples);
      sum += growthFactorForTick(t);
    }
    return sum / samples;
  }

  /**
   * Advances environment by one tick, but only for the given set of
   * *active* chunk keys (see chunkActivity.ts) — everywhere else on the
   * planet simply isn't touched this tick, which is the whole point of
   * v1.1's chunked architecture: cost tracks population footprint, not
   * world size.
   *
   * A chunk not yet materialized is generated fresh (already "current",
   * no catch-up needed — see computeCellBaseline). A chunk that *was*
   * previously active and has now been dormant for more than one tick
   * gets catchUpCell's approximate fast-forward instead of a cell-by-cell
   * replay of every skipped tick.
   */
  update(tick: number, activeChunkKeys: Iterable<string>): void {
    const seasonalOffset = Math.sin((tick / TICKS_PER_YEAR) * Math.PI * 2) * 8;
    const climateDrift = Math.sin(tick / (TICKS_PER_YEAR * 20)) * 2;
    const growthFactor = growthFactorForTick(tick);
    const cs = this.chunkSize;

    for (const key of activeChunkKeys) {
      let chunk = this.chunks.get(key);
      const { cx, cy } = parseChunkKey(key);

      if (!chunk) {
        chunk = this.generateChunk(cx, cy);
        this.chunks.set(key, chunk);
        this.chunkLastActiveTick.set(key, tick);
        continue; // freshly generated = already current, nothing to step
      }

      const lastActive = this.chunkLastActiveTick.get(key);
      if (lastActive === undefined) {
        // Materialized (e.g. via getCell) but never yet run through
        // update() — start tracking from now rather than guessing how
        // long it's been "dormant" before we ever knew about it.
        this.chunkLastActiveTick.set(key, tick);
        continue;
      }

      const elapsed = tick - lastActive;
      if (elapsed <= 0) continue; // already up to date this tick

      for (let ly = 0; ly < cs; ly++) {
        for (let lx = 0; lx < cs; lx++) {
          const wx = cx * cs + lx;
          const wy = cy * cs + ly;
          if (wx >= this.config.width || wy >= this.config.height) continue;
          const cell = chunk[ly * cs + lx];
          if (elapsed <= 1) {
            this.stepCellOneTick(cell, tick, seasonalOffset, climateDrift, growthFactor);
          } else {
            this.catchUpCell(cell, wx, wy, elapsed, tick);
          }
        }
      }
      this.chunkLastActiveTick.set(key, tick);
    }
  }

  // ---- Persistence (v1.1 — chunk-based, with legacy migration) ----------

  /** All chunks currently resident in memory, for snapshotting — only what's actually been touched, never the whole declared world. */
  getMaterializedChunks(): PlanetChunkSnapshot[] {
    const out: PlanetChunkSnapshot[] = [];
    for (const [key, cells] of this.chunks) {
      out.push({ key, cells, lastActiveTick: this.chunkLastActiveTick.get(key) ?? 0 });
    }
    return out;
  }

  /** Restores a planet from v1.1+ chunk-based snapshot data. */
  static fromChunkSnapshot(config: PlanetConfig, chunks: PlanetChunkSnapshot[]): Planet {
    const planet = new Planet(config);
    for (const c of chunks) {
      planet.chunks.set(c.key, c.cells);
      planet.chunkLastActiveTick.set(c.key, c.lastActiveTick);
    }
    return planet;
  }

  /**
   * Migration path for saves made before v1.1: slices the old dense
   * width*height cell array into this planet's chunks, one-time, on
   * load. Every chunk of a legacy world ends up fully materialized
   * (matching what eager generation always did), and none are marked
   * "active as of some tick" — they behave exactly like chunks
   * materialized via getCell (first update() call on any of them just
   * starts fresh tracking from the current tick, no catch-up needed,
   * since a legacy world's cells are already fully up to date as of the
   * snapshot's own tick).
   */
  static fromLegacyDenseCells(config: PlanetConfig, denseCells: Cell[]): Planet {
    const planet = new Planet(config);
    const cs = planet.chunkSize;
    for (let cy = 0; cy < planet.chunksY; cy++) {
      for (let cx = 0; cx < planet.chunksX; cx++) {
        const chunk = new Array<Cell>(cs * cs);
        for (let ly = 0; ly < cs; ly++) {
          for (let lx = 0; lx < cs; lx++) {
            const wx = cx * cs + lx;
            const wy = cy * cs + ly;
            chunk[ly * cs + lx] =
              wx < config.width && wy < config.height
                ? denseCells[wy * config.width + wx]
                : planet.computeCellBaseline(wx, wy);
          }
        }
        planet.chunks.set(chunkKeyOf(cx, cy), chunk);
      }
    }
    return planet;
  }
}
