import { TICKS_PER_YEAR } from "../core/constants";
import { hashNoise } from "./terrainNoise";

/**
 * v1.3.0 — Stagioni. Pure, stateless seasonal-climate helpers, shared by
 * the simulation (Planet), the viewport payload (viewportFrame.ts) and the
 * renderer (lib/terrainColor.ts), so all three always agree on what the
 * season looks like at a given tick.
 *
 * Why stateless: a cell's *current* temperature is now a pure function of
 * (its annual-mean temperature, its latitude, the tick). It is never
 * accumulated tick by tick, so a chunk that sat dormant for a few years and
 * then reactivated lands on exactly the same temperature a continuously
 * simulated chunk would have — no catch-up approximation needed for it.
 */

/**
 * Largest seasonal swing (in degrees, around a cell's annual mean) reached
 * at the poles. It scales linearly with latitude, so the equator has no
 * temperature seasons at all and mid-latitudes swing by about half of this.
 */
export const SEASONAL_TEMPERATURE_AMPLITUDE = 12;

/** Position inside the year, 0..1 (0 = first day of spring). */
export function yearPhase(tick: number): number {
  return (((tick % TICKS_PER_YEAR) + TICKS_PER_YEAR) % TICKS_PER_YEAR) / TICKS_PER_YEAR;
}

/**
 * Seasonal temperature offset (degrees) to add to a cell's annual mean.
 * Northern hemisphere (small y) peaks in the middle of "estate" and bottoms
 * out in the middle of "inverno"; the southern hemisphere is the mirror
 * image, as on a real planet.
 */
export function seasonalTemperatureOffset(y: number, planetHeight: number, tick: number): number {
  const signedLatitude = (0.5 - y / planetHeight) * 2; // +1 north pole .. 0 equator .. -1 south pole
  return SEASONAL_TEMPERATURE_AMPLITUDE * signedLatitude * Math.sin(2 * Math.PI * (yearPhase(tick) - 0.125));
}

/**
 * A cell's annual-mean temperature: the value a cell is generated with,
 * and the center its seasonal swing oscillates around. Same expression
 * Planet.computeCellBaseline has always used.
 */
export function annualMeanTemperature(seed: number, x: number, y: number, height: number, elevation: number): number {
  const latitude = Math.abs(y / height - 0.5) * 2; // 0 at equator, 1 at poles
  return 32 - latitude * 40 - elevation * 10 + hashNoise(seed, x, y) * 2;
}
