/**
 * APPROXIMATION
 *
 * Atmosphere-facing greenhouse contract. The calibrated logarithmic model
 * lives in core/EnergyBudget; this module applies it to the gas inventory.
 */

import type { PlanetState } from "../contracts";
import { greenhouseDeltaK, opticalDepthFromGreenhouseDeltaK, surfacePressureFromState } from "../core/EnergyBudget";
import type { PlanetPhysicalConfig } from "../contracts";

export function greenhouseIncrementK(config: PlanetPhysicalConfig, state: PlanetState): number {
  const pressurePa = surfacePressureFromState(config, state);
  return greenhouseDeltaK(state.atmosphere.composition, pressurePa);
}

export function atmosphericOpticalDepth(config: PlanetPhysicalConfig, state: PlanetState): number {
  return opticalDepthFromGreenhouseDeltaK(greenhouseIncrementK(config, state));
}

export function co2WarmingPerDoublingK(config: PlanetPhysicalConfig, state: PlanetState): number {
  const base = greenhouseIncrementK(config, state);
  const doubledComposition = { ...state.atmosphere.composition, CO2: Math.min(1, state.atmosphere.composition.CO2 * 2) };
  const pressurePa = surfacePressureFromState(config, state);
  return greenhouseDeltaK(doubledComposition, pressurePa) - base;
}
