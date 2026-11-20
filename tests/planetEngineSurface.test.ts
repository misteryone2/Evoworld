import { describe, expect, it } from "vitest";
import { createEarthLikeConfig } from "../simulation/planetEngine/core/PlanetCore";
import { PlanetEngine } from "../simulation/planetEngine/runtime/PlanetEngine";
import {
  buildElevationGrid,
  elevationAtM,
  solveSeaLevelM,
} from "../simulation/planetEngine/surface/Hypsometry";
import { erodeAndDeposit } from "../simulation/planetEngine/geology/SurfaceEvolution";
import { PLANET_UNITS } from "../simulation/planetEngine/units";

const SMALL_SURFACE = { gridWidth: 48, gridHeight: 48 };

describe("M2 — physical surface and hypsometry", () => {
  it("solves sea level from the water inventory instead of a water threshold", () => {
    const config = createEarthLikeConfig({ surface: SMALL_SURFACE });
    const engine = new PlanetEngine(config);
    const grid = buildElevationGrid(config);
    const field = engine.getSurfaceField();
    const volumeM3 = engine.getState().hydrosphere.oceanMassKg / PLANET_UNITS.waterDensityKgM3;

    expect(field.seaLevelM).toBeCloseTo(solveSeaLevelM(grid, volumeM3), 5);
    expect(field.seaLevelM).toBeGreaterThan(grid.minM);
    expect(field.seaLevelM).toBeLessThan(grid.maxM);
    // Ocean fraction is now area-weighted, so its numeric range differs from
    // the old cell-count ratio. Assert the mixed surface directly instead.
    expect(field.oceanFraction).toBeGreaterThan(0.01);
    expect(field.oceanFraction).toBeLessThan(0.99);
    expect(field.oceanMask.some((value) => value === 1)).toBe(true);
    expect(field.oceanMask.some((value) => value === 0)).toBe(true);
    expect(field.oceanMask.length).toBe(SMALL_SURFACE.gridWidth * SMALL_SURFACE.gridHeight);
  });

  it("raises sea level and ocean fraction when the water inventory grows", () => {
    const dry = new PlanetEngine(createEarthLikeConfig({
      surface: SMALL_SURFACE,
      hydrosphere: { totalWaterKg: 1e19 },
    }));
    const wet = new PlanetEngine(createEarthLikeConfig({
      surface: SMALL_SURFACE,
      hydrosphere: { totalWaterKg: 1.4e21 },
    }));

    const dryField = dry.getSurfaceField();
    const wetField = wet.getSurfaceField();
    expect(wetField.seaLevelM).toBeGreaterThan(dryField.seaLevelM);
    expect(wetField.oceanFraction).toBeGreaterThan(dryField.oceanFraction);
  });

  it("produces chunk-independent coastlines from a pure seeded field", () => {
    const config = createEarthLikeConfig({ surface: SMALL_SURFACE });
    const points: Array<[number, number]> = [
      [0, 0], [7, 3], [23, 11], [41, 29], [5, 47], [31, 17], [47, 47],
    ];
    const forward = points.map(([x, y]) => elevationAtM(config, x, y));
    const backward = [...points].reverse().map(([x, y]) => elevationAtM(config, x, y)).reverse();
    expect(forward).toEqual(backward);

    const a = new PlanetEngine(config).getSurfaceField();
    const b = new PlanetEngine(config).getSurfaceField();
    expect(Array.from(a.oceanMask)).toEqual(Array.from(b.oceanMask));
    expect(Array.from(a.coastlineMask)).toEqual(Array.from(b.coastlineMask));
  });

  it("conserves crustal mass during erosion and deposition", () => {
    const config = createEarthLikeConfig({ surface: SMALL_SURFACE });
    const grid = buildElevationGrid(config);
    const result = erodeAndDeposit(config, grid, PLANET_UNITS.secondsPerEarthDay);

    const weightedDeltaM = result.deltaM.reduce(
      (sum, value, index) => sum + grid.cellAreasM2[index] * value,
      0,
    );
    const totalAbsoluteVolumeM3 = result.deltaM.reduce(
      (sum, value, index) => sum + grid.cellAreasM2[index] * Math.abs(value),
      0,
    );
    expect(result.erodedMassKg).toBeGreaterThan(0);
    expect(Math.abs(result.volumeBalanceM3)).toBeLessThan(1e-12 * result.erodedVolumeM3);
    expect(Math.abs(result.erodedMassKg - result.depositedMassKg) / result.erodedMassKg).toBeLessThan(1e-12);
    // Float32 elevation serialization leaves a tiny residual; the exact
    // double-precision transport balance is asserted above.
    expect(Math.abs(weightedDeltaM)).toBeLessThan(totalAbsoluteVolumeM3 * 1e-4);
    expect(result.elevationM).not.toBe(grid.elevationM);
  });

  it("evolves interior heat and surface deterministically", () => {
    const config = createEarthLikeConfig({ surface: SMALL_SURFACE });
    const a = new PlanetEngine(config);
    const b = new PlanetEngine(config);
    const initialHeatJ = a.getState().interior.heatJ;

    const fieldA = a.stepGeology(PLANET_UNITS.secondsPerEarthDay);
    const fieldB = b.stepGeology(PLANET_UNITS.secondsPerEarthDay);

    expect(a.getState().interior.heatJ).toBeLessThan(initialHeatJ);
    expect(a.getState().interior.tectonicStress).toBeGreaterThanOrEqual(0);
    expect(a.getState()).toEqual(b.getState());
    expect(Array.from(fieldA.elevationM)).toEqual(Array.from(fieldB.elevationM));
    expect(fieldA.seaLevelM).toBeCloseTo(fieldB.seaLevelM, 9);
  });
});
