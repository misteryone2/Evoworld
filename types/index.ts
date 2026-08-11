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

/** A single living organism. */
export interface Organism {
  id: number;
  speciesId: number;
  position: Vector2;
  energy: number;
  age: number;
  genome: Genome;
  alive: boolean;
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

/** Full serializable snapshot of a running simulation. */
export interface WorldSnapshot {
  tick: number;
  planet: {
    config: PlanetConfig;
    cells: Cell[]; // flattened, row-major, length = width * height
  };
  organisms: Organism[];
  nextOrganismId: number;
  nextSpeciesId: number;
  randomState: number;
  speciesRegistry: SpeciesRecord[];
}

/** Lightweight payload sent from the worker to the UI every rendered frame. */
export interface RenderFrame {
  tick: number;
  year: number;
  stats: SimulationStats;
  planetWidth: number;
  planetHeight: number;
  // Flattened per-cell vegetation (0..1) and terrain code, for fast canvas draw.
  vegetation: Float32Array;
  terrain: Uint8Array;
  // Flattened organism data for drawing: x, y, speciesId, size (repeated per organism).
  organismsX: Float32Array;
  organismsY: Float32Array;
  organismsSpecies: Uint16Array;
  organismsSize: Float32Array;
  // Full species genealogy, small enough to send as a plain array every frame.
  speciesTree: SpeciesRecord[];
}

// ---- Worker <-> UI message protocol -------------------------------------

export type WorkerCommand =
  | { type: "init"; config: PlanetConfig; initialPopulation: number }
  | { type: "setSpeed"; speed: SimulationSpeed }
  | { type: "reset"; config: PlanetConfig; initialPopulation: number }
  | { type: "requestSnapshot" };

export type WorkerEvent =
  | { type: "frame"; frame: RenderFrame }
  | { type: "ready" }
  | { type: "snapshot"; snapshot: WorldSnapshot };
