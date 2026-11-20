/**
 * PHYSICAL_MODEL
 *
 * Land/ocean classification from elevation and the solved sea level. The old
 * `water > 0.65` threshold is deliberately absent.
 */

import type { SurfaceField } from "../contracts";

export function isOceanElevationM(elevationM: number, seaLevelM: number): boolean {
  return elevationM < seaLevelM;
}

export function buildOceanMask(
  elevationM: Float32Array,
  width: number,
  height: number,
  seaLevelM: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = isOceanElevationM(elevationM[i], seaLevelM) ? 1 : 0;
  }
  return mask;
}

/** Area-weighted ocean fraction; cell counts would over-weight polar rows. */
export function oceanFractionOf(mask: Uint8Array, cellAreasM2?: Float64Array): number {
  if (mask.length === 0) return 0;
  if (!cellAreasM2 || cellAreasM2.length !== mask.length) {
    let ocean = 0;
    for (let i = 0; i < mask.length; i += 1) ocean += mask[i];
    return ocean / mask.length;
  }
  let oceanAreaM2 = 0;
  let totalAreaM2 = 0;
  for (let i = 0; i < mask.length; i += 1) {
    totalAreaM2 += cellAreasM2[i];
    if (mask[i] === 1) oceanAreaM2 += cellAreasM2[i];
  }
  return totalAreaM2 > 0 ? oceanAreaM2 / totalAreaM2 : 0;
}

export function buildSurfaceField(
  grid: Omit<SurfaceField, "seaLevelM" | "oceanMask" | "coastlineMask" | "oceanFraction" | "landFraction">,
  seaLevelM: number,
): SurfaceField {
  const oceanMask = buildOceanMask(grid.elevationM, grid.width, grid.height, seaLevelM);
  const oceanFraction = oceanFractionOf(oceanMask, grid.cellAreasM2);
  return {
    ...grid,
    seaLevelM,
    oceanMask,
    coastlineMask: new Uint8Array(grid.elevationM.length),
    oceanFraction,
    landFraction: 1 - oceanFraction,
  };
}
