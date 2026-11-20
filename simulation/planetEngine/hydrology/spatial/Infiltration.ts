/**
 * PHYSICAL_MODEL + APPROXIMATION / ISOLATED PROTOTYPE
 *
 * Rain partitioning and evaporation from the prototype's per-cell soil and
 * surface stores. Volumes are m³; fluxes are volumes per substep.
 */

import type { SpatialWaterState } from "./SpatialWaterState";

export interface InfiltrationResult {
  infiltratedM3: number;
  surfaceInputM3: number;
  evaporatedM3: number;
  evaporationFromSoilM3: number;
}

const MIN_POSITIVE = 1e-30;

/** Apply local precipitation and evaporation to one cell. */
export function infiltrateAndEvaporate(
  state: SpatialWaterState,
  index: number,
  precipitationM3: number,
  evaporationDemandM3: number,
): InfiltrationResult {
  const soilCapacityM3 = state.soilCapacityM3(index);
  const headroomM3 = Math.max(0, soilCapacityM3 - state.soilM3[index]);
  const conductivityPerSubstepM = state.options.hydraulicConductivityMPerS;
  const conductivityVolumeM3 = conductivityPerSubstepM * state.cellAreasM2[index];
  // Darcy capacity reduced linearly by remaining pore space.
  const infiltrationLimitM3 = Math.min(headroomM3, conductivityVolumeM3 * (headroomM3 / Math.max(soilCapacityM3, MIN_POSITIVE)));
  const infiltratedM3 = Math.max(0, Math.min(precipitationM3, infiltrationLimitM3));
  state.soilM3[index] += infiltratedM3;
  const surfaceInputM3 = Math.max(0, precipitationM3 - infiltratedM3);
  state.channelM3[index] += surfaceInputM3;

  const demandM3 = Math.max(0, evaporationDemandM3);
  const fromSurfaceM3 = Math.min(demandM3, state.channelM3[index]);
  state.channelM3[index] -= fromSurfaceM3;
  let remainingDemandM3 = demandM3 - fromSurfaceM3;
  const fromSoilM3 = Math.min(remainingDemandM3, state.soilM3[index]);
  state.soilM3[index] -= fromSoilM3;
  remainingDemandM3 -= fromSoilM3;

  return {
    infiltratedM3,
    surfaceInputM3,
    evaporatedM3: demandM3 - remainingDemandM3,
    evaporationFromSoilM3: fromSoilM3,
  };
}
