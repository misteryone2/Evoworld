import { describe, expect, it } from "vitest";
import type { ElevationGrid } from "../simulation/planetEngine/contracts";
import { PLANET_UNITS } from "../simulation/planetEngine/units";
import { computeD8Fluxes } from "../simulation/planetEngine/hydrology/spatial/D8Routing";
import {
  SpatialWaterState,
  type SpatialWaterOptions,
} from "../simulation/planetEngine/hydrology/spatial/SpatialWaterState";
import {
  stepSpatialWaterCycle,
  totalSpatialWaterM3,
  type SpatialForcing,
  type SpatialWaterInventory,
} from "../simulation/planetEngine/hydrology/spatial/SpatialWaterCycle";

const BASE_OPTIONS: SpatialWaterOptions = {
  soilDepthM: 1,
  porosity: 0.35,
  hydraulicConductivityMPerS: 0,
  routeConductanceMPerS: 0.5,
  targetSubstepS: 86400,
  maxDonorFraction: 0.25,
  planetRadiusM: PLANET_UNITS.earthRadiusM,
  iterationOrder: "forward",
};

function makeGrid(width: number, height: number, elevation: number[], cellAreaM2 = 1e6): ElevationGrid {
  return {
    width,
    height,
    elevationM: Float32Array.from(elevation),
    minM: Math.min(...elevation),
    maxM: Math.max(...elevation),
    cellAreasM2: new Float64Array(width * height).fill(cellAreaM2),
    cellAreaM2,
    transportElevationM: Float64Array.from(elevation),
  };
}

function forcing(size: number, rainM3 = 0, evapM3 = 0): SpatialForcing {
  const rho = PLANET_UNITS.waterDensityKgM3;
  return {
    precipitationKg: new Float64Array(size).fill(rainM3 * rho),
    evaporationDemandKg: new Float64Array(size).fill(evapM3 * rho),
  };
}

function forcingAt(size: number, index: number, rainM3: number): SpatialForcing {
  const rainKg = new Float64Array(size);
  rainKg[index] = rainM3 * PLANET_UNITS.waterDensityKgM3;
  return { precipitationKg: rainKg, evaporationDemandKg: new Float64Array(size) };
}

function inventory(vaporM3 = 1e12, oceanM3 = 1e12): SpatialWaterInventory {
  const rho = PLANET_UNITS.waterDensityKgM3;
  return { vaporMassKg: vaporM3 * rho, oceanMassKg: oceanM3 * rho };
}

describe("Phase-A spatial hydrology — isolated synthetic validation", () => {
  it("inclined-plane pulse reaches the first downhill cell within one substep and stays on-gradient", () => {
    const width = 6;
    const height = 3;
    const elevation = Array.from({ length: width * height }, (_, i) => 5 - (i % width));
    // Small synthetic planet radius makes conductance exceed the donor cap,
    // isolating the 25% cap assertion from Earth-scale distance units.
    const state = new SpatialWaterState(makeGrid(width, height, elevation), { ...BASE_OPTIONS, planetRadiusM: 1000 });
    const donor = 1 * width + 2;
    const expectedReceiver = donor + 1;
    state.channelM3[donor] = 1e6;

    const routed = computeD8Fluxes(state, 86400);
    expect(routed.donors).toContain(donor);
    const donorPosition = routed.donors.indexOf(donor);
    expect(routed.receivers[donorPosition]).toBe(expectedReceiver);
    expect(routed.fluxByCellM3[donor]).toBeCloseTo(0.25 * 1e6, 6);
    expect(routed.oceanSinkM3).toBe(0);

    for (let i = 0; i < state.size; i += 1) {
      if (i % width !== 2) expect(state.channelM3[i]).toBe(0);
    }
  });

  it("closed basin stores water below the sill and spills once the lake surface overtops it", () => {
    const elevation = Array.from({ length: 9 }, (_, i) => (i === 4 ? 0 : 10));
    const preSill = new SpatialWaterState(makeGrid(3, 3, elevation), BASE_OPTIONS);
    const preResult = stepSpatialWaterCycle(preSill, inventory(), forcingAt(9, 4, 5e6), 86400);
    expect(preSill.lakeM3[4]).toBeCloseTo(5e6, 6);
    expect(preResult.depressionSpillM3).toBe(0);
    expect(preResult.oceanSinkM3).toBe(0);

    const overtop = new SpatialWaterState(makeGrid(3, 3, elevation), BASE_OPTIONS);
    const overResult = stepSpatialWaterCycle(overtop, inventory(), forcingAt(9, 4, 20e6), 86400);
    expect(overResult.depressionSpillM3).toBeGreaterThan(0);
    expect(overtop.lakeM3[4]).toBeLessThan(20e6);
    expect(overResult.d8RoutedM3).toBe(0);
  });

  it("uniform rain on a flat torus produces no directional drift", () => {
    const state = new SpatialWaterState(makeGrid(4, 4, new Array(16).fill(0)), BASE_OPTIONS);
    const result = stepSpatialWaterCycle(state, inventory(), forcing(16, 100), 86400);
    expect(result.d8RoutedM3).toBe(0);
    expect(result.depressionSpillM3).toBe(0);
    for (let i = 0; i < state.size; i += 1) {
      expect(state.lakeM3[i]).toBeCloseTo(100, 6);
      expect(state.channelM3[i]).toBe(0);
    }
    expect(Math.max(...state.lakeM3) - Math.min(...state.lakeM3)).toBeLessThan(1e-12);
  });

  it("source/sink audit: reservoir change equals the prescribed forcing table", () => {
    const state = new SpatialWaterState(makeGrid(4, 4, new Array(16).fill(0)), BASE_OPTIONS);
    const rainKg = new Float64Array(16);
    const evapKg = new Float64Array(16);
    let rainTotalM3 = 0;
    let evapTotalM3 = 0;
    for (let i = 0; i < 16; i += 1) {
      const rainM3 = i * 10;
      const evapM3 = i % 2 === 0 ? i * 2 : 0;
      rainKg[i] = rainM3 * PLANET_UNITS.waterDensityKgM3;
      evapKg[i] = evapM3 * PLANET_UNITS.waterDensityKgM3;
      rainTotalM3 += rainM3;
      evapTotalM3 += Math.min(rainM3, evapM3);
    }
    const result = stepSpatialWaterCycle(state, inventory(), { precipitationKg: rainKg, evaporationDemandKg: evapKg }, 86400);
    expect(result.precipitationM3).toBeCloseTo(rainTotalM3, 6);
    expect(result.evaporatedM3).toBeCloseTo(evapTotalM3, 6);
    expect(result.surfaceAfterM3).toBeCloseTo(rainTotalM3 - evapTotalM3, 6);
  });

  it("extreme storm: donor cap bounds every substep flux and never overdraws storage", () => {
    const width = 8;
    const elevation = Array.from({ length: width * 2 }, (_, i) => 100 - (i % width));
    const state = new SpatialWaterState(makeGrid(width, 2, elevation), BASE_OPTIONS);
    const donor = 6; // second-to-last column drains to the last column
    state.channelM3[donor] = 1e9;
    const routed = computeD8Fluxes(state, 86400);
    expect(routed.fluxByCellM3[donor]).toBeLessThanOrEqual(0.25 * 1e9 + 1e-9);
    expect(routed.fluxByCellM3[donor]).toBeGreaterThan(0);
    state.assertHealthy();
  });

  it("reverse cell iteration does not change any numeric state array", () => {
    const elevation = Array.from({ length: 16 }, (_, i) => 20 - (i % 4));
    const forward = new SpatialWaterState(makeGrid(4, 4, elevation), BASE_OPTIONS);
    const reverse = new SpatialWaterState(makeGrid(4, 4, elevation), { ...BASE_OPTIONS, iterationOrder: "reverse" });
    const forcingInput = forcing(16, 1e6, 1e5);
    stepSpatialWaterCycle(forward, inventory(), forcingInput, 86400);
    stepSpatialWaterCycle(reverse, inventory(), forcingInput, 86400);
    expect(Array.from(reverse.soilM3)).toEqual(Array.from(forward.soilM3));
    expect(Array.from(reverse.channelM3)).toEqual(Array.from(forward.channelM3));
    expect(Array.from(reverse.lakeM3)).toEqual(Array.from(forward.lakeM3));
  });

  it("serialization round-trip produces identical state after another step", () => {
    const elevation = Array.from({ length: 16 }, (_, i) => 20 - (i % 4));
    const state = new SpatialWaterState(makeGrid(4, 4, elevation), BASE_OPTIONS);
    const forcingInput = forcing(16, 1e6, 1e5);
    const inv1 = inventory();
    stepSpatialWaterCycle(state, inv1, forcingInput, 86400);
    const restored = SpatialWaterState.fromJSON(JSON.parse(JSON.stringify(state.toJSON())));
    const inv2 = { ...inv1 };
    stepSpatialWaterCycle(state, inv1, forcingInput, 86400);
    stepSpatialWaterCycle(restored, inv2, forcingInput, 86400);
    expect(Array.from(restored.soilM3)).toEqual(Array.from(state.soilM3));
    expect(Array.from(restored.channelM3)).toEqual(Array.from(state.channelM3));
    expect(Array.from(restored.lakeM3)).toEqual(Array.from(state.lakeM3));
    expect(inv2).toEqual(inv1);
  });

  it("inventory coupling conserves water across 20 steps within 1e-10", () => {
    const elevation = Array.from({ length: 16 }, (_, i) => 20 - (i % 4));
    const state = new SpatialWaterState(makeGrid(4, 4, elevation), BASE_OPTIONS);
    const inv = inventory(1e8, 1e8);
    const rho = PLANET_UNITS.waterDensityKgM3;
    const forcingInput = forcing(16, 1e3, 4e2);
    const totalBeforeKg = totalSpatialWaterM3(state) * rho + inv.vaporMassKg + inv.oceanMassKg;
    for (let i = 0; i < 20; i += 1) stepSpatialWaterCycle(state, inv, forcingInput, 86400);
    const totalAfterKg = totalSpatialWaterM3(state) * rho + inv.vaporMassKg + inv.oceanMassKg;
    expect(Math.abs(totalAfterKg - totalBeforeKg) / totalBeforeKg).toBeLessThan(1e-10);
  });
});
