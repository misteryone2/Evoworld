/**
 * PHYSICAL_MODEL + APPROXIMATION
 *
 * Local insolation from orbital distance, obliquity and latitude. Daily means
 * use a fixed 24-step quadrature so results are deterministic and testable.
 */

import { clamp, normalizeAngleRad } from "../units";

export const INSOLATION_QUADRATURE_STEPS = 24;

export function latitudeAtY(y: number, height: number): number {
  return Math.PI / 2 - (y / Math.max(height - 1, 1)) * Math.PI;
}

export function longitudeAtX(x: number, width: number, rotationPhaseRad: number): number {
  return normalizeAngleRad((x / width) * 2 * Math.PI - rotationPhaseRad);
}

export function hourAngleRad(longitudeRad: number, rotationPhaseRad: number): number {
  return normalizeAngleRad(longitudeRad + rotationPhaseRad);
}

/** cos(Z) = sinφ sinδ + cosφ cosδ cos(H), clamped to the daylight hemisphere. */
export function cosineZenith(latitudeRad: number, declinationRad: number, hourAngleRadValue: number): number {
  const value =
    Math.sin(latitudeRad) * Math.sin(declinationRad) +
    Math.cos(latitudeRad) * Math.cos(declinationRad) * Math.cos(hourAngleRadValue);
  return Math.max(0, value);
}

export function dailyMeanCosineZenith(
  latitudeRad: number,
  declinationRad: number,
  steps = INSOLATION_QUADRATURE_STEPS,
): number {
  const count = Math.max(1, Math.trunc(steps));
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    const hourAngle = ((i + 0.5) / count) * 2 * Math.PI;
    sum += cosineZenith(latitudeRad, declinationRad, hourAngle);
  }
  return clamp(sum / count, 0, 1);
}

export function instantaneousIrradianceWm2(
  fluxWm2: number,
  latitudeRad: number,
  declinationRad: number,
  hourAngleRadValue: number,
): number {
  return fluxWm2 * cosineZenith(latitudeRad, declinationRad, hourAngleRadValue);
}

export function dailyMeanIrradianceWm2(
  fluxWm2: number,
  latitudeRad: number,
  declinationRad: number,
): number {
  return fluxWm2 * dailyMeanCosineZenith(latitudeRad, declinationRad);
}
