/**
 * PHYSICAL_MODEL + APPROXIMATION
 *
 * Deterministic elevation distribution. The shape is a physical input to
 * sea-level and coastline calculations; the fractal generator itself is an
 * approximation, not a claim about real plate-tectonic history.
 */

import type { ElevationGrid, PlanetPhysicalConfig } from "../contracts";
import { fbm2D, hashSeed } from "../deterministic";
import { clamp } from "../units";
import { cellAreasForConfig, meanCellAreaM2 } from "./GridGeometry";

export const ELEVATION_SALT = "surface/elevation/v1";

/** Continuous elevation at normalized grid coordinates. Longitude wraps. */
export function elevationAtM(config: PlanetPhysicalConfig, x: number, y: number): number {
  const width = config.surface.gridWidth;
  const height = config.surface.gridHeight;
  const u = x / width;
  const v = y / height;

  const continent = fbm2D(hashSeed(config.seed, `${ELEVATION_SALT}/continent`), u * 3, v * 3, 4, 3, 3);
  const detail = fbm2D(hashSeed(config.seed, `${ELEVATION_SALT}/detail`), u * 12, v * 12, 5, 12, 12);
  const landness = clamp((continent - 0.42) / 0.32, 0, 1);

  const oceanFloor = -config.surface.oceanFloorDepthM * (1 - landness);
  const oceanRelief = (1 - landness) * config.surface.roughnessM * (detail - 0.5) * 0.15;
  const landElevation = landness * (
    config.surface.meanElevationM + config.surface.roughnessM * (detail * 2 - 1)
  );

  return oceanFloor + oceanRelief + landElevation;
}

export function buildElevationGrid(config: PlanetPhysicalConfig): ElevationGrid {
  const width = config.surface.gridWidth;
  const height = config.surface.gridHeight;
  const elevationM = new Float32Array(width * height);
  const transportElevationM = new Float64Array(width * height);
  let minM = Infinity;
  let maxM = -Infinity;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = elevationAtM(config, x, y);
      elevationM[y * width + x] = value;
      // Preserve the unquantized generator output for mass-conserving transport.
      transportElevationM[y * width + x] = value;
      if (value < minM) minM = value;
      if (value > maxM) maxM = value;
    }
  }

  const cellAreasM2 = cellAreasForConfig(config);
  return {
    width,
    height,
    elevationM,
    minM,
    maxM,
    cellAreasM2,
    cellAreaM2: meanCellAreaM2(cellAreasM2),
    transportElevationM,
  };
}

export interface ElevationHistogram {
  minM: number;
  maxM: number;
  binWidthM: number;
  counts: Uint32Array;
  /** Latitude-weighted area accumulated per elevation bin. */
  areasM2: Float64Array;
}

export function elevationHistogram(grid: ElevationGrid, bins = 256): ElevationHistogram {
  const count = Math.max(2, Math.trunc(bins));
  const counts = new Uint32Array(count);
  const areasM2 = new Float64Array(count);
  const span = Math.max(grid.maxM - grid.minM, 1e-9);
  const binWidthM = span / count;

  for (let i = 0; i < grid.elevationM.length; i += 1) {
    const index = clamp(Math.floor((grid.elevationM[i] - grid.minM) / binWidthM), 0, count - 1);
    counts[index] += 1;
    areasM2[index] += grid.cellAreasM2[i];
  }

  return { minM: grid.minM, maxM: grid.maxM, binWidthM, counts, areasM2 };
}

/** Approximate the flooded volume using bin area weights, not cell counts. */
function volumeBelowLevelM3(histogram: ElevationHistogram, levelM: number): number {
  if (levelM <= histogram.minM) return 0;
  if (levelM >= histogram.maxM) {
    let volumeCellsM = 0;
    for (let i = 0; i < histogram.areasM2.length; i += 1) {
      const center = histogram.minM + (i + 0.5) * histogram.binWidthM;
      volumeCellsM += histogram.areasM2[i] * Math.max(0, histogram.maxM - center);
    }
    return volumeCellsM;
  }

  let volumeCellsM = 0;
  const fullBins = Math.floor((levelM - histogram.minM) / histogram.binWidthM);
  for (let i = 0; i < fullBins && i < histogram.areasM2.length; i += 1) {
    const center = histogram.minM + (i + 0.5) * histogram.binWidthM;
    if (center >= levelM) break;
    volumeCellsM += histogram.areasM2[i] * (levelM - center);
  }

  // Linear density inside the partially flooded bin: ∫₀^f x dx = f²/2.
  const partial = clamp((levelM - histogram.minM) / histogram.binWidthM - fullBins, 0, 1);
  if (fullBins < histogram.areasM2.length) {
    volumeCellsM += histogram.areasM2[fullBins] * histogram.binWidthM * partial * partial * 0.5;
  }

  return volumeCellsM;
}

/**
 * PHYSICAL_MODEL: solve ∫_{elev < h}(h - elev)dA = V_ocean by bisection on a
 * latitude-weighted deterministic histogram. No hard-coded water threshold is
 * involved and polar cells contribute their true, smaller area.
 */
export function solveSeaLevelM(grid: ElevationGrid, waterVolumeM3: number, bins = 256): number {
  if (!(waterVolumeM3 > 0)) return grid.minM;
  const histogram = elevationHistogram(grid, bins);
  if (volumeBelowLevelM3(histogram, grid.maxM) <= waterVolumeM3) return grid.maxM;

  let low = grid.minM;
  let high = grid.maxM;
  for (let i = 0; i < 48; i += 1) {
    const mid = (low + high) / 2;
    if (volumeBelowLevelM3(histogram, mid) < waterVolumeM3) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}
