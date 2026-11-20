/**
 * SIMULATION_HEURISTIC / ISOLATED PROTOTYPE
 *
 * Simultaneous D8 steepest-descent surface-water routing. Every flux is
 * computed from the same pre-routing state, then applied together, so cell
 * iteration order cannot affect results. This is a kinematic approximation,
 * not a momentum or shallow-water solve.
 */

import { PlanetInvariantError } from "../../core/invariants";
import type { SpatialWaterState } from "./SpatialWaterState";

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

export interface RouteResult {
  /** Volume moved from each donor to its chosen receiver. */
  fluxByCellM3: Float64Array;
  /** Total routed volume (sum of outgoing fluxes). */
  routedM3: number;
  /** Volume routed into ocean-masked receiver cells. */
  oceanSinkM3: number;
  /** Donor cell indices, ascending (diagnostic only). */
  donors: number[];
  /** Receiver cell indices matching donors; -1 means ocean/edge sink. */
  receivers: number[];
}

/** Great-circle-ish centre distance [m] for an 8-neighbour stencil cell. */
function neighbourDistanceM(widthCells: number, heightCells: number, dx: number, dy: number, radiusM: number): number {
  const lonSpan = (2 * Math.PI * radiusM) / widthCells;
  const latSpan = (Math.PI * radiusM) / heightCells;
  return Math.hypot(dx * lonSpan, dy * latSpan);
}

/**
 * Compute all downhill fluxes without mutating the state. A cell with no lower
 * head (a pit) is handled by the depression module, not here.
 */
export function computeD8Fluxes(state: SpatialWaterState, substepS: number): RouteResult {
  if (!Number.isFinite(substepS) || substepS <= 0) {
    throw new PlanetInvariantError("substepS must be positive and finite");
  }
  const fluxByCellM3 = new Float64Array(state.size);
  const donors: number[] = [];
  const receivers: number[] = [];
  let routedM3 = 0;
  let oceanSinkM3 = 0;

  for (let i = 0; i < state.size; i += 1) {
    const availableM3 = state.channelM3[i];
    if (availableM3 <= 0 || state.oceanMask[i] === 1) continue;

    const ownHeadM = state.headM(i);
    let bestIndex = -1;
    let bestSlope = 0;

    for (const [dx, dy] of NEIGHBOURS) {
      const j = state.neighbourIndex(i, dx, dy);
      // Terrain must descend; stored water alone cannot create a new downhill
      // direction. Local minima are handled by the depression/lake module.
      if (state.groundElevationM[j] >= state.groundElevationM[i]) continue;
      const headM = state.headM(j);
      const distanceM = neighbourDistanceM(state.width, state.height, dx, dy, state.options.planetRadiusM);
      const slope = (ownHeadM - headM) / Math.max(distanceM, 1e-6);
      if (slope > bestSlope) {
        bestSlope = slope;
        bestIndex = j;
      }
      // Ties keep the first (ascending NEIGHBOURS) candidate.
    }

    if (bestIndex < 0) continue;

    const conductanceLimitM3 = state.options.routeConductanceMPerS * state.cellAreasM2[i] * bestSlope * substepS;
    const donorCapM3 = state.options.maxDonorFraction * availableM3;
    const fluxM3 = Math.max(0, Math.min(availableM3, conductanceLimitM3, donorCapM3));
    if (fluxM3 <= 0) continue;

    fluxByCellM3[i] = fluxM3;
    donors.push(i);
    receivers.push(bestIndex);
    routedM3 += fluxM3;
    if (state.oceanMask[bestIndex] === 1) oceanSinkM3 += fluxM3;
  }

  return { fluxByCellM3, routedM3, oceanSinkM3, donors, receivers };
}

/** Apply precomputed fluxes simultaneously and return the applied total. */
export function applyD8Fluxes(state: SpatialWaterState, result: RouteResult): number {
  let appliedM3 = 0;
  for (let k = 0; k < result.donors.length; k += 1) {
    const donor = result.donors[k];
    const receiver = result.receivers[k];
    const fluxM3 = result.fluxByCellM3[donor];
    if (fluxM3 <= 0) continue;
    state.channelM3[donor] -= fluxM3;
    if (receiver >= 0 && state.oceanMask[receiver] === 0) {
      state.channelM3[receiver] += fluxM3;
    }
    // Ocean receivers are sinks: volume leaves the surface grid and is added
    // to the ocean inventory by the orchestrator using result.oceanSinkM3.
    appliedM3 += fluxM3;
  }
  return appliedM3;
}
