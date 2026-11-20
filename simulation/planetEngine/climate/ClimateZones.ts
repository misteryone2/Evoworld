/**
 * SIMULATION_HEURISTIC
 *
 * Seasons are derived from orbital declination and its rate of change; the
 * legacy fixed tick table is not used. Zone weights are continuous, so no
 * hard `latitude < X => biome` rule is introduced here.
 */

import type { PlanetPhysicalConfig, Season } from "../contracts";
import { orbitAt } from "../core/Orbit";
import { clamp, PLANET_UNITS } from "../units";

export function seasonAt(config: PlanetPhysicalConfig, timeS: number): Season {
  if (Math.abs(config.axialTiltRad) < 1e-6) return "primavera";
  const now = orbitAt(config, timeS);
  const soon = orbitAt(config, timeS + PLANET_UNITS.secondsPerEarthDay);
  const threshold = Math.sin(Math.abs(config.axialTiltRad)) * 0.15;

  if (now.declinationRad > threshold) return "estate";
  if (now.declinationRad < -threshold) return "inverno";
  return soon.declinationRad >= now.declinationRad ? "primavera" : "autunno";
}

export interface ThermalZoneWeights {
  polar: number;
  temperate: number;
  tropical: number;
}

/** Smooth memberships for reporting; not a biome classifier. */
export function thermalZoneWeights(temperatureK: number): ThermalZoneWeights {
  const polar = clamp((273.15 - temperatureK) / 30, 0, 1);
  const tropical = clamp((temperatureK - 288.15) / 30, 0, 1);
  const temperate = clamp(1 - polar - tropical, 0, 1);
  return { polar, temperate, tropical };
}
