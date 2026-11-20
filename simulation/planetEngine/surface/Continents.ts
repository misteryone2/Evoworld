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

export function oceanFractionOf(mask: Uint8Array): number {
  if (mask.length === 0) return 0;
  let ocean = 0;
  for (let i = 0; i < mask.length; i += 1) ocean += mask[i];
  return ocean / mask.length;
}

export function buildSurfaceField(
  grid: Omit<SurfaceField, "seaLevelM" | "oceanMask" | "coastlineMask" | "oceanFraction" | "landFraction">,
  seaLevelM: number,
): SurfaceField {
  const oceanMask = buildOceanMask(grid.elevationM, grid.width, grid.height, seaLevelM);
  const oceanFraction = oceanFractionOf(oceanMask);
  return {
    ...grid,
    seaLevelM,
    oceanMask,
    coastlineMask: new Uint8Array(grid.elevationM.length),
    oceanFraction,
    landFraction: 1 - oceanFraction,
  };
}
