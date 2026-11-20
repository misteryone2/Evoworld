/**
 * PHYSICAL_MODEL / CONTRACT
 *
 * Public contracts of the Planet Engine. This module must never import React,
 * Three.js, DOM globals or any simulation/biology module. Environment Snapshot
 * is designed here so GENOME can consume it later through an adapter without
 * changing its own files.
 */

import type { Cell, Season, TerrainType } from "../../types";

/** Real gases tracked by the atmospheric model. `other` is inert filler. */
export type GasKey = "N2" | "O2" | "CO2" | "H2O" | "CH4" | "Ar" | "other";

export type ModelTag = "PHYSICAL_MODEL" | "APPROXIMATION" | "SIMULATION_HEURISTIC" | "VISUAL_EFFECT";

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
    vaporMassKg: number;
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
}

/** Deterministic elevation tile produced by geophysics, not by legacy fBm. */
export interface ElevationGrid {
  width: number;
  height: number;
  elevationM: Float32Array;
  minM: number;
  maxM: number;
  /** Approximate uniform cell area from total sphere area / cell count. */
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

export interface OrbitPosition {
  timeS: number;
  meanAnomalyRad: number;
  eccentricAnomalyRad: number;
  trueAnomalyRad: number;
  distanceM: number;
  /** Solar declination caused by axial tilt, in radians. */
  declinationRad: number;
}

/** One local environmental sample produced by the full engine (later milestones). */
export interface EnvironmentSample {
  x: number;
  y: number;
  latRad: number;
  lonRad: number;
  elevationM: number;
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
  irradianceWm2: number;
  windMS: number;
  iceFraction: number;
  biome: TerrainType;
  /** 0..1 */
  climateStability: number;
  season: Season;
}

/**
 * Stable integration contract. `toLegacyCell` keeps the exact units consumed by
 * `simulation/biology/environment.ts` so no GENOME module needs modification.
 */
export interface EnvironmentSnapshot {
  version: 1;
  engineVersion: string;
  tick: number;
  timeS: number;
  gridWidth: number;
  gridHeight: number;
  season: Season;
  sample(x: number, y: number): EnvironmentSample;
  /** Exact legacy `Cell` shape; no GENOME/biology module is imported or edited. */
  toLegacyCell(x: number, y: number): Cell;
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
