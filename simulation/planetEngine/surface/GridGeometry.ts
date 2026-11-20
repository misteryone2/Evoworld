/**
 * PHYSICAL_MODEL / GEOMETRY
 *
 * Exact cell areas for an equirectangular latitude-longitude grid. Rows are
 * equal in longitude and equal in latitude; their spherical areas are not
 * equal. Using these areas keeps hypsometry, erosion and mass balances
 * consistent with the same discrete surface measure.
 */

import { surfaceAreaM2 } from "../core/PlanetCore";
import type { PlanetPhysicalConfig } from "../contracts";

export interface LatitudeBand {
  /** Northern edge, radians. */
  northRad: number;
  /** Southern edge, radians. */
  southRad: number;
  centerRad: number;
}

/** Cell row 0 touches the north pole; row `height - 1` touches the south pole. */
export function latitudeBandAtY(y: number, height: number): LatitudeBand {
  const northRad = Math.PI / 2 - (y / height) * Math.PI;
  const southRad = Math.PI / 2 - ((y + 1) / height) * Math.PI;
  return { northRad, southRad, centerRad: (northRad + southRad) / 2 };
}

/**
 * A = R² Δλ (sin φ_north - sin φ_south), Δλ = 2π / width.
 * The sum over all rows is exactly 4πR² (telescoping sine difference).
 */
export function latitudeCellAreasM2(width: number, height: number, radiusM: number): Float64Array {
  const areas = new Float64Array(width * height);
  const longitudeSpanRad = (2 * Math.PI) / width;
  const radiusSquared = radiusM * radiusM;

  for (let y = 0; y < height; y += 1) {
    const { northRad, southRad } = latitudeBandAtY(y, height);
    const rowAreaM2 = radiusSquared * longitudeSpanRad * (Math.sin(northRad) - Math.sin(southRad));
    const offset = y * width;
    for (let x = 0; x < width; x += 1) areas[offset + x] = rowAreaM2;
  }
  return areas;
}

export function totalCellAreaM2(areas: Float64Array): number {
  let total = 0;
  for (let i = 0; i < areas.length; i += 1) total += areas[i];
  return total;
}

export function meanCellAreaM2(areas: Float64Array): number {
  return areas.length > 0 ? totalCellAreaM2(areas) / areas.length : 0;
}

export function cellAreasForConfig(config: PlanetPhysicalConfig): Float64Array {
  return latitudeCellAreasM2(config.surface.gridWidth, config.surface.gridHeight, config.radiusM);
}

/** Guard used by tests and invariants: the discrete measure must match the sphere. */
export function gridAreaMatchesSphere(areas: Float64Array, config: PlanetPhysicalConfig): boolean {
  const expected = surfaceAreaM2(config);
  return Math.abs(totalCellAreaM2(areas) - expected) / expected < 1e-12;
}
