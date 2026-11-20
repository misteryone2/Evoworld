/**
 * PHYSICAL_MODEL
 *
 * Deterministic two-body Kepler orbit. Atmospheric drag, perturbations and
 * n-body effects are explicitly out of scope for the Planet Engine.
 */

import type { OrbitPosition, PlanetPhysicalConfig } from "../contracts";
import { clamp, normalizeAngleRad } from "../units";
import { meanMotionRadPerS } from "./PlanetCore";

const KEPLER_ITERATIONS = 32;
const KEPLER_TOLERANCE = 1e-12;

/** Solve M = E - e sin(E) with a fixed, deterministic iteration schedule. */
export function solveEccentricAnomaly(meanAnomalyRad: number, eccentricity: number): number {
  const mean = normalizeAngleRad(meanAnomalyRad);
  let eccentric = eccentricity < 0.8 ? mean : Math.PI;

  for (let i = 0; i < KEPLER_ITERATIONS; i += 1) {
    const residual = eccentric - eccentricity * Math.sin(eccentric) - mean;
    const derivative = 1 - eccentricity * Math.cos(eccentric);
    if (Math.abs(derivative) < KEPLER_TOLERANCE) break;
    const step = clamp(residual / derivative, -0.5, 0.5);
    eccentric -= step;
    if (Math.abs(step) < KEPLER_TOLERANCE) break;
  }

  return normalizeAngleRad(eccentric);
}

export function meanAnomalyAt(config: PlanetPhysicalConfig, timeS: number): number {
  const elapsed = timeS - config.orbit.epochS;
  return normalizeAngleRad(config.orbit.meanAnomalyAtEpochRad + meanMotionRadPerS(config) * elapsed);
}

export function orbitAtMeanAnomaly(config: PlanetPhysicalConfig, meanAnomalyRad: number): OrbitPosition {
  const mean = normalizeAngleRad(meanAnomalyRad);
  const e = config.orbit.eccentricity;
  const eccentricAnomalyRad = solveEccentricAnomaly(mean, e);
  const cosE = Math.cos(eccentricAnomalyRad);
  const sinE = Math.sin(eccentricAnomalyRad);
  const denominator = 1 - e * cosE;

  const cosTrue = (cosE - e) / denominator;
  const sinTrue = (Math.sqrt(Math.max(0, 1 - e * e)) * sinE) / denominator;
  const trueAnomalyRad = Math.atan2(sinTrue, cosTrue);
  const distanceM = config.orbit.semiMajorAxisM * denominator;

  // δ = asin(sin ε · sin λ). λ is the orbital longitude measured from the
  // ascending node; inclination is retained in config for later 3-D work.
  const orbitalLongitudeRad = trueAnomalyRad + config.orbit.longitudeOfPeriapsisRad;
  const declinationRad = Math.asin(
    clamp(Math.sin(config.axialTiltRad) * Math.sin(orbitalLongitudeRad), -1, 1),
  );

  return {
    timeS: 0,
    meanAnomalyRad: mean,
    eccentricAnomalyRad,
    trueAnomalyRad,
    distanceM,
    declinationRad,
  };
}

export function orbitAt(config: PlanetPhysicalConfig, timeS: number): OrbitPosition {
  const mean = meanAnomalyAt(config, timeS);
  return { ...orbitAtMeanAnomaly(config, mean), timeS };
}
