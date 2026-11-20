/**
 * SIMULATION_HEURISTIC
 *
 * Hadley/Ferrel/Polar bands with Coriolis correction. These are deterministic
 * wind proxies, not a fluid-dynamics solver.
 */

import { clamp } from "../units";

export type CirculationCell = "hadley" | "ferrel" | "polar";

export function circulationCellAt(latitudeRad: number): CirculationCell {
  const absolute = Math.abs(latitudeRad);
  if (absolute < Math.PI / 6) return "hadley";
  if (absolute < Math.PI / 3) return "ferrel";
  return "polar";
}

/** f = 2Ω sin(φ). */
export function coriolisParameter(latitudeRad: number, rotationRateRadPerS: number): number {
  return 2 * rotationRateRadPerS * Math.sin(latitudeRad);
}

/** Zonal wind magnitude from cell strength, pressure gradient and Coriolis. */
export function zonalWindMS(
  latitudeRad: number,
  rotationRateRadPerS: number,
  pressureGradientPaPerM: number,
): number {
  const cellStrength = circulationCellAt(latitudeRad) === "hadley" ? 1 : 0.65;
  const coriolis = Math.abs(coriolisParameter(latitudeRad, rotationRateRadPerS));
  const gradientTerm = Math.abs(pressureGradientPaPerM) * 200;
  const deflection = 1 / (1 + coriolis * 1e6);
  return clamp((2 + gradientTerm) * cellStrength * deflection, 0, 60);
}
