/**
 * PHYSICAL_MODEL + APPROXIMATION
 *
 * Local surface temperature. The dry lapse rate is physical; the latitudinal
 * and seasonal shapes are deterministic approximations driven by insolation,
 * not lookup tables of climate zones.
 */

import { clamp, PLANET_UNITS } from "../units";

export interface LocalTemperatureInput {
  globalMeanTemperatureK: number;
  latitudeRad: number;
  elevationM: number;
  seaLevelM: number;
  declinationRad: number;
  obliquityRad: number;
  humidity: number;
  gravityMS2: number;
}

/** Area-mean-preserving latitudinal shape: +4 K equator, -8 K poles. */
export function latitudeShapeK(latitudeRad: number): number {
  const sinLat = Math.sin(latitudeRad);
  return 12 * (1 / 3 - sinLat * sinLat);
}

/** Γ_dry = g / cp. */
export function dryLapseRateKPerM(gravityMS2Value: number): number {
  return gravityMS2Value / PLANET_UNITS.dryAirCpJPerKgK;
}

export function seasonalShapeK(latitudeRad: number, declinationRad: number, obliquityRad: number): number {
  const tiltFactor = Math.max(Math.abs(Math.sin(obliquityRad)), 0.05);
  const seasonSignal = clamp(Math.sin(declinationRad) / tiltFactor, -1, 1);
  return 7 * Math.sin(latitudeRad) * seasonSignal;
}

export function localTemperatureK(input: LocalTemperatureInput): number {
  const landHeightM = Math.max(0, input.elevationM - input.seaLevelM);
  const lapseK = dryLapseRateKPerM(input.gravityMS2) * landHeightM;
  const maritimeDamping = -2 * (clamp(input.humidity, 0, 1) - 0.5);
  const value =
    input.globalMeanTemperatureK +
    latitudeShapeK(input.latitudeRad) +
    seasonalShapeK(input.latitudeRad, input.declinationRad, input.obliquityRad) -
    lapseK +
    maritimeDamping;
  return clamp(value, 120, 350);
}
