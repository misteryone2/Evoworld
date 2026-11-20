/**
 * PHYSICAL_MODEL / UNIT DEFINITIONS
 *
 * All internal Planet Engine calculations use SI units. Conversion helpers are
 * explicit so legacy rendering/biology units never leak into the model.
 */

export const PLANET_UNITS = {
  secondsPerEarthYear: 31557600,
  secondsPerEarthDay: 86400,
  earthMassKg: 5.9722e24,
  earthRadiusM: 6.371e6,
  auM: 1.495978707e11,
  solarLuminosityW: 3.828e26,
  stefanBoltzmann: 5.670374419e-8,
  gravitationalConstant: 6.6743e-11,
  standardGravityMS2: 9.80665,
  waterDensityKgM3: 1000,
  crustDensityKgM3: 2700,
  dryAirCpJPerKgK: 1004.5,
} as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function normalizeAngleRad(value: number): number {
  const tau = 2 * Math.PI;
  const wrapped = value % tau;
  return wrapped < 0 ? wrapped + tau : wrapped;
}

export function yearsToSeconds(years: number): number {
  return years * PLANET_UNITS.secondsPerEarthYear;
}

export function daysToSeconds(days: number): number {
  return days * PLANET_UNITS.secondsPerEarthDay;
}

export function auToMeters(au: number): number {
  return au * PLANET_UNITS.auM;
}

export function solarLuminositiesToWatts(value: number): number {
  return value * PLANET_UNITS.solarLuminosityW;
}

export function celsiusToKelvin(celsius: number): number {
  return celsius + 273.15;
}

export function kelvinToCelsius(kelvin: number): number {
  return kelvin - 273.15;
}

/**
 * Legacy `Cell.temperature` is expressed in an arbitrary gameplay scale centred
 * near 20, not in Celsius. This adapter is the single explicit boundary.
 */
export function legacyTemperatureFromKelvin(kelvin: number): number {
  return kelvin - 273.15 + 20;
}

export function kelvinFromLegacyTemperature(value: number): number {
  return value - 20 + 273.15;
}
