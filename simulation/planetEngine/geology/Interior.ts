/**
 * SIMULATION_HEURISTIC with physical constraints
 *
 * Internal heat is a finite reservoir. Radiogenic production replenishes part
 * of the loss; secular cooling drives tectonic stress and volcanic activity.
 */

import type { PlanetPhysicalConfig, PlanetState } from "../contracts";
import { clamp } from "../units";

/** Characteristic secular-cooling time for an Earth-like planet. */
export const COOLING_TIME_S = 1e17;

export interface InteriorUpdate {
  heatJ: number;
  heatFlowW: number;
  coolingW: number;
  tectonicStress: number;
  volcanicActivity: number;
}

export function coolingPowerW(config: PlanetPhysicalConfig, state: PlanetState): number {
  return Math.max(0, state.interior.heatJ) / COOLING_TIME_S;
}

export function heatFlowW(config: PlanetPhysicalConfig, state: PlanetState): number {
  return config.interior.radiogenicHeatW + coolingPowerW(config, state);
}

export function stepInterior(
  config: PlanetPhysicalConfig,
  state: PlanetState,
  deltaS: number,
): InteriorUpdate {
  const coolingW = coolingPowerW(config, state);
  const heatJ = Math.max(0, state.interior.heatJ - coolingW * deltaS);
  const referenceCoolingW = Math.max(config.interior.initialHeatJ / COOLING_TIME_S, 1e-9);
  const stressTarget = clamp(coolingW / referenceCoolingW, 0, 1);
  const blend = 1 - Math.exp(-deltaS / 1e15);
  const tectonicStress = state.interior.tectonicStress + (stressTarget - state.interior.tectonicStress) * blend;
  const volcanicActivity = clamp(0.6 * tectonicStress + 0.4 * clamp(heatFlowW(config, state) / 1e14, 0, 1), 0, 1);

  return {
    heatJ,
    heatFlowW: config.interior.radiogenicHeatW + coolingW,
    coolingW,
    tectonicStress,
    volcanicActivity,
  };
}
