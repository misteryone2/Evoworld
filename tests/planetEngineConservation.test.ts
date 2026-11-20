import { describe, expect, it } from "vitest";
import { createEarthLikeConfig } from "../simulation/planetEngine/core/PlanetCore";
import { buildElevationGrid } from "../simulation/planetEngine/surface/Hypsometry";
import {
  EROSION_VOLUME_TOLERANCE_RELATIVE,
  erodeAndDeposit,
} from "../simulation/planetEngine/geology/SurfaceEvolution";
import type { ElevationGrid } from "../simulation/planetEngine/contracts";

type ConfigOverrides = Parameters<typeof createEarthLikeConfig>[0];

interface CycleOptions {
  scenario: string;
  size: number;
  cycles: number;
  seed?: number;
  overrides?: ConfigOverrides;
  deltaSFor?: (cycle: number) => number;
  waterFactorFor?: (cycle: number, grid: ElevationGrid) => Float32Array | undefined;
}

interface CycleStats {
  scenario: string;
  size: number;
  cycles: number;
  initialVolumeM3: number;
  finalTransportVolumeM3: number;
  finalPublicVolumeM3: number;
  cumulativeTransferredM3: number;
  cumulativeDepositedM3: number;
  maxStepBalanceM3: number;
  maxQuantizationResidualM3: number;
  toleranceBudgetM3: number;
  worstToleranceRatio: number;
  absoluteDriftM3: number;
  relativeDrift: number;
  spatialMismatches: number;
}

function volumeM3(elevation: Float64Array | Float32Array, areas: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < elevation.length; i += 1) sum += elevation[i] * areas[i];
  return sum;
}

function runCycles(options: CycleOptions): CycleStats {
  const config = createEarthLikeConfig({
    ...(options.overrides ?? {}),
    seed: options.seed ?? options.overrides?.seed ?? 7,
    surface: {
      gridWidth: options.size,
      gridHeight: options.size,
      ...(options.overrides?.surface ?? {}),
    },
  });
  let grid: ElevationGrid = buildElevationGrid(config);
  const transport = grid.transportElevationM;
  expect(transport).toBeDefined();

  const initialVolumeM3 = volumeM3(transport!, grid.cellAreasM2);
  let cumulativeTransferredM3 = 0;
  let cumulativeDepositedM3 = 0;
  let toleranceBudgetM3 = 0;
  let maxStepBalanceM3 = 0;
  let maxQuantizationResidualM3 = 0;
  let worstToleranceRatio = 0;
  let spatialMismatches = 0;

  for (let cycle = 0; cycle < options.cycles; cycle += 1) {
    const deltaS = options.deltaSFor?.(cycle) ?? 86400;
    const waterFactor = options.waterFactorFor?.(cycle, grid);
    const result = erodeAndDeposit(config, grid, deltaS, waterFactor);
    expect(Math.abs(result.transportVolumeBalanceM3)).toBeLessThanOrEqual(result.transportVolumeToleranceM3);
    expect(result.erodedVolumeM3).toBeCloseTo(result.depositedVolumeM3, 6);
    // The published grid is exactly the Float32 cast of the transport state:
    // no artificial spatial correction is applied. Count, then assert once.
    for (let i = 0; i < result.elevationM.length; i += 1) {
      if (result.elevationM[i] !== Math.fround(result.transportElevationM[i])) spatialMismatches += 1;
    }
    maxStepBalanceM3 = Math.max(maxStepBalanceM3, Math.abs(result.transportVolumeBalanceM3));
    maxQuantizationResidualM3 = Math.max(maxQuantizationResidualM3, Math.abs(result.quantizationResidualM3));
    worstToleranceRatio = Math.max(
      worstToleranceRatio,
      Math.abs(result.transportVolumeBalanceM3) / result.transportVolumeToleranceM3,
    );
    toleranceBudgetM3 += result.transportVolumeToleranceM3;
    cumulativeTransferredM3 += result.erodedVolumeM3;
    cumulativeDepositedM3 += result.depositedVolumeM3;
    grid = {
      ...grid,
      elevationM: result.elevationM,
      transportElevationM: result.transportElevationM,
    };
  }

  const finalTransportVolumeM3 = volumeM3(grid.transportElevationM!, grid.cellAreasM2);
  const finalPublicVolumeM3 = volumeM3(grid.elevationM, grid.cellAreasM2);
  const absoluteDriftM3 = finalTransportVolumeM3 - initialVolumeM3;
  return {
    scenario: options.scenario,
    size: options.size,
    cycles: options.cycles,
    initialVolumeM3,
    finalTransportVolumeM3,
    finalPublicVolumeM3,
    cumulativeTransferredM3,
    cumulativeDepositedM3,
    maxStepBalanceM3,
    maxQuantizationResidualM3,
    toleranceBudgetM3,
    worstToleranceRatio,
    absoluteDriftM3,
    relativeDrift: Math.abs(absoluteDriftM3) / Math.max(Math.abs(initialVolumeM3), cumulativeTransferredM3, 1),
    spatialMismatches,
  };
}

function assertConserved(stats: CycleStats): void {
  expect(stats.spatialMismatches).toBe(0);
  expect(stats.worstToleranceRatio).toBeLessThanOrEqual(1);
  // Each step is within its own scale-based tolerance, so the accumulated drift
  // must stay within the sum of those budgets.
  expect(Math.abs(stats.absoluteDriftM3)).toBeLessThanOrEqual(stats.toleranceBudgetM3);
  expect(stats.relativeDrift).toBeLessThan(1e-8);
  expect(Math.abs(stats.cumulativeTransferredM3 - stats.cumulativeDepositedM3))
    .toBeLessThanOrEqual(stats.toleranceBudgetM3);
}

describe("P2 — cumulative surface-volume conservation", () => {
  it("declares an explicit scale-based tolerance for double-precision transport", () => {
    expect(EROSION_VOLUME_TOLERANCE_RELATIVE).toBe(1e-12);
    const small = createEarthLikeConfig({ surface: { gridWidth: 32, gridHeight: 32 } });
    const large = createEarthLikeConfig({ surface: { gridWidth: 64, gridHeight: 64 } });
    const smallResult = erodeAndDeposit(small, buildElevationGrid(small), 86400);
    const largeResult = erodeAndDeposit(large, buildElevationGrid(large), 86400);
    expect(smallResult.transportVolumeToleranceM3).toBeGreaterThan(1);
    expect(smallResult.transportVolumeToleranceM3).toBeCloseTo(
      Math.abs(smallResult.sourceVolumeM3) * EROSION_VOLUME_TOLERANCE_RELATIVE,
      6,
    );
    // The tolerance grows with transported volume and integrated baseline, not
    // with arbitrary grid constants.
    expect(largeResult.transportVolumeToleranceM3).toBeGreaterThan(smallResult.transportVolumeToleranceM3);
    expect(largeResult.quantizationResidualM3).not.toBe(0);
    expect(largeResult.publicGridVolumeM3).toBeCloseTo(
      largeResult.transportVolumeM3 + largeResult.quantizationResidualM3,
      6,
    );
  });

  it("keeps transport drift bounded over 200 erosion cycles (32x32)", () => {
    const stats = runCycles({ scenario: "earth-200", size: 32, cycles: 200 });
    assertConserved(stats);
    // The Float32 diagnostic drift stays inside the per-step quantization
    // envelope; it is carried by the transport state, not lost.
    expect(Math.abs(stats.finalPublicVolumeM3 - stats.initialVolumeM3))
      .toBeLessThan(stats.maxQuantizationResidualM3 * 2);
  });

  it("scales the same invariants to 64x64 over 200 cycles", () => {
    const stats = runCycles({ scenario: "earth-200-64", size: 64, cycles: 200 });
    assertConserved(stats);
    expect(Math.abs(stats.finalPublicVolumeM3 - stats.initialVolumeM3))
      .toBeLessThan(stats.maxQuantizationResidualM3 * 2);
  });

  it("reports single, 100, 1000 and mixed-cycle conservation", () => {
    const mixedFactors = (cycle: number, grid: ElevationGrid): Float32Array => {
      const factor = new Float32Array(grid.elevationM.length);
      for (let i = 0; i < factor.length; i += 1) {
        factor[i] = ((i + cycle) % 3 === 0) ? 0 : ((i + cycle) % 3 === 1 ? 1 : 2);
      }
      return factor;
    };
    const durations = [3600, 86400, 604800];

    const stats = [
      runCycles({ scenario: "single", size: 32, cycles: 1 }),
      runCycles({ scenario: "earth-100", size: 32, cycles: 100 }),
      runCycles({ scenario: "earth-1000", size: 32, cycles: 1000 }),
      runCycles({
        scenario: "mixed-100",
        size: 64,
        cycles: 100,
        seed: 11,
        overrides: {
          surface: { roughnessM: 3500, meanElevationM: 1200, oceanFloorDepthM: 5000 },
          hydrosphere: { totalWaterKg: 1.1e21 },
          interior: { radiogenicHeatW: 3.0e13 },
        },
        deltaSFor: (cycle) => durations[cycle % durations.length],
        waterFactorFor: mixedFactors,
      }),
    ];

    console.table(stats.map((row) => ({
      scenario: row.scenario,
      grid: `${row.size}x${row.size}`,
      cycles: row.cycles,
      initial_m3: row.initialVolumeM3.toExponential(6),
      final_transport_m3: row.finalTransportVolumeM3.toExponential(6),
      transferred_m3: row.cumulativeTransferredM3.toExponential(6),
      residual_m3: row.maxQuantizationResidualM3.toExponential(6),
      abs_drift_m3: row.absoluteDriftM3.toExponential(6),
      rel_drift: row.relativeDrift.toExponential(6),
      tolerance_m3: row.toleranceBudgetM3.toExponential(6),
    })));
    console.log(`PLANET_ENGINE_CONSERVATION_JSON=${JSON.stringify(stats)}`);
    for (const row of stats) assertConserved(row);
  });
});
