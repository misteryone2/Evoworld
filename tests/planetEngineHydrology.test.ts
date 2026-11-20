import { describe, expect, it } from "vitest";
import { createEarthLikeConfig } from "../simulation/planetEngine/core/PlanetCore";
import { PlanetEngine } from "../simulation/planetEngine/runtime/PlanetEngine";
import { buildElevationGrid } from "../simulation/planetEngine/surface/Hypsometry";
import { applyWaterFluxes, totalWaterInventoryKg } from "../simulation/planetEngine/hydrology/Inventory";
import { computeRiverFlow } from "../simulation/planetEngine/hydrology/Drainage";
import { PLANET_UNITS } from "../simulation/planetEngine/units";

const SMALL_SURFACE = { gridWidth: 48, gridHeight: 48 };

function expectFiniteArray(array: Float32Array): void {
  for (let i = 0; i < array.length; i += 1) expect(Number.isFinite(array[i])).toBe(true);
}

describe("M3 — hydrology", () => {
  it("closes the inventory balance for evaporation, precipitation and runoff", () => {
    const engine = new PlanetEngine(createEarthLikeConfig({ surface: SMALL_SURFACE }));
    const state = engine.getState();
    const before = totalWaterInventoryKg(state);
    const vaporBefore = state.hydrosphere.vaporMassKg;

    const applied = applyWaterFluxes(state, {
      evaporationKg: 1e12,
      precipitationKg: 8e11,
      runoffKg: 1e11,
    });

    expect(Math.abs(applied.totalAfterKg - before) / before).toBeLessThan(1e-12);
    expect(state.hydrosphere.vaporMassKg).toBeCloseTo(vaporBefore + 2e11, 3);
    expect(applied.runoffKg).toBeGreaterThanOrEqual(0);
  });

  it("produces a deterministic D8 drainage field with ocean sinks", () => {
    const config = createEarthLikeConfig({ surface: SMALL_SURFACE });
    const grid = buildElevationGrid(config);
    const seaLevelM = (grid.minM + grid.maxM) / 2;
    const oceanMask = new Uint8Array(grid.elevationM.length);
    for (let i = 0; i < oceanMask.length; i += 1) oceanMask[i] = grid.elevationM[i] < seaLevelM ? 1 : 0;
    const precipitation = new Float32Array(grid.elevationM.length).fill(1);

    const a = computeRiverFlow(grid, precipitation, oceanMask);
    const b = computeRiverFlow(grid, precipitation, oceanMask);
    expect(Array.from(a)).toEqual(Array.from(b));
    expectFiniteArray(a);
    for (let i = 0; i < oceanMask.length; i += 1) {
      if (oceanMask[i] === 1) expect(a[i]).toBe(0);
      else expect(a[i]).toBeGreaterThan(0);
    }
  });

  it("evolves the full climate-hydrology chain without creating or losing water", () => {
    const engine = new PlanetEngine(createEarthLikeConfig({ surface: SMALL_SURFACE }));
    const before = engine.totalWaterKg();
    const field = engine.stepClimateHydrology(PLANET_UNITS.secondsPerEarthDay);
    const after = engine.totalWaterKg();

    expect(Math.abs(after - before) / before).toBeLessThan(1e-12);
    expectFiniteArray(field.precipitationMPerYear);
    expectFiniteArray(field.evaporationMPerYear);
    expectFiniteArray(field.runoffMPerYear);
    expectFiniteArray(field.riverFlow);
    expect(field.precipitationMPerYear.some((value) => value > 0)).toBe(true);
    expect(field.evaporationMPerYear.some((value) => value > 0)).toBe(true);
    expect(Number.isFinite(engine.getSurfaceField().seaLevelM)).toBe(true);
  });

  it("keeps repeated water-cycle steps deterministic", () => {
    const config = createEarthLikeConfig({ surface: SMALL_SURFACE });
    const a = new PlanetEngine(config);
    const b = new PlanetEngine(config);
    for (let i = 0; i < 3; i += 1) {
      const fieldA = a.stepClimateHydrology(PLANET_UNITS.secondsPerEarthDay);
      const fieldB = b.stepClimateHydrology(PLANET_UNITS.secondsPerEarthDay);
      expect(Array.from(fieldA.precipitationMPerYear)).toEqual(Array.from(fieldB.precipitationMPerYear));
    }
    expect(a.getState()).toEqual(b.getState());
  });
});
