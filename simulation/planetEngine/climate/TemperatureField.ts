/**
 * APPROXIMATION
 *
 * Local surface temperature. The dry lapse rate is physical. Latitudinal and
 * seasonal structure is driven by the actual daily-mean irradiance computed
 * from orbit, obliquity and latitude, but the conversion from insolation
 * anomaly to temperature is a calibrated logarithmic proxy, not a solved
 * local energy balance. No claim of local radiative-advective precision is made.
 */

import { clamp, PLANET_UNITS } from "../units";

export interface LocalTemperatureInput {
  /** Global mean surface temperature from the zero-dimensional budget. */
  globalMeanTemperatureK: number;
  /** S/4 from the same orbit as the local irradiance. */
  globalMeanInsolationWm2: number;
  /** Daily-mean local irradiance at the cell. */
  irradianceWm2: number;
  elevationM: number;
  seaLevelM: number;
  humidity: number;
  gravityMS2: number;
}

/** Γ_dry = g / cp. PHYSICAL_MODEL. */
export function dryLapseRateKPerM(gravityMS2Value: number): number {
  return gravityMS2Value / PLANET_UNITS.dryAirCpJPerKgK;
}

/**
 * APPROXIMATION retained for the legacy seasonal offset only. It is not added
 * again to temperature: seasonality is already present in `irradianceWm2`.
 */
export function seasonalShapeK(latitudeRad: number, declinationRad: number, obliquityRad: number): number {
  const tiltFactor = Math.max(Math.abs(Math.sin(obliquityRad)), 0.05);
  const seasonSignal = clamp(Math.sin(declinationRad) / tiltFactor, -1, 1);
  return 7 * Math.sin(latitudeRad) * seasonSignal;
}

/** APPROXIMATION: bounded log response to local/global insolation ratio. */
export function insolationAnomalyK(irradianceWm2: number, globalMeanInsolationWm2: number): number {
  const local = Math.max(0, Number.isFinite(irradianceWm2) ? irradianceWm2 : 0);
  const mean = Math.max(1, Number.isFinite(globalMeanInsolationWm2) ? globalMeanInsolationWm2 : 1);
  return clamp(28 * Math.log((local + 5) / (mean + 5)), -60, 25);
}

export function localTemperatureK(input: LocalTemperatureInput): number {
  const landHeightM = Math.max(0, input.elevationM - input.seaLevelM);
  const lapseK = dryLapseRateKPerM(input.gravityMS2) * landHeightM;
  const maritimeDamping = -2 * (clamp(input.humidity, 0, 1) - 0.5);
  const value =
    input.globalMeanTemperatureK +
    insolationAnomalyK(input.irradianceWm2, input.globalMeanInsolationWm2) -
    lapseK +
    maritimeDamping;
  return clamp(value, 120, 350);
}
