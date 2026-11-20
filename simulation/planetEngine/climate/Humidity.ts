/**
 * PHYSICAL_MODEL + APPROXIMATION
 *
 * Clausius-Clapeyron saturation and a bulk aerodynamic evaporation proxy.
 */

import { clamp } from "../units";

export interface EvaporationInput {
  irradianceWm2: number;
  temperatureK: number;
  relativeHumidity: number;
  windMS: number;
  waterAvailability: number;
}

/** Magnus formula over liquid water, Pa. */
export function saturationVaporPressurePa(temperatureK: number): number {
  const celsius = temperatureK - 273.15;
  return 610.94 * Math.exp((17.625 * celsius) / (celsius + 243.04));
}

export function relativeHumidityFromPressure(
  temperatureK: number,
  vaporPressurePa: number,
  oceanProximity = 1,
): number {
  const saturation = Math.max(saturationVaporPressurePa(temperatureK), 1e-6);
  const supply = 0.75 + 0.25 * clamp(oceanProximity, 0, 1);
  return clamp((Math.max(0, vaporPressurePa) / saturation) * supply, 0, 1);
}

/** Approximate bulk flux in m/year of water equivalent. */
export function evaporationMPerYear(input: EvaporationInput): number {
  const energyFactor = clamp(input.irradianceWm2 / 340, 0, 3);
  const vaporDeficit = 1 - clamp(input.relativeHumidity, 0, 1);
  const windFactor = 1 + clamp(input.windMS, 0, 60) / 10;
  const availability = clamp(input.waterAvailability, 0, 1);
  const mmPerDay = 5 * energyFactor * vaporDeficit * windFactor * availability;
  return clamp((mmPerDay * 365) / 1000, 0, 10);
}
