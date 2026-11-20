/**
 * PHYSICAL_MODEL / VALIDATION
 *
 * Fail fast on configurations or states that would make the physical model
 * meaningless. Invariants are checked at engine construction and after each
 * step; they never silently repair invalid input.
 */

import type { GasKey, PlanetPhysicalConfig, PlanetState } from "../contracts";

const GAS_KEYS: readonly GasKey[] = ["N2", "O2", "CO2", "H2O", "CH4", "Ar", "other"];
const COMPOSITION_TOLERANCE = 1e-6;

export class PlanetInvariantError extends Error {
  constructor(message: string) {
    super(`Planet invariant violated: ${message}`);
    this.name = "PlanetInvariantError";
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new PlanetInvariantError(message);
}

function finite(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be finite`);
}

function positive(value: number, label: string): void {
  finite(value, label);
  assert(value > 0, `${label} must be positive`);
}

function nonNegative(value: number, label: string): void {
  finite(value, label);
  assert(value >= 0, `${label} must be non-negative`);
}

function inRange(value: number, min: number, max: number, label: string): void {
  finite(value, label);
  assert(value >= min && value <= max, `${label} must be in [${min}, ${max}]`);
}

export function validateConfig(config: PlanetPhysicalConfig): void {
  assert(config.schemaVersion === 1, "schemaVersion must be 1");
  assert(Number.isInteger(config.seed), "seed must be an integer");
  positive(config.massKg, "massKg");
  positive(config.radiusM, "radiusM");
  positive(config.rotationPeriodS, "rotationPeriodS");
  inRange(config.axialTiltRad, -Math.PI, Math.PI, "axialTiltRad");

  const orbit = config.orbit;
  positive(orbit.semiMajorAxisM, "orbit.semiMajorAxisM");
  inRange(orbit.eccentricity, 0, 1 - 1e-9, "orbit.eccentricity");
  finite(orbit.inclinationRad, "orbit.inclinationRad");
  finite(orbit.meanAnomalyAtEpochRad, "orbit.meanAnomalyAtEpochRad");
  finite(orbit.longitudeOfPeriapsisRad, "orbit.longitudeOfPeriapsisRad");
  finite(orbit.epochS, "orbit.epochS");
  const periapsisM = orbit.semiMajorAxisM * (1 - orbit.eccentricity);
  assert(periapsisM > config.radiusM, "orbit periapsis must lie outside the planet");

  positive(config.star.luminosityW, "star.luminosityW");
  positive(config.star.effectiveTemperatureK, "star.effectiveTemperatureK");
  positive(config.star.massKg, "star.massKg");

  inRange(config.interior.coreRadiusFraction, 0, 1, "interior.coreRadiusFraction");
  inRange(config.interior.mantleRadiusFraction, 0, 1, "interior.mantleRadiusFraction");
  assert(
    config.interior.coreRadiusFraction < config.interior.mantleRadiusFraction,
    "interior.coreRadiusFraction must be smaller than mantleRadiusFraction",
  );
  nonNegative(config.interior.radiogenicHeatW, "interior.radiogenicHeatW");
  nonNegative(config.interior.initialHeatJ, "interior.initialHeatJ");

  positive(config.atmosphere.surfacePressurePa, "atmosphere.surfacePressurePa");
  let compositionSum = 0;
  for (const key of GAS_KEYS) {
    const value = config.atmosphere.composition[key] ?? 0;
    nonNegative(value, `atmosphere.composition.${key}`);
    compositionSum += value;
  }
  assert(
    Math.abs(compositionSum - 1) <= COMPOSITION_TOLERANCE,
    `atmosphere composition fractions must sum to 1 (got ${compositionSum})`,
  );

  nonNegative(config.hydrosphere.totalWaterKg, "hydrosphere.totalWaterKg");
  inRange(config.hydrosphere.iceFraction, 0, 1, "hydrosphere.iceFraction");

  if (config.scheduler !== undefined) {
    const scheduler = config.scheduler;
    assert(Number.isInteger(scheduler.climateIntervalTicks) && scheduler.climateIntervalTicks > 0,
      "scheduler.climateIntervalTicks must be a positive integer");
    assert(Number.isInteger(scheduler.hydrologyIntervalTicks) && scheduler.hydrologyIntervalTicks > 0,
      "scheduler.hydrologyIntervalTicks must be a positive integer");
    assert(Number.isInteger(scheduler.geologyIntervalTicks) && scheduler.geologyIntervalTicks > 0,
      "scheduler.geologyIntervalTicks must be a positive integer");
  }

  assert(Number.isInteger(config.surface.gridWidth) && config.surface.gridWidth > 0, "surface.gridWidth must be a positive integer");
  assert(Number.isInteger(config.surface.gridHeight) && config.surface.gridHeight > 0, "surface.gridHeight must be a positive integer");
  nonNegative(config.surface.oceanFloorDepthM, "surface.oceanFloorDepthM");
  finite(config.surface.meanElevationM, "surface.meanElevationM");
  nonNegative(config.surface.roughnessM, "surface.roughnessM");
}

export function validateState(config: PlanetPhysicalConfig, state: PlanetState): void {
  assert(Number.isInteger(state.tick) && state.tick >= 0, "state.tick must be a non-negative integer");
  nonNegative(state.timeS, "state.timeS");
  finite(state.orbitalMeanAnomalyRad, "state.orbitalMeanAnomalyRad");
  finite(state.rotationPhaseRad, "state.rotationPhaseRad");
  inRange(state.obliquityRad, -Math.PI, Math.PI, "state.obliquityRad");

  nonNegative(state.interior.heatJ, "state.interior.heatJ");
  nonNegative(state.interior.volcanicActivity, "state.interior.volcanicActivity");
  nonNegative(state.interior.tectonicStress, "state.interior.tectonicStress");

  positive(state.atmosphere.totalMassKg, "state.atmosphere.totalMassKg");
  let compositionSum = 0;
  for (const key of GAS_KEYS) {
    const value = state.atmosphere.composition[key];
    nonNegative(value, `state.atmosphere.composition.${key}`);
    compositionSum += value;
  }
  assert(
    Math.abs(compositionSum - 1) <= COMPOSITION_TOLERANCE,
    `state atmosphere composition fractions must sum to 1 (got ${compositionSum})`,
  );
  nonNegative(state.atmosphere.opticalDepth, "state.atmosphere.opticalDepth");

  const hydrosphere = state.hydrosphere;
  nonNegative(hydrosphere.oceanMassKg, "state.hydrosphere.oceanMassKg");
  nonNegative(hydrosphere.iceMassKg, "state.hydrosphere.iceMassKg");
  nonNegative(hydrosphere.vaporMassKg, "state.hydrosphere.vaporMassKg");
  nonNegative(hydrosphere.soilWaterKg, "state.hydrosphere.soilWaterKg");
  finite(hydrosphere.seaLevelM, "state.hydrosphere.seaLevelM");
  const waterTotal = hydrosphere.oceanMassKg + hydrosphere.iceMassKg + hydrosphere.vaporMassKg + hydrosphere.soilWaterKg;
  assert(
    waterTotal <= config.hydrosphere.totalWaterKg * (1 + COMPOSITION_TOLERANCE),
    "water inventory exceeds configured totalWaterKg",
  );

  finite(state.surface.meanElevationM, "state.surface.meanElevationM");
  nonNegative(state.surface.sedimentMassKg, "state.surface.sedimentMassKg");

  positive(state.climate.globalMeanTemperatureK, "state.climate.globalMeanTemperatureK");
  assert(
    state.climate.globalMeanTemperatureK < 10000,
    "state.climate.globalMeanTemperatureK is implausibly high",
  );
  nonNegative(state.climate.co2Ppm, "state.climate.co2Ppm");
  inRange(state.climate.albedo, 0, 1, "state.climate.albedo");

  const scheduler = state.scheduler;
  assert(Number.isInteger(scheduler.lastClimateTick) && scheduler.lastClimateTick >= 0,
    "state.scheduler.lastClimateTick must be a non-negative integer");
  assert(Number.isInteger(scheduler.lastHydrologyTick) && scheduler.lastHydrologyTick >= 0,
    "state.scheduler.lastHydrologyTick must be a non-negative integer");
  assert(Number.isInteger(scheduler.lastGeologyTick) && scheduler.lastGeologyTick >= 0,
    "state.scheduler.lastGeologyTick must be a non-negative integer");
  nonNegative(scheduler.pendingClimateS, "state.scheduler.pendingClimateS");
  nonNegative(scheduler.pendingHydrologyS, "state.scheduler.pendingHydrologyS");
  nonNegative(scheduler.pendingGeologyS, "state.scheduler.pendingGeologyS");
}
