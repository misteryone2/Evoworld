/**
 * PHYSICAL_MODEL / CONTRACT
 *
 * Public contracts of the Planet Engine. This module must never import React,
 * Three.js, DOM globals or any simulation/biology module. Environment Snapshot
 * is designed here so GENOME can consume it later through an adapter without
 * changing its own files.
 */

import type { Cell, Season, TerrainType } from "../../types";

export type { Cell, Season, TerrainType } from "../../types";

/** Real gases tracked by the atmospheric model. `other` is inert filler. */
export type GasKey = "N2" | "O2" | "CO2" | "H2O" | "CH4" | "Ar" | "other";

export type ModelTag = "PHYSICAL_MODEL" | "APPROXIMATION" | "SIMULATION_HEURISTIC" | "VISUAL_EFFECT";

export type PlanetSubsystem =
  | "orbitalMechanics"
  | "energyBudget"
  | "gasInventory"
  | "greenhouse"
  | "atmosphericCirculation"
  | "hypsometry"
  | "geology"
  | "erosion"
  | "localClimate"
  | "waterCycle"
  | "drainageProxy"
  | "biomeClassifier"
  | "environmentSnapshot";

/**
 * Mandatory machine-readable classification. See `MODELS.md` for the
 * conservation claims and residual approximations of every subsystem.
 */
export const MODEL_CLASSIFICATION: Readonly<Record<PlanetSubsystem, ModelTag>> = {
  orbitalMechanics: "PHYSICAL_MODEL",
  energyBudget: "APPROXIMATION",
  gasInventory: "PHYSICAL_MODEL",
  greenhouse: "APPROXIMATION",
  atmosphericCirculation: "SIMULATION_HEURISTIC",
  hypsometry: "PHYSICAL_MODEL",
  geology: "SIMULATION_HEURISTIC",
  erosion: "APPROXIMATION",
  localClimate: "APPROXIMATION",
  waterCycle: "SIMULATION_HEURISTIC",
  drainageProxy: "SIMULATION_HEURISTIC",
  biomeClassifier: "SIMULATION_HEURISTIC",
  environmentSnapshot: "APPROXIMATION",
};

export interface PlanetOrbitConfig {
  semiMajorAxisM: number;
  eccentricity: number;
  inclinationRad: number;
  meanAnomalyAtEpochRad: number;
  longitudeOfPeriapsisRad: number;
  epochS: number;
}

export interface PlanetStarConfig {
  luminosityW: number;
  effectiveTemperatureK: number;
  massKg: number;
}

export interface PlanetInteriorConfig {
  coreRadiusFraction: number;
  mantleRadiusFraction: number;
  radiogenicHeatW: number;
  initialHeatJ: number;
}

export interface PlanetAtmosphereConfig {
  surfacePressurePa: number;
  /** Molar fractions. Must sum to 1 within tolerance. */
  composition: Partial<Record<GasKey, number>>;
}

export interface PlanetHydrosphereConfig {
  totalWaterKg: number;
  iceFraction: number;
}

export interface PlanetSurfaceConfig {
  gridWidth: number;
  gridHeight: number;
  oceanFloorDepthM: number;
  meanElevationM: number;
  roughnessM: number;
}

/**
 * Deterministic multi-rate scheduler. A subsystem runs on tick `t` iff
 * `t % intervalTicks === 0`; the pending SI duration is passed to that
 * subsystem so a slower clock never changes the average physical rate.
 */
export interface PlanetSchedulerConfig {
  climateIntervalTicks: number;
  hydrologyIntervalTicks: number;
  geologyIntervalTicks: number;
}

/** Serializable scheduler state; one logical tick advances it exactly once. */
export interface PlanetSchedulerState {
  lastClimateTick: number;
  lastHydrologyTick: number;
  lastGeologyTick: number;
  pendingClimateS: number;
  pendingHydrologyS: number;
  pendingGeologyS: number;
}

export interface PlanetPhysicalConfig {
  schemaVersion: 1;
  seed: number;
  name?: string;
  massKg: number;
  radiusM: number;
  rotationPeriodS: number;
  axialTiltRad: number;
  orbit: PlanetOrbitConfig;
  star: PlanetStarConfig;
  interior: PlanetInteriorConfig;
  atmosphere: PlanetAtmosphereConfig;
  hydrosphere: PlanetHydrosphereConfig;
  surface: PlanetSurfaceConfig;
  scheduler?: PlanetSchedulerConfig;
}

/** Mutable state evolved by later milestones. M1 initializes it from config. */
export interface PlanetState {
  tick: number;
  timeS: number;
  orbitalMeanAnomalyRad: number;
  rotationPhaseRad: number;
  obliquityRad: number;
  interior: {
    heatJ: number;
    volcanicActivity: number;
    tectonicStress: number;
  };
  atmosphere: {
    totalMassKg: number;
    composition: Record<GasKey, number>;
    opticalDepth: number;
  };
  hydrosphere: {
    oceanMassKg: number;
    iceMassKg: number;
    /** Authoritative mass of water in the atmospheric reservoir. */
    vaporMassKg: number;
    soilWaterKg: number;
    seaLevelM: number;
  };
  surface: {
    meanElevationM: number;
    sedimentMassKg: number;
  };
  climate: {
    globalMeanTemperatureK: number;
    co2Ppm: number;
    albedo: number;
  };
  scheduler: PlanetSchedulerState;
}

/** Deterministic elevation tile produced by geophysics, not by legacy fBm. */
export interface ElevationGrid {
  width: number;
  height: number;
  elevationM: Float32Array;
  minM: number;
  maxM: number;
  /** Per-cell latitude-weighted area; authoritative for all mass balances. */
  cellAreasM2: Float64Array;
  /** Arithmetic mean only. Retained for display; never use for local fluxes. */
  cellAreaM2: number;
}

export interface SurfaceField extends ElevationGrid {
  seaLevelM: number;
  /** 1 = ocean, 0 = land. */
  oceanMask: Uint8Array;
  /** 1 = land cell adjacent to ocean (wrapped neighbourhood). */
  coastlineMask: Uint8Array;
  oceanFraction: number;
  landFraction: number;
}

/** Local climate fields produced by the deterministic climate chain. */
export interface ClimateField {
  width: number;
  height: number;
  latitudeRad: Float32Array;
  longitudeRad: Float32Array;
  temperatureK: Float32Array;
  irradianceWm2: Float32Array;
  humidity: Float32Array;
  windMS: Float32Array;
  season: Season;
}

/**
 * SIMULATION_HEURISTIC fields. `riverFlow` is a deterministic topographic
 * accumulation proxy, NOT a transported water mass or a solved river network.
 * Inventory transfers use global reservoirs, not these local fields.
 */
export interface HydrologyField {
  width: number;
  height: number;
  soilMoisture: Float32Array;
  waterAvailability: Float32Array;
  precipitationMPerYear: Float32Array;
  evaporationMPerYear: Float32Array;
  runoffMPerYear: Float32Array;
  riverFlow: Float32Array;
}

export interface OrbitPosition {
  timeS: number;
  meanAnomalyRad: number;
  eccentricAnomalyRad: number;
  trueAnomalyRad: number;
  distanceM: number;
  /** Solar declination caused by axial tilt, in radians. */
  declinationRad: number;
}

/** One local environmental sample produced by the full engine. */
export interface EnvironmentSample {
  x: number;
  y: number;
  latRad: number;
  lonRad: number;
  elevationM: number;
  seaLevelM: number;
  slope: number;
  temperatureK: number;
  pressurePa: number;
  /** 0..1 */
  humidity: number;
  precipitationMPerYear: number;
  /** 0..1 */
  soilMoisture: number;
  /** 0..1 */
  waterAvailability: number;
  /** Raw wetness axis expected by legacy `Cell.water`, not waterAvailability. */
  legacyWaterAxis: number;
  irradianceWm2: number;
  windMS: number;
  iceFraction: number;
  riverFlow: number;
  isLake: boolean;
  biome: TerrainType;
  /** Legacy gameplay offset already included in `temperatureK`. */
  seasonalOffsetK: number;
  /** 0..1 */
  climateStability: number;
  season: Season;
}

export type ReadonlyEnvironmentSample = Readonly<EnvironmentSample>;
export type ReadonlyLegacyCell = Readonly<Cell>;

/**
 * Stable integration contract. `toLegacyCell` keeps the exact units consumed by
 * `simulation/biology/environment.ts` so no GENOME module needs modification.
 * Returned objects are immutable; callers cannot mutate engine state through
 * a snapshot. Integer coordinates wrap on the toroidal grid; non-finite or
 * non-integer coordinates are rejected.
 */
export interface EnvironmentSnapshot {
  version: 1;
  engineVersion: string;
  tick: number;
  timeS: number;
  gridWidth: number;
  gridHeight: number;
  season: Season;
  sample(x: number, y: number): ReadonlyEnvironmentSample;
  /** Exact legacy `Cell` shape; no GENOME/biology module is imported or edited. */
  toLegacyCell(x: number, y: number): ReadonlyLegacyCell;
  /** Eagerly materialize read-only samples; memory writes stay in the runtime. */
  materialize(): void;
}

/** Snapshot returned by the M1 facade. Purely derived from config and time. */
export interface PlanetEngineSnapshot {
  schemaVersion: 2;
  engineVersion: string;
  tick: number;
  timeS: number;
  rotationPhaseRad: number;
  orbit: OrbitPosition;
  fluxWm2: number;
  /** Global mean insolation S/4 used by the zero-dimensional energy budget. */
  meanInsolationWm2: number;
  equilibriumTemperatureK: number;
  greenhouseDeltaK: number;
  surfaceTemperatureK: number;
  surfacePressurePa: number;
  gravityMS2: number;
}
