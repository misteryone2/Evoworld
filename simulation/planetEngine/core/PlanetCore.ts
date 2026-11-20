/**
 * PHYSICAL_MODEL
 *
 * Intrinsic planetary quantities: mass, radius, surface area, gravity,
 * rotation and the initialization of the mutable state. No rendering, biology
 * or wall-clock input is used here.
 */

import type {
  GasKey,
  PlanetAtmosphereConfig,
  PlanetHydrosphereConfig,
  PlanetInteriorConfig,
  PlanetOrbitConfig,
  PlanetPhysicalConfig,
  PlanetSchedulerConfig,
  PlanetStarConfig,
  PlanetState,
  PlanetSurfaceConfig,
} from "../contracts";
import { setAtmosphericWaterMassKg, waterMassKgFromState } from "../atmosphere/Composition";
import { normalizeAngleRad, PLANET_UNITS, celsiusToKelvin } from "../units";

/** Bumped whenever persisted state or snapshot semantics change. */
export const PLANET_ENGINE_VERSION = "0.1.1-audit";

const GAS_KEYS: readonly GasKey[] = ["N2", "O2", "CO2", "H2O", "CH4", "Ar", "other"];

/** Climate and hydrology run every tick; geology runs every 30 ticks by default. */
export const DEFAULT_PLANET_SCHEDULER: Readonly<PlanetSchedulerConfig> = {
  climateIntervalTicks: 1,
  hydrologyIntervalTicks: 1,
  geologyIntervalTicks: 30,
};

export function resolveSchedulerConfig(config: PlanetPhysicalConfig): PlanetSchedulerConfig {
  return { ...DEFAULT_PLANET_SCHEDULER, ...(config.scheduler ?? {}) };
}

export type PhysicalConfigOverrides = Partial<Omit<PlanetPhysicalConfig, "orbit" | "star" | "interior" | "atmosphere" | "hydrosphere" | "surface">> & {
  orbit?: Partial<PlanetOrbitConfig>;
  star?: Partial<PlanetStarConfig>;
  interior?: Partial<PlanetInteriorConfig>;
  atmosphere?: Partial<Omit<PlanetAtmosphereConfig, "composition">> & { composition?: Partial<Record<GasKey, number>> };
  hydrosphere?: Partial<PlanetHydrosphereConfig>;
  surface?: Partial<PlanetSurfaceConfig>;
};

/** Earth-like reference used by tests and as the documentation baseline. */
export function createEarthLikeConfig(overrides: PhysicalConfigOverrides = {}): PlanetPhysicalConfig {
  const base: PlanetPhysicalConfig = {
    schemaVersion: 1,
    seed: 42,
    name: "Terra Reference",
    massKg: PLANET_UNITS.earthMassKg,
    radiusM: PLANET_UNITS.earthRadiusM,
    rotationPeriodS: 86164.0905,
    axialTiltRad: (23.4392811 * Math.PI) / 180,
    orbit: {
      semiMajorAxisM: PLANET_UNITS.auM,
      eccentricity: 0.0167086,
      inclinationRad: 0,
      meanAnomalyAtEpochRad: 0,
      longitudeOfPeriapsisRad: (102.9372 * Math.PI) / 180,
      epochS: 0,
    },
    star: {
      luminosityW: PLANET_UNITS.solarLuminosityW,
      effectiveTemperatureK: 5772,
      massKg: 1.9885e30,
    },
    interior: {
      coreRadiusFraction: 0.545,
      mantleRadiusFraction: 0.835,
      radiogenicHeatW: 2.0e13,
      initialHeatJ: 6.0e30,
    },
    atmosphere: {
      surfacePressurePa: 101325,
      composition: {
        N2: 0.7712,
        O2: 0.207,
        Ar: 0.0093,
        CO2: 0.00028,
        H2O: 0.01,
        CH4: 0.0000019,
        other: 0.0022181,
      },
    },
    hydrosphere: {
      totalWaterKg: 1.4e21,
      iceFraction: 0.023,
    },
    surface: {
      gridWidth: 256,
      gridHeight: 256,
      oceanFloorDepthM: 4000,
      meanElevationM: 840,
      roughnessM: 2000,
    },
    scheduler: { ...DEFAULT_PLANET_SCHEDULER },
  };

  return {
    ...base,
    ...overrides,
    orbit: { ...base.orbit, ...overrides.orbit },
    star: { ...base.star, ...overrides.star },
    interior: { ...base.interior, ...overrides.interior },
    atmosphere: {
      ...base.atmosphere,
      ...overrides.atmosphere,
      composition: { ...base.atmosphere.composition, ...overrides.atmosphere?.composition },
    },
    hydrosphere: { ...base.hydrosphere, ...overrides.hydrosphere },
    surface: { ...base.surface, ...overrides.surface },
    scheduler: { ...DEFAULT_PLANET_SCHEDULER, ...(overrides.scheduler ?? {}) },
  };
}

export function surfaceAreaM2(config: PlanetPhysicalConfig): number {
  return 4 * Math.PI * config.radiusM * config.radiusM;
}

/** g = G * M / R^2 */
export function gravityMS2(config: PlanetPhysicalConfig): number {
  return (PLANET_UNITS.gravitationalConstant * config.massKg) / (config.radiusM * config.radiusM);
}

/** Two-body orbital period from the combined star + planet mass. */
export function orbitalPeriodS(config: PlanetPhysicalConfig): number {
  const mu = PLANET_UNITS.gravitationalConstant * (config.star.massKg + config.massKg);
  return 2 * Math.PI * Math.sqrt((config.orbit.semiMajorAxisM ** 3) / mu);
}

export function meanMotionRadPerS(config: PlanetPhysicalConfig): number {
  return (2 * Math.PI) / orbitalPeriodS(config);
}

export function rotationRateRadPerS(config: PlanetPhysicalConfig): number {
  return (2 * Math.PI) / config.rotationPeriodS;
}

export function rotationPhaseAt(config: PlanetPhysicalConfig, timeS: number): number {
  return normalizeAngleRad(rotationRateRadPerS(config) * timeS);
}

/** Normalize molar fractions to exactly 1; callers validate the input first. */
export function normalizedComposition(config: PlanetPhysicalConfig): Record<GasKey, number> {
  const result = Object.fromEntries(GAS_KEYS.map((key) => [key, 0])) as Record<GasKey, number>;
  let sum = 0;
  for (const key of GAS_KEYS) {
    const value = config.atmosphere.composition[key] ?? 0;
    result[key] = value;
    sum += value;
  }
  if (sum <= 0) return result;
  for (const key of GAS_KEYS) result[key] /= sum;
  return result;
}

/** p_atm = m_atm * g / A, inverted to obtain mass from configured pressure. */
export function atmosphereMassFromPressureKg(config: PlanetPhysicalConfig): number {
  return (config.atmosphere.surfacePressurePa * surfaceAreaM2(config)) / gravityMS2(config);
}

/**
 * APPROXIMATION: M1 has no hypsometry yet, so the sea-level datum is zero in
 * local elevation coordinates. Hydrology will solve it from water volume and
 * terrain buckets in a later milestone.
 */
export function createInitialState(config: PlanetPhysicalConfig): PlanetState {
  const composition = normalizedComposition(config);
  const oceanFraction = 1 - config.hydrosphere.iceFraction;
  // Initial guess only; PlanetEngine overwrites it from the energy budget.
  const initialTemperatureK = celsiusToKelvin(15);
  const atmosphereTotalMassKg = atmosphereMassFromPressureKg(config);

  const state: PlanetState = {
    tick: 0,
    timeS: 0,
    orbitalMeanAnomalyRad: normalizeAngleRad(config.orbit.meanAnomalyAtEpochRad),
    rotationPhaseRad: 0,
    obliquityRad: config.axialTiltRad,
    interior: {
      heatJ: config.interior.initialHeatJ,
      volcanicActivity: 0,
      tectonicStress: 0,
    },
    atmosphere: {
      totalMassKg: atmosphereTotalMassKg,
      composition,
      opticalDepth: 0,
    },
    hydrosphere: {
      oceanMassKg: 0,
      iceMassKg: 0,
      vaporMassKg: 0,
      soilWaterKg: 0,
      seaLevelM: 0,
    },
    surface: {
      meanElevationM: config.surface.meanElevationM,
      sedimentMassKg: 0,
    },
    climate: {
      globalMeanTemperatureK: initialTemperatureK,
      co2Ppm: composition.CO2 * 1e6,
      albedo: 0.3,
    },
    scheduler: {
      lastClimateTick: 0,
      lastHydrologyTick: 0,
      lastGeologyTick: 0,
      pendingClimateS: 0,
      pendingHydrologyS: 0,
      pendingGeologyS: 0,
    },
  };

  // The configured H2O molar fraction defines the initial atmospheric water
  // mass. From this point on vaporMassKg is authoritative and composition is
  // always resynchronized from it.
  state.hydrosphere.vaporMassKg = waterMassKgFromState(state);
  const surfaceWaterKg = Math.max(0, config.hydrosphere.totalWaterKg - state.hydrosphere.vaporMassKg);
  state.hydrosphere.oceanMassKg = surfaceWaterKg * oceanFraction;
  state.hydrosphere.iceMassKg = surfaceWaterKg * config.hydrosphere.iceFraction;
  setAtmosphericWaterMassKg(state, state.hydrosphere.vaporMassKg);
  state.climate.co2Ppm = state.atmosphere.composition.CO2 * 1e6;
  return state;
}

export function cloneState(state: PlanetState): PlanetState {
  return {
    ...state,
    interior: { ...state.interior },
    atmosphere: { ...state.atmosphere, composition: { ...state.atmosphere.composition } },
    hydrosphere: { ...state.hydrosphere },
    surface: { ...state.surface },
    climate: { ...state.climate },
    scheduler: { ...state.scheduler },
  };
}
