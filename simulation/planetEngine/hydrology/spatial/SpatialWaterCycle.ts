/**
 * SIMULATION_HEURISTIC / APPROXIMATION / ISOLATED PROTOTYPE
 *
 * Orchestrates infiltration, simultaneous D8 routing and depression spill on
 * the Phase-A spatial water state. The default PlanetEngine remains unchanged;
 * this module is an isolated, deterministically testable prototype.
 */

import { PlanetInvariantError } from "../../core/invariants";
import { PLANET_UNITS } from "../../units";
import { applyD8Fluxes, computeD8Fluxes } from "./D8Routing";
import {
  applyDepressionFluxes,
  computeDepressionFluxes,
  settleClosedBasins,
} from "./Depressions";
import { infiltrateAndEvaporate } from "./Infiltration";
import { SpatialWaterState } from "./SpatialWaterState";

export interface SpatialForcing {
  /** Total precipitation mass [kg] per cell over the whole step. */
  precipitationKg: Float64Array;
  /** Potential evaporation mass [kg] per cell over the whole step. */
  evaporationDemandKg: Float64Array;
}

export interface SpatialWaterInventory {
  oceanMassKg: number;
  vaporMassKg: number;
}

export interface SpatialStepResult {
  deltaS: number;
  substeps: number;
  precipitationM3: number;
  infiltrationM3: number;
  surfaceInputM3: number;
  evaporatedM3: number;
  d8RoutedM3: number;
  depressionSpillM3: number;
  lakeStoredM3: number;
  oceanSinkM3: number;
  soilBeforeM3: number;
  soilAfterM3: number;
  surfaceBeforeM3: number;
  surfaceAfterM3: number;
  inventoryBefore: SpatialWaterInventory;
  inventoryAfter: SpatialWaterInventory;
}

function nonNegativeArray(values: Float64Array, label: string): void {
  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i]) || values[i] < 0) {
      throw new PlanetInvariantError(`${label}[${i}] must be finite and non-negative`);
    }
  }
}

/**
 * Advance the isolated prototype by `deltaS` seconds. All fluxes inside a
 * substep are computed from the same state and applied simultaneously, so
 * `iterationOrder` cannot change numeric results.
 */
export function stepSpatialWaterCycle(
  state: SpatialWaterState,
  inventory: SpatialWaterInventory,
  forcing: SpatialForcing,
  deltaS: number,
): SpatialStepResult {
  if (!Number.isFinite(deltaS) || deltaS <= 0) {
    throw new PlanetInvariantError("deltaS must be positive and finite");
  }
  if (forcing.precipitationKg.length !== state.size || forcing.evaporationDemandKg.length !== state.size) {
    throw new PlanetInvariantError("spatial forcing arrays must match grid size");
  }
  nonNegativeArray(forcing.precipitationKg, "precipitationKg");
  nonNegativeArray(forcing.evaporationDemandKg, "evaporationDemandKg");

  const substeps = Math.max(1, Math.ceil(deltaS / state.options.targetSubstepS));
  const substepS = deltaS / substeps;
  const rho = PLANET_UNITS.waterDensityKgM3;
  const inventoryBefore: SpatialWaterInventory = { ...inventory };
  const soilBeforeM3 = state.totalSoilWaterM3();
  const surfaceBeforeM3 = state.totalSurfaceWaterM3();

  let precipitationM3 = 0;
  let infiltrationM3 = 0;
  let surfaceInputM3 = 0;
  let evaporatedM3 = 0;
  let d8RoutedM3 = 0;
  let depressionSpillM3 = 0;
  let lakeStoredM3 = 0;
  let oceanSinkM3 = 0;

  for (let substep = 0; substep < substeps; substep += 1) {
    state.forEachCell((i) => {
      const rainM3 = forcing.precipitationKg[i] / rho / substeps;
      const evapM3 = forcing.evaporationDemandKg[i] / rho / substeps;
      const applied = infiltrateAndEvaporate(state, i, rainM3, evapM3);
      precipitationM3 += rainM3;
      infiltrationM3 += applied.infiltratedM3;
      surfaceInputM3 += applied.surfaceInputM3;
      evaporatedM3 += applied.evaporatedM3;
    });

    const d8 = computeD8Fluxes(state, substepS);
    d8RoutedM3 += applyD8Fluxes(state, d8);
    oceanSinkM3 += d8.oceanSinkM3;

    lakeStoredM3 += settleClosedBasins(state);
    const spill = computeDepressionFluxes(state, substepS);
    depressionSpillM3 += applyDepressionFluxes(state, spill);
    oceanSinkM3 += spill.oceanSinkM3;
  }
  // Any water delivered into a closed basin by the final spill must also be
  // settled, otherwise it remains in a transient channel cell.
  lakeStoredM3 += settleClosedBasins(state);
  state.assertHealthy();

  const totalRainKg = precipitationM3 * rho;
  inventory.vaporMassKg -= totalRainKg;
  inventory.vaporMassKg += evaporatedM3 * rho;
  inventory.oceanMassKg += oceanSinkM3 * rho;
  if (!Number.isFinite(inventory.vaporMassKg) || inventory.vaporMassKg < 0) {
    throw new PlanetInvariantError("spatial precipitation overdraws atmospheric vapor");
  }
  if (!Number.isFinite(inventory.oceanMassKg) || inventory.oceanMassKg < 0) {
    throw new PlanetInvariantError("spatial ocean inventory is invalid");
  }

  return {
    deltaS,
    substeps,
    precipitationM3,
    infiltrationM3,
    surfaceInputM3,
    evaporatedM3,
    d8RoutedM3,
    depressionSpillM3,
    lakeStoredM3,
    oceanSinkM3,
    soilBeforeM3,
    soilAfterM3: state.totalSoilWaterM3(),
    surfaceBeforeM3,
    surfaceAfterM3: state.totalSurfaceWaterM3(),
    inventoryBefore,
    inventoryAfter: { ...inventory },
  };
}

/** Total water in all prototype stores [m³]. */
export function totalSpatialWaterM3(state: SpatialWaterState): number {
  return state.totalSoilWaterM3() + state.totalSurfaceWaterM3();
}
