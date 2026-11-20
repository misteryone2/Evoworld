/**
 * APPROXIMATION
 *
 * Pairwise diffusive erosion on a latitude-weighted grid. The transport
 * variable is VOLUME in double precision: the same volume is removed from the
 * donor and deposited in the receiver, so `A_i * Δh_i + A_j * Δh_j = 0` for
 * every exchange. Crustal mass is therefore conserved even though cell areas
 * differ. The public `elevationM` grid stays Float32 for compatibility, while
 * `transportElevationM` carries the quantization residual forward so it never
 * accumulates as a real mass drift.
 */

import type { ElevationGrid, PlanetPhysicalConfig } from "../contracts";
import { clamp, PLANET_UNITS } from "../units";

export const EROSION_RATE_PER_S = 1e-11;
const MAX_EXCHANGE_FRACTION = 0.25;

/**
 * Explicit quantitative tolerance for the double-precision transport balance.
 * It applies to the larger of the transported volume and the magnitude of the
 * integrated baseline: summing O(10^3) terms of order 10^16 m^3 has double
 * roundoff of that order, which is not transported mass.
 */
export const EROSION_VOLUME_TOLERANCE_RELATIVE = 1e-12;

export interface ErosionResult {
  /** Float32 public view of the evolved elevations. */
  elevationM: Float32Array;
  /** Float32 public view of the local elevation changes. */
  deltaM: Float32Array;
  /** Authoritative double-precision transport state after the step. */
  transportElevationM: Float64Array;
  erodedVolumeM3: number;
  depositedVolumeM3: number;
  /** Exact double-precision exchange balance; zero by construction. */
  volumeBalanceM3: number;
  erodedMassKg: number;
  depositedMassKg: number;
  /** Volume of the source state, integrated in double precision. */
  sourceVolumeM3: number;
  /** Volume of the authoritative double-precision result. */
  transportVolumeM3: number;
  /** Volume of the published Float32 grid; diagnostic only. */
  publicGridVolumeM3: number;
  /** Quantization residual retained in `transportElevationM`, never lost. */
  quantizationResidualM3: number;
  /** Explicit acceptance bound for `transportVolumeBalanceM3`. */
  transportVolumeBalanceM3: number;
  transportVolumeToleranceM3: number;
}

function wrapped(index: number, size: number): number {
  return ((index % size) + size) % size;
}

function transportSource(grid: ElevationGrid): Float64Array {
  return grid.transportElevationM ?? Float64Array.from(grid.elevationM);
}

function integratedVolumeM3(elevation: Float64Array | Float32Array, areas: Float64Array): number {
  let volumeM3 = 0;
  for (let i = 0; i < elevation.length; i += 1) volumeM3 += elevation[i] * areas[i];
  return volumeM3;
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
  const { width, height, cellAreasM2 } = grid;
  const source = transportSource(grid);
  const delta = new Float64Array(source.length);
  const rate = EROSION_RATE_PER_S * Math.max(0, deltaS);
  let erodedVolumeM3 = 0;
  let depositedVolumeM3 = 0;

  const exchange = (indexA: number, indexB: number): void => {
    const difference = source[indexA] - source[indexB];
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

  const transport = new Float64Array(source.length);
  const elevationM = new Float32Array(source.length);
  const deltaM = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 1) {
    transport[i] = source[i] + delta[i];
    elevationM[i] = transport[i];
    deltaM[i] = delta[i];
  }

  const sourceVolumeM3 = integratedVolumeM3(source, cellAreasM2);
  const transportVolumeM3 = integratedVolumeM3(transport, cellAreasM2);
  const publicGridVolumeM3 = integratedVolumeM3(elevationM, cellAreasM2);
  const transportVolumeBalanceM3 = transportVolumeM3 - sourceVolumeM3;
  const densityKgM3 = PLANET_UNITS.crustDensityKgM3;
  return {
    elevationM,
    deltaM,
    transportElevationM: transport,
    erodedVolumeM3,
    depositedVolumeM3,
    volumeBalanceM3: erodedVolumeM3 - depositedVolumeM3,
    erodedMassKg: erodedVolumeM3 * densityKgM3,
    depositedMassKg: depositedVolumeM3 * densityKgM3,
    sourceVolumeM3,
    transportVolumeM3,
    publicGridVolumeM3,
    quantizationResidualM3: publicGridVolumeM3 - transportVolumeM3,
    transportVolumeBalanceM3,
    transportVolumeToleranceM3: Math.max(
      1,
      Math.abs(erodedVolumeM3) * EROSION_VOLUME_TOLERANCE_RELATIVE,
      Math.abs(sourceVolumeM3) * EROSION_VOLUME_TOLERANCE_RELATIVE,
    ),
  };
}

export function applyElevationDeltaM(grid: ElevationGrid, deltaM: Float32Array): ElevationGrid {
  let minM = Infinity;
  let maxM = -Infinity;
  const source = transportSource(grid);
  const transport = new Float64Array(source.length);
  const elevationM = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 1) {
    transport[i] = source[i] + deltaM[i];
    elevationM[i] = transport[i];
    if (elevationM[i] < minM) minM = elevationM[i];
    if (elevationM[i] > maxM) maxM = elevationM[i];
  }
  return { ...grid, elevationM, transportElevationM: transport, minM, maxM };
}

export function addLocalElevationM(grid: ElevationGrid, index: number, amountM: number): ElevationGrid {
  const source = transportSource(grid);
  const transport = Float64Array.from(source);
  transport[index] += amountM;
  const elevationM = Float32Array.from(transport);
  return {
    ...grid,
    elevationM,
    transportElevationM: transport,
    minM: Math.min(grid.minM, elevationM[index]),
    maxM: Math.max(grid.maxM, elevationM[index]),
  };
}
