/**
 * PHYSICAL_MODEL + APPROXIMATION
 *
 * Sea level is the bisection root of the hypsometric volume equation. It is a
 * derived quantity; no independent "water > threshold" mask is stored.
 */

import type { ElevationGrid, PlanetState } from "../contracts";
import { solveSeaLevelM } from "../surface/Hypsometry";
import { PLANET_UNITS } from "../units";

export function oceanVolumeM3(state: PlanetState): number {
  return state.hydrosphere.oceanMassKg / PLANET_UNITS.waterDensityKgM3;
}

export function updateSeaLevelFromInventory(grid: ElevationGrid, state: PlanetState): number {
  const seaLevelM = solveSeaLevelM(grid, oceanVolumeM3(state));
  state.hydrosphere.seaLevelM = seaLevelM;
  return seaLevelM;
}
