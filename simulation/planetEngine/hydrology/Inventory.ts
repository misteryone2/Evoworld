/**
 * PHYSICAL_MODEL / GLOBAL RESERVOIRS
 *
 * One water contract for the whole engine. `hydrosphere.vaporMassKg` is the
 * authoritative atmospheric water reservoir; `atmosphere.composition.H2O` is
 * derived from it after every transfer. There is no separate cloud reservoir:
 * condensation and precipitation are two labels for the same vapor -> surface
 * transfer in a single timestep.
 */

import type { PlanetState } from "../contracts";
import { PlanetInvariantError } from "../core/invariants";
import { dryAirMassKgFromState, setAtmosphericWaterMassKg } from "../atmosphere/Composition";

export interface WaterFluxKg {
  /** Surface (ocean + soil) -> atmosphere. */
  evaporationKg: number;
  /** Atmosphere -> surface. Equals condensation in this no-cloud model. */
  precipitationKg: number;
  /** Soil -> ocean. */
  runoffKg: number;
  iceMeltKg?: number;
  freezingKg?: number;
}

export interface AppliedWaterFluxKg {
  evaporationKg: number;
  precipitationKg: number;
  condensationKg: number;
  runoffKg: number;
  iceMeltKg: number;
  freezingKg: number;
  totalBeforeKg: number;
  totalAfterKg: number;
  dryAirMassBeforeKg: number;
  dryAirMassAfterKg: number;
}

export function totalWaterInventoryKg(state: PlanetState): number {
  const h = state.hydrosphere;
  return h.oceanMassKg + h.iceMassKg + h.vaporMassKg + h.soilWaterKg;
}

function requiredNonNegative(value: number | undefined, label: string): number {
  if (value === undefined) return 0;
  if (!Number.isFinite(value) || value < 0) {
    throw new PlanetInvariantError(`${label} must be a finite non-negative number`);
  }
  return value;
}

/** Apply one conservative water transfer step and resync atmospheric H2O. */
export function applyWaterFluxes(state: PlanetState, fluxes: WaterFluxKg): AppliedWaterFluxKg {
  const h = state.hydrosphere;
  const totalBeforeKg = totalWaterInventoryKg(state);
  const requestedEvaporationKg = requiredNonNegative(fluxes.evaporationKg, "evaporationKg");
  const requestedPrecipitationKg = requiredNonNegative(fluxes.precipitationKg, "precipitationKg");
  const requestedRunoffKg = requiredNonNegative(fluxes.runoffKg, "runoffKg");
  const requestedIceMeltKg = requiredNonNegative(fluxes.iceMeltKg, "iceMeltKg");
  const requestedFreezingKg = requiredNonNegative(fluxes.freezingKg, "freezingKg");

  const dryAirMassBeforeKg = dryAirMassKgFromState(state);
  const surfaceKg = h.oceanMassKg + h.soilWaterKg;
  const oceanShare = surfaceKg > 0 ? h.oceanMassKg / surfaceKg : 1;

  const evaporationKg = Math.min(requestedEvaporationKg, surfaceKg);
  const evaporationOceanKg = evaporationKg * oceanShare;
  const evaporationSoilKg = evaporationKg - evaporationOceanKg;

  h.oceanMassKg -= evaporationOceanKg;
  h.soilWaterKg -= evaporationSoilKg;
  h.vaporMassKg += evaporationKg;

  const condensationKg = Math.min(requestedPrecipitationKg, h.vaporMassKg);
  const precipitationOceanKg = condensationKg * oceanShare;
  const precipitationSoilKg = condensationKg - precipitationOceanKg;

  h.vaporMassKg -= condensationKg;
  h.oceanMassKg += precipitationOceanKg;
  h.soilWaterKg += precipitationSoilKg;

  const runoffKg = Math.min(requestedRunoffKg, h.soilWaterKg);
  h.soilWaterKg -= runoffKg;
  h.oceanMassKg += runoffKg;

  const iceMeltKg = Math.min(requestedIceMeltKg, h.iceMassKg);
  h.iceMassKg -= iceMeltKg;
  h.oceanMassKg += iceMeltKg;

  const freezingKg = Math.min(requestedFreezingKg, h.oceanMassKg);
  h.oceanMassKg -= freezingKg;
  h.iceMassKg += freezingKg;

  setAtmosphericWaterMassKg(state, h.vaporMassKg);
  const totalAfterKg = totalWaterInventoryKg(state);
  const absoluteErrorKg = Math.abs(totalAfterKg - totalBeforeKg);
  if (absoluteErrorKg > totalBeforeKg * 1e-10 + 1e-6) {
    throw new PlanetInvariantError("water inventory transfer changed total water mass");
  }

  return {
    evaporationKg,
    precipitationKg: condensationKg,
    condensationKg,
    runoffKg,
    iceMeltKg,
    freezingKg,
    totalBeforeKg,
    totalAfterKg,
    dryAirMassBeforeKg,
    dryAirMassAfterKg: dryAirMassKgFromState(state),
  };
}
