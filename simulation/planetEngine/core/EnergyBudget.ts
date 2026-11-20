/**
 * PHYSICAL_MODEL + APPROXIMATION
 *
 * Zero-dimensional global energy balance. The Stefan-Boltzmann step and the
 * S/4 geometric dilution are physical; the Bond-albedo estimate and the
 * logarithmic greenhouse forcing are explicit calibrated approximations.
 */

import type { GasKey, OrbitPosition, PlanetPhysicalConfig, PlanetState } from "../contracts";
import { clamp, PLANET_UNITS } from "../units";
import { surfaceAreaM2, gravityMS2 } from "./PlanetCore";
import { stellarFluxWm2 } from "./Stellar";

/**
 * APPROXIMATION: M1 has no surface/ice maps yet. Ice fraction is the only
 * available albedo driver; ocean/land/snow/cloud masks arrive in later milestones.
 */
export function estimateBondAlbedo(config: PlanetPhysicalConfig): number {
  const ice = clamp(config.hydrosphere.iceFraction, 0, 1);
  return clamp(0.28 + 0.35 * ice, 0.05, 0.85);
}

export interface PartialPressuresPa {
  N2: number;
  O2: number;
  CO2: number;
  H2O: number;
  CH4: number;
  Ar: number;
  other: number;
}

export function partialPressuresPa(composition: Record<GasKey, number>, totalPressurePa: number): PartialPressuresPa {
  return {
    N2: composition.N2 * totalPressurePa,
    O2: composition.O2 * totalPressurePa,
    CO2: composition.CO2 * totalPressurePa,
    H2O: composition.H2O * totalPressurePa,
    CH4: composition.CH4 * totalPressurePa,
    Ar: composition.Ar * totalPressurePa,
    other: composition.other * totalPressurePa,
  };
}

/**
 * APPROXIMATION: calibrated to 33 K for an Earth-like 1 atm, 280 ppm CO2,
 * 1% H2O, 1.9 ppm CH4 atmosphere. Pressure broadening scales the whole
 * forcing; below the reference pressure the greenhouse tends to zero.
 */
const GREENHOUSE_REFERENCE = {
  pressurePa: 101325,
  co2Ppm: 280,
  h2oFraction: 0.01,
  ch4Ppm: 1.9,
  baseDeltaK: 33,
  co2CoefficientK: 6,
  h2oCoefficientK: 10,
  ch4CoefficientK: 1.5,
} as const;

export function greenhouseDeltaK(composition: Record<GasKey, number>, totalPressurePa: number): number {
  const pressure = Math.max(0, totalPressurePa);
  if (pressure <= 0) return 0;

  const pressureFactor = clamp(Math.sqrt(pressure / GREENHOUSE_REFERENCE.pressurePa), 0, 3);
  if (pressureFactor === 0) return 0;

  const co2Ppm = Math.max(composition.CO2, 1e-12) * 1e6;
  const h2oFraction = Math.max(composition.H2O, 1e-12);
  const ch4Ppm = Math.max(composition.CH4, 1e-12) * 1e6;

  const forcing =
    GREENHOUSE_REFERENCE.baseDeltaK +
    GREENHOUSE_REFERENCE.co2CoefficientK * Math.log(co2Ppm / GREENHOUSE_REFERENCE.co2Ppm) +
    GREENHOUSE_REFERENCE.h2oCoefficientK * Math.log(h2oFraction / GREENHOUSE_REFERENCE.h2oFraction) +
    GREENHOUSE_REFERENCE.ch4CoefficientK * Math.log(ch4Ppm / GREENHOUSE_REFERENCE.ch4Ppm);

  const scaled = pressureFactor * clamp(forcing, -GREENHOUSE_REFERENCE.baseDeltaK, 120);
  return clamp(scaled, 0, 150);
}

/** APPROXIMATION: map the greenhouse temperature increment to grey optical depth. */
export function opticalDepthFromGreenhouseDeltaK(deltaK: number): number {
  return clamp((Math.max(0, deltaK) / GREENHOUSE_REFERENCE.baseDeltaK) * 0.84, 0, 20);
}

export interface EnergyBudgetResult {
  fluxWm2: number;
  meanInsolationWm2: number;
  absorbedWm2: number;
  albedo: number;
  equilibriumTemperatureK: number;
  greenhouseDeltaK: number;
  surfaceTemperatureK: number;
  opticalDepth: number;
  surfacePressurePa: number;
  partialPressures: PartialPressuresPa;
}

/** Pressure from the atmospheric mass inventory, not an independent parameter. */
export function surfacePressureFromState(config: PlanetPhysicalConfig, state: PlanetState): number {
  return (state.atmosphere.totalMassKg * gravityMS2(config)) / surfaceAreaM2(config);
}

export function computeEnergyBudget(
  config: PlanetPhysicalConfig,
  orbit: OrbitPosition,
  state: PlanetState,
): EnergyBudgetResult {
  const fluxWm2 = stellarFluxWm2(config.star.luminosityW, orbit.distanceM);
  const meanInsolationWm2 = fluxWm2 / 4;
  const albedo = clamp(state.climate.albedo, 0, 1);
  const absorbedWm2 = meanInsolationWm2 * (1 - albedo);
  // Standard global balance: σT^4 = S(1-A)/4. `absorbedWm2` is already S/4.
  const equilibriumTemperatureK = Math.pow(absorbedWm2 / PLANET_UNITS.stefanBoltzmann, 0.25);

  const surfacePressurePa = surfacePressureFromState(config, state);
  const partialPressures = partialPressuresPa(state.atmosphere.composition, surfacePressurePa);
  const deltaK = greenhouseDeltaK(state.atmosphere.composition, surfacePressurePa);

  return {
    fluxWm2,
    meanInsolationWm2,
    absorbedWm2,
    albedo,
    equilibriumTemperatureK,
    greenhouseDeltaK: deltaK,
    surfaceTemperatureK: equilibriumTemperatureK + deltaK,
    opticalDepth: opticalDepthFromGreenhouseDeltaK(deltaK),
    surfacePressurePa,
    partialPressures,
  };
}
