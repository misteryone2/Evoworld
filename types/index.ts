/**
 * Core shared types for EvoWorld.
 *
 * IMPORTANT: This file (and everything under simulation/) must never import
 * from React or the DOM. The simulation engine is fully decoupled from the
 * UI so that the rendering layer (2D canvas today, WebGL/3D later) can be
 * swapped out without touching evolution/biology logic.
 */

/** A single ecological/genetic trait as it exists in a genome. */
export interface Genome {
  size: number;
  speed: number;
  metabolism: number;
  vision: number;
  fertility: number;
  lifespan: number;
  /**
   * Diet trait, 0..1 (v0.3). 0 = pure herbivore (all energy from
   * vegetation), 1 = pure carnivore (relies on hunting), values in between
   * are omnivores that draw on both sources in proportion to this value.
   * There is no fixed "correct" value: it is under the same selection
   * pressure as every other trait.
   */
  carnivory: number;
  /**
   * Environmental niche traits (v0.3.2). preferredTemperature/preferredWater
   * are the cell conditions this organism is best adapted to; the
   * *Tolerance traits control how narrow or broad that adaptation is. A
   * narrow tolerance yields a higher fitness peak right at the preferred
   * conditions (a specialist, excelling in one niche) while a broad
   * tolerance yields a flatter, lower peak that performs adequately across
   * a wider range (a generalist) — see simulation/biology/environment.ts.
   */
  preferredTemperature: number;
  temperatureTolerance: number;
  preferredWater: number;
  waterTolerance: number;

  /**
   * Coevolutionary predator-prey traits (v0.3.3), directly opposed to each
   * other in the predation success formula (see predation.ts). `evasion`
   * (anti-predator vigilance/agility beyond raw speed) helps an organism
   * survive being hunted; `huntingSkill` (predatory acumen beyond raw
   * size*speed) helps a predator land a kill. Neither is free: both carry
   * a metabolic cost. Because each trait's payoff depends on the current
   * distribution of the *other* trait in the population, selection on one
   * side keeps pushing selection on the other — the arms-race dynamic.
   */
  evasion: number;
  huntingSkill: number;
}

export type TraitName = keyof Genome;

/** Valid numeric range for a trait, used for clamping and initial randomization. */
export interface TraitRange {
  min: number;
  max: number;
}

export type TraitRanges = Record<TraitName, TraitRange>;

export interface Vector2 {
  x: number;
  y: number;
}

/**
 * A single remembered location (v0.5 — comportamenti avanzati). Organisms
 * have room for exactly one memory at a time: the most recent salient
 * event overwrites whatever was remembered before. This is a deliberate
 * simplification (no spatial map, no memory of multiple sites) that still
 * lets a hungry organism return to the last good feeding ground it found,
 * or steer clear of the last place it narrowly survived a hunt.
 */
export interface OrganismMemory {
  x: number;
  y: number;
  tick: number;
  kind: "food" | "danger";
}

/** A single living organism. */
export interface Organism {
  id: number;
  speciesId: number;
  position: Vector2;
  energy: number;
  age: number;
  genome: Genome;
  alive: boolean;
  /**
   * Fixed birth location (v0.5), used for territoriality: an organism
   * defends the area around its own home against same-species intruders
   * that are not themselves near their own home.
   */
  home: Vector2;
  /** See OrganismMemory. null until the organism experiences something worth remembering. */
  memory: OrganismMemory | null;
  /**
   * The organism's evolved decision-making network (v0.8), a flat array of
   * BRAIN_SIZE weights — see simulation/biology/brain.ts. Heritable and
   * mutable like a genome trait, but kept separate from Genome so the
   * existing genome-wide analysis (genomeStats, geneticDistance, the
   * species genetic-analysis panel) is entirely unaffected: none of that
   * code needs to know brains exist.
   */
  brain: Float32Array;
}

/**
 * Terrain/biome classification for a grid cell.
 *
 * "ocean" and "mountain" are structural: they come from elevation and do not
 * change over time. The other four ("plains", "desert", "forest", "tundra",
 * "savanna") are climate-dependent biomes that are re-evaluated every tick
 * from the cell's current temperature, water and vegetation — so a biome can
 * genuinely shift as the climate drifts (v0.2 requirement).
 */
export type TerrainType = "ocean" | "mountain" | "plains" | "desert" | "forest" | "tundra" | "savanna";

/** The four seasons of a simulated year, driven by SimulationClock ticks. */
export type Season = "primavera" | "estate" | "autunno" | "inverno";

/** A single cell of the planetary grid. */
export interface Cell {
  elevation: number; // 0..1, fixed at generation time
  temperature: number; // degrees, arbitrary unit centered near 20
  water: number; // 0..1, fixed at generation time
  vegetation: number; // 0..1, regrows over time, consumed by herbivores
  terrain: TerrainType;
}

export interface PlanetConfig {
  width: number;
  height: number;
  seed: number;
  /**
   * v1.1 — World Scale. Side length (in cells) of one square terrain
   * chunk. The planet is generated and simulated lazily per chunk rather
   * than as one dense width*height grid, so a world's *declared* size can
   * grow far beyond what fits comfortably in memory or a per-tick full
   * scan — memory and CPU cost track how much of the world has actually
   * been explored/populated, not its nominal size. Optional and defaults
   * to DEFAULT_CHUNK_SIZE (see simulation/core/constants.ts) so existing
   * configs/tests that omit it keep working unchanged.
   */
  chunkSize?: number;
}

/**
 * Record of a single species in the evolutionary tree (v0.2.1).
 *
 * Species are never mutated in place once extinct: history is append-only,
 * so the full genealogy (which species split from which, and when) is
 * always reconstructable from the collection of SpeciesRecord entries.
 */
export interface SpeciesRecord {
  speciesId: number;
  parentSpeciesId: number | null;
  originTick: number;
  originYear: number;
  population: number;
  alive: boolean;
  extinctionTick: number | null;
  /**
   * Average genome of the founding group, captured once at the moment this
   * species came into existence (v0.4.1). This is a frozen snapshot, never
   * updated afterward: its only purpose is to let later analysis measure
   * how far a lineage has drifted since its origin, even after the parent
   * species itself has gone extinct and no living organisms of it remain
   * to compare against.
   */
  originGenomeSnapshot: Genome;
}

/** Per-trait descriptive statistics across a group of organisms (v0.4.1, observability only). */
export interface TraitStats {
  mean: number;
  min: number;
  max: number;
  stdDev: number;
}

export type GenomeStats = Record<TraitName, TraitStats>;

/** Genetic distance from one currently-alive species to another, for cross-species comparison. */
export interface SpeciesDistance {
  speciesId: number;
  distance: number;
}

/**
 * Full genetic analysis for one currently-alive species (v0.4.1): current
 * trait-by-trait statistics (mean/min/max/stdDev, i.e. internal
 * variability), genetic distance from its parent species' origin snapshot
 * (total drift since speciation), and genetic distance from every other
 * currently-alive species (for cross-species comparison).
 */
export interface SpeciesGenomeStats {
  speciesId: number;
  population: number;
  genomeStats: GenomeStats;
  distanceFromParentOrigin: number | null;
  distanceFromOtherSpecies: SpeciesDistance[];
}

/** Aggregated statistics computed once per tick for the UI. */
export interface SimulationStats {
  tick: number;
  year: number;
  season: Season;
  population: number;
  speciesCount: number;
  speciesAlive: number;
  speciesTotalEver: number;
  speciesExtinct: number;
  averageGenome: Genome | null;
  births: number;
  deaths: number;
  predationKills: number;
}

export type SimulationSpeed = 0 | 1 | 10 | 100 | 1000;

/**
 * v1.1 — one materialized terrain chunk as stored in a snapshot: only
 * chunks the simulation has actually touched (generated and/or actively
 * updated) are ever saved — an unpopulated corner of a huge world costs
 * nothing in a save file. `cells` is row-major within the chunk
 * (length = chunkSize * chunkSize). `lastActiveTick` lets a restored
 * world correctly catch up vegetation/climate for this chunk the next
 * time it reactivates, exactly as if the save/load had never happened.
 */
export interface PlanetChunkSnapshot {
  key: string; // "cx,cy"
  cells: Cell[];
  lastActiveTick: number;
}

/** Full serializable snapshot of a running simulation. */
export interface WorldSnapshot {
  tick: number;
  planet: {
    config: PlanetConfig;
    /**
     * v1.1 — sparse, chunk-based terrain storage. Present on every
     * snapshot saved from v1.1 onward.
     */
    chunks?: PlanetChunkSnapshot[];
    /**
     * Legacy (pre-v1.1) dense storage: the *entire* width*height grid,
     * flattened row-major. Only ever present on saves made before v1.1;
     * new snapshots never populate this field. Kept so old saves keep
     * loading correctly — see Planet.fromLegacyDenseCells, used by
     * World.fromSnapshot as a one-time migration on load.
     */
    cells?: Cell[];
  };
  organisms: Organism[];
  nextOrganismId: number;
  nextSpeciesId: number;
  randomState: number;
  speciesRegistry: SpeciesRecord[];
}

/**
 * v1.1 — one requested view of the terrain (World Scale). The 3D view
 * always frames the whole globe (there is no "flying over unbounded
 * terrain" camera mode yet), so centerX/Y + radiusX/Y currently always
 * span the full planet; they exist as real fields — not hardcoded — so a
 * future closer-flyover camera can request a sub-region through this same
 * protocol without another redesign. maxWidth/maxHeight caps the
 * returned texel resolution, letting the UI ask for a coarse overview
 * when the camera is far away and a sharper one when it's close, entirely
 * independent of how large the underlying world actually is.
 */
export interface ViewportRequest {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  maxWidth: number;
  maxHeight: number;
}

/**
 * v1.1 — terrain/vegetation payload for one requested viewport, sent only
 * on demand (see ViewportRequest) rather than every tick. Resolution is
 * capped by the request, never by the world's actual size, which is what
 * lets the render cost stay flat as the simulated world grows.
 */
export interface ViewportFrame {
  tick: number;
  originX: number;
  originY: number;
  cellsWidth: number;
  cellsHeight: number;
  texWidth: number;
  texHeight: number;
  vegetation: Float32Array; // texWidth * texHeight
  terrain: Uint8Array; // texWidth * texHeight
}

/** Lightweight payload sent from the worker to the UI every rendered frame. */
export interface RenderFrame {
  tick: number;
  year: number;
  stats: SimulationStats;
  planetWidth: number;
  planetHeight: number;
  // Flattened organism data for drawing: x, y, speciesId, size (repeated per organism).
  organismsX: Float32Array;
  organismsY: Float32Array;
  organismsSpecies: Uint16Array;
  organismsSize: Float32Array;
  // Additional per-organism traits (v0.6), sent alongside size so the
  // renderer can draw a genuinely procedural creature per individual
  // instead of a plain colored circle — see lib/creatureShape.ts.
  organismsSpeed: Float32Array;
  organismsCarnivory: Float32Array;
  organismsVision: Float32Array;
  organismsEvasion: Float32Array;
  organismsHuntingSkill: Float32Array;
  // Per-organism id (v1.0.4), needed to identify which specific organism
  // was clicked/tapped in the 3D view and request its full detail.
  organismsId: Uint32Array;
  // Full species genealogy, small enough to send as a plain array every frame.
  speciesTree: SpeciesRecord[];
  // Per-species genetic analysis (v0.4.1): current trait stats, drift from
  // parent's origin snapshot, distances to other living species.
  speciesGenomeStats: SpeciesGenomeStats[];
  /**
   * v1.1 — cheap, world-size-independent estimate of average vegetation
   * across the whole planet (fixed-resolution sample grid, computed
   * worker-side — see simulation/core/renderFrame.ts). Replaces the
   * pre-v1.1 client-side average over the full per-cell vegetation array,
   * which no longer exists on this frame.
   */
  avgVegetation: number;
}

// ---- Worker <-> UI message protocol -------------------------------------

export type WorkerCommand =
  | { type: "init"; config: PlanetConfig; initialPopulation: number }
  | { type: "setSpeed"; speed: SimulationSpeed }
  | { type: "reset"; config: PlanetConfig; initialPopulation: number }
  | { type: "requestSnapshot" }
  | { type: "loadSnapshot"; snapshot: WorldSnapshot }
  | { type: "requestOrganismDetail"; organismId: number }
  // v1.1 — requested on demand by the 3D view (camera move / zoom-level
  // change / periodic refresh), never on a per-tick cadence.
  | { type: "requestViewport"; request: ViewportRequest };

export type WorkerEvent =
  | { type: "frame"; frame: RenderFrame }
  | { type: "ready" }
  | { type: "snapshot"; snapshot: WorldSnapshot }
  | { type: "error"; message: string }
  | { type: "organismDetail"; organismId: number; organism: Organism | null }
  | { type: "viewportFrame"; frame: ViewportFrame };

/**
 * v1.0.3 — Osservazione storica. One sampled point in a planet's history,
 * taken periodically (not every tick — see useMultiverse) so the array
 * stays a reasonable size even over very long runs. Everything here is
 * derived from data already present in a RenderFrame; nothing new is
 * computed by the engine.
 */
export interface HistoryPoint {
  tick: number;
  year: number;
  population: number;
  speciesAlive: number;
  /** Shannon diversity index (see lib/biodiversity.ts) at this point in time. */
  biodiversity: number;
  avgCarnivory: number;
  avgSize: number;
  /** Average vegetation across the whole grid — the closest thing to a single "climate" number available without new engine instrumentation. */
  avgVegetation: number;
}

/**
 * UI-only bookkeeping for one running planet (v0.9 — pianeti multipli).
 * Each planet is its own independent World running in its own Web Worker;
 * this struct is how the multiverse hook (lib/useMultiverse.ts) and its
 * consumer components track them. Not used anywhere under simulation/ —
 * the engine itself has no concept of "multiple planets", it only ever
 * knows about the single World it's running.
 */
export interface PlanetInstance {
  id: string;
  name: string;
  seed: number;
  /**
   * v1.1 — the full planet configuration (width/height/chunkSize) this
   * instance was created with, so resetPlanet/recoverPlanet can rebuild
   * it at the *same* size instead of silently falling back to a default
   * (that was a latent bug pre-v1.1, invisible only because every planet
   * used to be the same fixed size anyway).
   */
  config: PlanetConfig;
  frame: RenderFrame | null;
  /**
   * v1.1 — latest on-demand terrain/vegetation viewport payload (see
   * ViewportRequest/ViewportFrame), independent of `frame`'s per-tick
   * cadence. Null until the first requestViewport response arrives.
   */
  viewportFrame: ViewportFrame | null;
  speed: SimulationSpeed;
  ready: boolean;
  /**
   * v1.0.2 — set when this planet's worker reports an internal error (see
   * WorkerEvent's "error" case). Non-null means the simulation loop for
   * this planet has stopped; the person can restart it fresh with
   * useMultiverse's recoverPlanet. The last frame received before the
   * error is kept (not cleared), so the UI can still show what the world
   * looked like when it happened.
   */
  error: string | null;
  /** v1.0.3 — sampled history for charts, oldest first. */
  history: HistoryPoint[];
}

/**
 * v1.0.1 — Persistenza. A saved planet is just its worker-side World
 * snapshot (already existed since v0.1's WorldSnapshot/requestSnapshot
 * protocol) plus the small bits of UI-only bookkeeping needed to recreate
 * its PlanetInstance/PlanetSelector entry on load.
 */
export interface SavedPlanet {
  id: string;
  name: string;
  seed: number;
  snapshot: WorldSnapshot;
  /** v1.0.3 — carries the planet's chart history along with the save, so a resumed simulation keeps its historical record instead of starting the charts over from a blank slate. */
  history: HistoryPoint[];
}

/** A full saved session: every planet that was running at save time, plus which one was active. */
export interface SavedSession {
  id: string;
  label: string;
  savedAt: number;
  activePlanetId: string | null;
  planets: SavedPlanet[];
}

/** Lightweight listing entry (no snapshots — those can be large), for showing a "load a save" picker without pulling every full session into memory. */
export interface SavedSessionSummary {
  id: string;
  label: string;
  savedAt: number;
  planetCount: number;
}
