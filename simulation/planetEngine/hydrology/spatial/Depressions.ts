/**
 * SIMULATION_HEURISTIC / ISOLATED PROTOTYPE
 *
 * Deterministic lake storage and spill for local minima. A cell with no lower
 * hydraulic head stores its surface water in `lakeM3`. Spill occurs only when
 * the lake surface head exceeds the lowest neighbour head; fluxes are computed
 * from the pre-transfer state and applied simultaneously.
 */

import type { SpatialWaterState } from "./SpatialWaterState";

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

export interface DepressionFluxes {
  donors: number[];
  receivers: number[];
  fluxByCellM3: Float64Array;
  routedM3: number;
  oceanSinkM3: number;
}

/** Move channel water that cannot drain into the local lake store. */
export function settleClosedBasins(state: SpatialWaterState): number {
  let storedM3 = 0;
  for (let i = 0; i < state.size; i += 1) {
    if (state.oceanMask[i] === 1 || state.channelM3[i] <= 0) continue;
    const ownGroundM = state.groundElevationM[i];
    let hasLowerNeighbour = false;
    for (const [dx, dy] of NEIGHBOURS) {
      const j = state.neighbourIndex(i, dx, dy);
      if (state.groundElevationM[j] < ownGroundM - 1e-12) {
        hasLowerNeighbour = true;
        break;
      }
    }
    if (!hasLowerNeighbour) {
      const volumeM3 = state.channelM3[i];
      state.channelM3[i] = 0;
      state.lakeM3[i] += volumeM3;
      storedM3 += volumeM3;
    }
  }
  return storedM3;
}

/** Compute lake-spill fluxes for cells whose surface exceeds a lower sill. */
export function computeDepressionFluxes(state: SpatialWaterState, substepS: number): DepressionFluxes {
  const fluxByCellM3 = new Float64Array(state.size);
  const donors: number[] = [];
  const receivers: number[] = [];
  let routedM3 = 0;
  let oceanSinkM3 = 0;

  for (let i = 0; i < state.size; i += 1) {
    const availableM3 = state.lakeM3[i];
    if (availableM3 <= 0 || state.oceanMask[i] === 1) continue;
    const ownHeadM = state.headM(i);
    let bestIndex = -1;
    let bestHeadM = Infinity;
    for (const [dx, dy] of NEIGHBOURS) {
      const j = state.neighbourIndex(i, dx, dy);
      const headM = state.headM(j);
      if (headM < bestHeadM) {
        bestHeadM = headM;
        bestIndex = j;
      }
    }
    if (bestIndex < 0 || ownHeadM <= bestHeadM) continue;

    const headDropM = ownHeadM - bestHeadM;
    const volumeLimitM3 = state.options.routeConductanceMPerS * state.cellAreasM2[i] * headDropM * substepS;
    const donorCapM3 = state.options.maxDonorFraction * availableM3;
    const fluxM3 = Math.max(0, Math.min(availableM3, volumeLimitM3, donorCapM3));
    if (fluxM3 <= 0) continue;
    fluxByCellM3[i] = fluxM3;
    donors.push(i);
    receivers.push(bestIndex);
    routedM3 += fluxM3;
    if (state.oceanMask[bestIndex] === 1) oceanSinkM3 += fluxM3;
  }
  return { donors, receivers, fluxByCellM3, routedM3, oceanSinkM3 };
}

/** Apply depression fluxes simultaneously. */
export function applyDepressionFluxes(state: SpatialWaterState, fluxes: DepressionFluxes): number {
  let appliedM3 = 0;
  for (let k = 0; k < fluxes.donors.length; k += 1) {
    const donor = fluxes.donors[k];
    const receiver = fluxes.receivers[k];
    const volumeM3 = fluxes.fluxByCellM3[donor];
    if (volumeM3 <= 0) continue;
    state.lakeM3[donor] -= volumeM3;
    if (receiver >= 0 && state.oceanMask[receiver] === 0) {
      state.channelM3[receiver] += volumeM3;
    }
    appliedM3 += volumeM3;
  }
  return appliedM3;
}
