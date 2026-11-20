import { describe, expect, it } from "vitest";
import { createEarthLikeConfig } from "../simulation/planetEngine/core/PlanetCore";
import { buildElevationGrid } from "../simulation/planetEngine/surface/Hypsometry";
import {
  EROSION_VOLUME_TOLERANCE_RELATIVE,
  erodeAndDeposit,
} from "../simulation/planetEngine/geology/SurfaceEvolution";
import type { ElevationGrid } from "../simulation/planetEngine/contracts";

function volumeM3(elevation: Float64Array | Float32Array, areas: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < elevation.length; i += 1) sum += elevation[i] * areas[i];
  return sum;
}

function runCycles(size: number, cycles: number) {
  const config = createEarthLikeConfig({ surface: { gridWidth: size, gridHeight: size } });
  let grid: ElevationGrid = buildElevationGrid(config);
  const transport = grid.transportElevationM;
  expect(transport).toBeDefined();
  const initialVolumeM3 = volumeM3(transport!, grid.cellAreasM2);
  let cumulativeErodedM3 = 0;
  let maxBalanceM3 = 0;
  let maxResidualM3 = 0;
  let worstToleranceRatio = 0;
  let spatialMismatches = 0;

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const result = erodeAndDeposit(config, grid, 86400);
    expect(Math.abs(result.transportVolumeBalanceM3)).toBeLessThanOrEqual(result.transportVolumeToleranceM3);
    // The published grid is exactly the Float32 cast of the transport state:
    // no artificial spatial correction is applied. Count, then assert once.
    for (let i = 0; i < result.elevationM.length; i += 1) {
      if (result.elevationM[i] !== Math.fround(result.transportElevationM[i])) spatialMismatches += 1;
    }
    maxBalanceM3 = Math.max(maxBalanceM3, Math.abs(result.transportVolumeBalanceM3));
    maxResidualM3 = Math.max(maxResidualM3, Math.abs(result.quantizationResidualM3));
    worstToleranceRatio = Math.max(
      worstToleranceRatio,
      Math.abs(result.transportVolumeBalanceM3) / result.transportVolumeToleranceM3,
    );
    cumulativeErodedM3 += result.erodedVolumeM3;
    grid = {
      ...grid,
      elevationM: result.elevationM,
      transportElevationM: result.transportElevationM,
    };
  }

  const finalTransportVolumeM3 = volumeM3(grid.transportElevationM!, grid.cellAreasM2);
  const finalPublicVolumeM3 = volumeM3(grid.elevationM, grid.cellAreasM2);
  return {
    initialVolumeM3,
    finalTransportVolumeM3,
    finalPublicVolumeM3,
    cumulativeErodedM3,
    maxBalanceM3,
    maxResidualM3,
    worstToleranceRatio,
    transportDriftM3: finalTransportVolumeM3 - initialVolumeM3,
    publicDriftM3: finalPublicVolumeM3 - initialVolumeM3,
    spatialMismatches,
  };
}

describe("P2 — cumulative surface-volume conservation", () => {
  it("declares an explicit tolerance for double-precision transport", () => {
    expect(EROSION_VOLUME_TOLERANCE_RELATIVE).toBe(1e-12);
    const config = createEarthLikeConfig({ surface: { gridWidth: 32, gridHeight: 32 } });
    const result = erodeAndDeposit(config, buildElevationGrid(config), 86400);
    expect(result.transportVolumeToleranceM3).toBeGreaterThan(1);
    expect(result.transportVolumeToleranceM3).toBeCloseTo(
      Math.abs(result.sourceVolumeM3) * EROSION_VOLUME_TOLERANCE_RELATIVE,
      6,
    );
    expect(result.quantizationResidualM3).not.toBe(0);
    expect(result.publicGridVolumeM3).toBeCloseTo(result.transportVolumeM3 + result.quantizationResidualM3, 6);
  });

  it("keeps transport drift bounded over 200 erosion cycles (32x32)", () => {
    const stats = runCycles(32, 200);
    expect(stats.spatialMismatches).toBe(0);
    expect(stats.worstToleranceRatio).toBeLessThanOrEqual(1);
    // Measured drift is floating-point roundoff, not accumulated mass loss.
    expect(Math.abs(stats.transportDriftM3) / stats.cumulativeErodedM3).toBeLessThan(1e-8);
    // The Float32 diagnostic drift stays within the one-step quantization
    // envelope; it is carried by the transport state, not lost.
    expect(Math.abs(stats.publicDriftM3)).toBeLessThan(stats.maxResidualM3 * 2);
  });

  it("scales the same invariants to 64x64 over 200 cycles", () => {
    const stats = runCycles(64, 200);
    expect(stats.spatialMismatches).toBe(0);
    expect(stats.worstToleranceRatio).toBeLessThanOrEqual(1);
    expect(Math.abs(stats.transportDriftM3) / stats.cumulativeErodedM3).toBeLessThan(1e-8);
    expect(Math.abs(stats.publicDriftM3)).toBeLessThan(stats.maxResidualM3 * 2);
  });
});
