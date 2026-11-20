/**
 * SIMULATION_HEURISTIC with physical constraints
 *
 * A deterministic plate-velocity proxy. It is not a Navier-Stokes mantle
 * solver, but uplift/subsidence are bounded by available internal heat.
 */

import type { PlanetPhysicalConfig, PlanetState } from "../contracts";
import { hashSeed, random2D } from "../deterministic";
import { clamp } from "../units";

export const PLATE_CELL_SIZE = 16;

export interface PlateMotion {
  uMS: number;
  vMS: number;
  tendency: number;
}

/** Piecewise-constant plate motion over deterministic cells. */
export function plateMotionAt(config: PlanetPhysicalConfig, x: number, y: number): PlateMotion {
  const cx = Math.floor(x / PLATE_CELL_SIZE);
  const cy = Math.floor(y / PLATE_CELL_SIZE);
  const stream = hashSeed(config.seed, "tectonics/plates");
  const angle = random2D(stream, cx, cy) * 2 * Math.PI;
  const tendency = random2D(stream, cx + 9973, cy + 6151) * 2 - 1;
  const speedMS = 2e-9 + random2D(stream, cx + 31, cy + 17) * 5e-9;
  return {
    uMS: Math.cos(angle) * speedMS,
    vMS: Math.sin(angle) * speedMS,
    tendency,
  };
}

/** Vertical displacement driven by plate tendency and internal heat. */
export function tectonicElevationDeltaM(
  config: PlanetPhysicalConfig,
  state: PlanetState,
  x: number,
  y: number,
  deltaS: number,
): number {
  const heatFactor = clamp(state.interior.heatJ / Math.max(config.interior.initialHeatJ, 1e-9), 0, 1);
  const { tendency } = plateMotionAt(config, x, y);
  const rateMS = tendency * config.surface.roughnessM * 1e-11 * heatFactor;
  return rateMS * deltaS;
}
