/**
 * APPROXIMATION
 *
 * Pairwise diffusive erosion on a latitude-weighted grid. The transport
 * variable is VOLUME: the same volume is removed from the donor and deposited
 * in the receiver, so `A_i * Δh_i + A_j * Δh_j = 0` for every exchange. Crustal
 * mass is therefore conserved even though cell areas differ.
 */

import type { ElevationGrid, PlanetPhysicalConfig } from "../contracts";
import { clamp, PLANET_UNITS } from "../units";

export const EROSION_RATE_PER_S = 1e-11;
const MAX_EXCHANGE_FRACTION = 0.25;

export interface ErosionResult {
  elevationM: Float32Array;
  deltaM: Float32Array;
  erodedVolumeM3: number;
  depositedVolumeM3: number;
  /** Exact double-precision transport balance; zero by construction. */
  volumeBalanceM3: number;
  erodedMassKg: number;
  depositedMassKg: number;
}

function wrapped(index: number, size: number): number {
  return ((index % size) + size) % size;
}

/**
 * One explicit diffusion step on a wrapped grid. `waterFactor` scales transport
 * by a local runoff proxy; uniform ones means "no runoff weighting".
 */
export function erodeAndDeposit(
  config: PlanetPhysicalConfig,
  grid: ElevationGrid,
  deltaS: number,
  waterFactor?: Float32Array,
): ErosionResult {
  const { width, height, elevationM, cellAreasM2 } = grid;
  const delta = new Float64Array(elevationM.length);
  const rate = EROSION_RATE_PER_S * Math.max(0, deltaS);
  let erodedVolumeM3 = 0;
  let depositedVolumeM3 = 0;

  const exchange = (indexA: number, indexB: number): void => {
    const difference = elevationM[indexA] - elevationM[indexB];
    if (difference === 0) return;

    const areaA = Math.max(cellAreasM2[indexA], 1);
    const areaB = Math.max(cellAreasM2[indexB], 1);
    const factorA = waterFactor ? clamp(waterFactor[indexA], 0, 2) : 1;
    const factorB = waterFactor ? clamp(waterFactor[indexB], 0, 2) : 1;

    // A transferred volume V reduces Δh by V(1/A_a + 1/A_b).
    const inverseConductance = 1 / areaA + 1 / areaB;
    const conductance = 1 / inverseConductance;
    const maximumDifferenceReduction = Math.abs(difference) * MAX_EXCHANGE_FRACTION;
    const rateDifferenceReduction = rate * Math.abs(difference) * (factorA + factorB) * 0.5;
    const volumeM3 = Math.min(maximumDifferenceReduction, rateDifferenceReduction) * conductance;
    if (!(volumeM3 > 0)) return;

    if (difference > 0) {
      delta[indexA] -= volumeM3 / areaA;
      delta[indexB] += volumeM3 / areaB;
    } else {
      delta[indexB] -= volumeM3 / areaB;
      delta[indexA] += volumeM3 / areaA;
    }
    erodedVolumeM3 += volumeM3;
    depositedVolumeM3 += volumeM3;
  };

  // Visit each undirected wrapped edge once so exchange order cannot matter.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      exchange(index, y * width + wrapped(x + 1, width));
      if (y < height - 1) {
        const below = wrapped(y + 1, height) * width + x;
        exchange(index, below);
      }
    }
  }

  const next = new Float32Array(elevationM.length);
  for (let i = 0; i < next.length; i += 1) next[i] = elevationM[i] + delta[i];

  const densityKgM3 = PLANET_UNITS.crustDensityKgM3;
  return {
    elevationM: next,
    deltaM: Float32Array.from(delta),
    erodedVolumeM3,
    depositedVolumeM3,
    volumeBalanceM3: erodedVolumeM3 - depositedVolumeM3,
    erodedMassKg: erodedVolumeM3 * densityKgM3,
    depositedMassKg: depositedVolumeM3 * densityKgM3,
  };
}

export function applyElevationDeltaM(grid: ElevationGrid, deltaM: Float32Array): ElevationGrid {
  let minM = Infinity;
  let maxM = -Infinity;
  const elevationM = new Float32Array(grid.elevationM.length);
  for (let i = 0; i < elevationM.length; i += 1) {
    const value = grid.elevationM[i] + deltaM[i];
    elevationM[i] = value;
    if (value < minM) minM = value;
    if (value > maxM) maxM = value;
  }
  return { ...grid, elevationM, minM, maxM };
}

export function addLocalElevationM(grid: ElevationGrid, index: number, amountM: number): ElevationGrid {
  const elevationM = new Float32Array(grid.elevationM);
  elevationM[index] += amountM;
  return {
    ...grid,
    elevationM,
    minM: Math.min(grid.minM, elevationM[index]),
    maxM: Math.max(grid.maxM, elevationM[index]),
  };
}
