/**
 * PHYSICAL_MODEL
 *
 * Conservative water inventory update. Fluxes are masses over the caller's
 * timestep; every transfer subtracts from one reservoir and adds to another.
 */

import type { PlanetState } from "../contracts";

export interface WaterFluxKg {
  evaporationKg: number;
  precipitationKg: number;
  runoffKg: number;
  iceMeltKg?: number;
  freezingKg?: number;
}

export interface AppliedWaterFluxKg extends Required<WaterFluxKg> {
  totalBeforeKg: number;
  totalAfterKg: number;
}

export function totalWaterInventoryKg(state: PlanetState): number {
  const h = state.hydrosphere;
  return h.oceanMassKg + h.iceMassKg + h.vaporMassKg + h.soilWaterKg;
}

function positive(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0;
}

export function applyWaterFluxes(state: PlanetState, fluxes: WaterFluxKg): AppliedWaterFluxKg {
  const h = state.hydrosphere;
  const totalBeforeKg = totalWaterInventoryKg(state);

  const surfaceKg = h.oceanMassKg + h.soilWaterKg;
  const oceanShare = surfaceKg > 0 ? h.oceanMassKg / surfaceKg : 1;
  const evaporationKg = Math.min(positive(fluxes.evaporationKg), surfaceKg);
  const precipitationKg = Math.min(positive(fluxes.precipitationKg), h.vaporMassKg + evaporationKg);

  const evaporationOceanKg = evaporationKg * oceanShare;
  const evaporationSoilKg = evaporationKg - evaporationOceanKg;
  const precipitationOceanKg = precipitationKg * oceanShare;
  const precipitationSoilKg = precipitationKg - precipitationOceanKg;

  const soilAfterExchangeKg = Math.max(0, h.soilWaterKg - evaporationSoilKg + precipitationSoilKg);
  const runoffKg = Math.min(positive(fluxes.runoffKg), soilAfterExchangeKg);

  h.oceanMassKg = Math.max(0, h.oceanMassKg - evaporationOceanKg + precipitationOceanKg + runoffKg);
  h.soilWaterKg = soilAfterExchangeKg - runoffKg;
  h.vaporMassKg = Math.max(0, h.vaporMassKg + evaporationKg - precipitationKg);

  const iceMeltKg = Math.min(positive(fluxes.iceMeltKg), h.iceMassKg);
  h.iceMassKg -= iceMeltKg;
  h.oceanMassKg += iceMeltKg;

  const freezingKg = Math.min(positive(fluxes.freezingKg), h.oceanMassKg);
  h.oceanMassKg -= freezingKg;
  h.iceMassKg += freezingKg;

  return {
    evaporationKg,
    precipitationKg,
    runoffKg,
    iceMeltKg,
    freezingKg,
    totalBeforeKg,
    totalAfterKg: totalWaterInventoryKg(state),
  };
}
