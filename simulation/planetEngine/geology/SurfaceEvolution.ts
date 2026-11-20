/**
 * PHYSICAL_MODEL + SIMULATION_HEURISTIC
 *
 * Pairwise diffusive erosion. Every exchange removes exactly the same volume
 * from the donor cell that it deposits in the receiver, so mass conservation
 * is structural rather than a post-hoc correction.
 */

import type { ElevationGrid, PlanetPhysicalConfig } from "../contracts";
import { clamp, PLANET_UNITS } from "../units";

export const EROSION_RATE_PER_S = 1e-11;
const MAX_EXCHANGE_FRACTION = 0.25;

export interface ErosionResult {
  elevationM: Float32Array;
  deltaM: Float32Array;
  erodedMassKg: number;
  depositedMassKg: number;
}

function wrapped(index: number, size: number): number {
  return ((index % size) + size) % size;
}

/**
 * One explicit diffusion step on a wrapped grid. `waterFactor` scales transport
 * by runoff; uniform ones means "no runoff weighting" for isolated tests.
 */
export function erodeAndDeposit(
  config: PlanetPhysicalConfig,
  grid: ElevationGrid,
  deltaS: number,
  waterFactor?: Float32Array,
): ErosionResult {
  const { width, height, elevationM } = grid;
  const delta = new Float64Array(elevationM.length);
  const rate = EROSION_RATE_PER_S * Math.max(0, deltaS);

  const exchange = (indexA: number, indexB: number): void => {
    const difference = elevationM[indexA] - elevationM[indexB];
    if (difference === 0) return;
    const factorA = waterFactor ? clamp(waterFactor[indexA], 0, 2) : 1;
    const factorB = waterFactor ? clamp(waterFactor[indexB], 0, 2) : 1;
    const amount = Math.min(
      Math.abs(difference) * MAX_EXCHANGE_FRACTION,
      rate * Math.abs(difference) * (factorA + factorB) * 0.5,
    );
    if (amount <= 0) return;
    if (difference > 0) {
      delta[indexA] -= amount;
      delta[indexB] += amount;
    } else {
      delta[indexB] -= amount;
      delta[indexA] += amount;
    }
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
  let erodedVolumeM3 = 0;
  let depositedVolumeM3 = 0;
  for (let i = 0; i < next.length; i += 1) {
    next[i] = elevationM[i] + delta[i];
    if (delta[i] < 0) erodedVolumeM3 += -delta[i];
    else depositedVolumeM3 += delta[i];
  }

  const massScale = grid.cellAreaM2 * PLANET_UNITS.crustDensityKgM3;
  return {
    elevationM: next,
    deltaM: Float32Array.from(delta),
    erodedMassKg: erodedVolumeM3 * massScale,
    depositedMassKg: depositedVolumeM3 * massScale,
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
