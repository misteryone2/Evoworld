import { describe, expect, it } from "vitest";
import { createEarthLikeConfig, orbitalPeriodS } from "../simulation/planetEngine/core/PlanetCore";
import type { ClimateField, PlanetSchedulerConfig } from "../simulation/planetEngine/contracts";
import { PlanetEngine } from "../simulation/planetEngine/runtime/PlanetEngine";

const SMALL_SURFACE = { gridWidth: 16, gridHeight: 16 };
const STEP_S = 10 * 86400;

function makeEngine(climateIntervalTicks: number): PlanetEngine {
  const scheduler: PlanetSchedulerConfig = {
    climateIntervalTicks,
    hydrologyIntervalTicks: 1000,
    geologyIntervalTicks: 1000,
  };
  return new PlanetEngine(createEarthLikeConfig({ seed: 7, surface: SMALL_SURFACE, scheduler }));
}

function signature(field: ClimateField): number[] {
  return Array.from(field.temperatureK);
}

describe("P1 — climate scheduler cache isolation", () => {
  it("climateIntervalTicks = 1 recomputes exactly once per tick", () => {
    const engine = makeEngine(1);
    // Construction already committed tick-0 biome memory, which built the
    // initial climate field once. All assertions below are relative to it.
    const initialCount = engine.getRuntimeDiagnostics().climateUpdateCount;
    expect(initialCount).toBeGreaterThan(0);

    engine.getClimateField();
    expect(engine.getRuntimeDiagnostics().climateUpdateCount).toBe(initialCount);

    // Repeated reads must not recompute the field.
    engine.getClimateField();
    engine.getClimateField();
    expect(engine.getRuntimeDiagnostics().climateUpdateCount).toBe(initialCount);

    for (let tick = 1; tick <= 3; tick += 1) {
      engine.step(STEP_S);
      expect(engine.getRuntimeDiagnostics().climateUpdateCount).toBe(initialCount + tick);
      expect(engine.getState().scheduler.lastClimateTick).toBe(tick);
    }
    expect(engine.getRuntimeDiagnostics().stateRevision).toBe(3);
  });

  it("climateIntervalTicks = 2 preserves the field between updates", () => {
    const engine = makeEngine(2);
    const before = signature(engine.getClimateField());
    const countAfterFirstRead = engine.getRuntimeDiagnostics().climateUpdateCount;

    engine.step(STEP_S);
    expect(engine.getState().tick).toBe(1);
    expect(signature(engine.getClimateField())).toEqual(before);
    expect(engine.getRuntimeDiagnostics().climateUpdateCount).toBe(countAfterFirstRead);
    expect(engine.getState().scheduler.lastClimateTick).toBe(0);
    expect(engine.getState().scheduler.pendingClimateS).toBe(STEP_S);

    const snapshotBefore = engine.getRuntimeDiagnostics();
    engine.step(STEP_S);
    expect(engine.getState().tick).toBe(2);
    const updated = signature(engine.getClimateField());
    expect(updated).not.toEqual(before);
    expect(engine.getRuntimeDiagnostics().climateUpdateCount).toBe(snapshotBefore.climateUpdateCount + 1);
    expect(engine.getRuntimeDiagnostics().climateRevision).toBe(snapshotBefore.climateRevision + 1);
    expect(engine.getState().scheduler.lastClimateTick).toBe(2);
    expect(engine.getState().scheduler.pendingClimateS).toBe(0);

    engine.step(STEP_S);
    expect(signature(engine.getClimateField())).toEqual(updated);
    expect(engine.getRuntimeDiagnostics().climateUpdateCount).toBe(snapshotBefore.climateUpdateCount + 1);
  });

  it("climateIntervalTicks > 2 schedules only every Nth tick", () => {
    const interval = 4;
    const engine = makeEngine(interval);
    engine.getClimateField();
    const baseline = engine.getRuntimeDiagnostics();

    for (let tick = 1; tick <= 9; tick += 1) {
      engine.step(STEP_S);
      const due = tick % interval === 0;
      expect(engine.getRuntimeDiagnostics().climateUpdateCount).toBe(
        baseline.climateUpdateCount + Math.floor(tick / interval),
      );
      expect(engine.getRuntimeDiagnostics().climateRevision).toBe(
        baseline.climateRevision + Math.floor(tick / interval),
      );
      expect(engine.getState().scheduler.lastClimateTick).toBe(tick - (tick % interval));
      expect(engine.getState().scheduler.pendingClimateS).toBe((tick % interval) * STEP_S);
      if (!due) {
        // No extra recomputation happened on this tick.
        expect(engine.getRuntimeDiagnostics().climateUpdateCount).toBe(
          baseline.climateUpdateCount + Math.floor((tick - 1) / interval),
        );
      }
    }
    expect(engine.getRuntimeDiagnostics().climateUpdateCount).toBe(baseline.climateUpdateCount + 2);
  });

  it("a scheduled refresh uses the tick and time it is published for", () => {
    const engine = makeEngine(1);
    const config = engine.getConfig();
    const halfYear = orbitalPeriodS(config) / 2;

    engine.step(halfYear);
    const field = engine.getClimateField();
    expect(engine.snapshot().timeS).toBeCloseTo(halfYear, 6);
    expect(field.season).toBe("inverno");

    // The refresh already happened inside step(); reading again is free.
    const count = engine.getRuntimeDiagnostics().climateUpdateCount;
    engine.getClimateField();
    engine.environmentSnapshot();
    expect(engine.getRuntimeDiagnostics().climateUpdateCount).toBe(count);
    expect(engine.environmentSnapshot().timeS).toBeCloseTo(halfYear, 6);
  });

  it("water and geology changes do not invalidate the climate cache", () => {
    const scheduler: PlanetSchedulerConfig = {
      climateIntervalTicks: 100,
      hydrologyIntervalTicks: 1,
      geologyIntervalTicks: 1,
    };
    const engine = new PlanetEngine(createEarthLikeConfig({
      seed: 7,
      surface: SMALL_SURFACE,
      scheduler,
    }));
    engine.getClimateField();
    const baseline = engine.getRuntimeDiagnostics();

    engine.step(STEP_S);
    const after = engine.getRuntimeDiagnostics();
    expect(after.stateRevision).toBeGreaterThan(baseline.stateRevision);
    expect(after.surfaceRevision).toBe(baseline.surfaceRevision + 1);
    expect(after.hydrologyRevision).toBe(baseline.hydrologyRevision + 1);
    expect(after.geologyRevision).toBe(baseline.geologyRevision + 1);
    expect(after.climateRevision).toBe(baseline.climateRevision);
    expect(after.climateUpdateCount).toBe(baseline.climateUpdateCount);
    expect(engine.getState().scheduler.lastHydrologyTick).toBe(1);
    expect(engine.getState().scheduler.lastGeologyTick).toBe(1);
  });

  it("climateIntervalTicks = 5 forces exactly one scheduled refresh on the fifth tick", () => {
    const engine = makeEngine(5);
    const before = signature(engine.getClimateField());
    const baseline = engine.getRuntimeDiagnostics();
    expect(baseline.climateRefreshCounts.initial).toBe(1);

    for (let tick = 1; tick <= 4; tick += 1) {
      engine.step(STEP_S);
      expect(engine.getRuntimeDiagnostics().climateUpdateCount).toBe(baseline.climateUpdateCount);
      expect(engine.getRuntimeDiagnostics().climateRevision).toBe(baseline.climateRevision);
      expect(signature(engine.getClimateField())).toEqual(before);
      expect(engine.getState().scheduler.lastClimateTick).toBe(0);
      expect(engine.getState().scheduler.pendingClimateS).toBe(tick * STEP_S);
      expect(engine.snapshot().timeS).toBeCloseTo(tick * STEP_S, 6);
    }

    engine.step(STEP_S);
    const after = engine.getRuntimeDiagnostics();
    expect(after.climateUpdateCount).toBe(baseline.climateUpdateCount + 1);
    expect(after.climateRevision).toBe(baseline.climateRevision + 1);
    expect(after.climateRefreshCounts.scheduled).toBe(baseline.climateRefreshCounts.scheduled + 1);
    expect(after.lastClimateRefreshReason).toBe("scheduled");
    expect(signature(engine.getClimateField())).not.toEqual(before);
    expect(engine.getState().scheduler.lastClimateTick).toBe(5);
    expect(engine.getState().scheduler.pendingClimateS).toBe(0);
    expect(engine.snapshot().tick).toBe(5);
    expect(engine.snapshot().timeS).toBeCloseTo(5 * STEP_S, 6);

    // Reading a fresh cache never recomputes or changes diagnostics.
    const stable = engine.getRuntimeDiagnostics();
    engine.getClimateField();
    engine.getClimateField();
    expect(engine.getRuntimeDiagnostics()).toEqual(stable);
  });

  it("records forced, manual and seek invalidations without moving the clock", () => {
    const engine = makeEngine(100);
    engine.getClimateField();
    const baseline = engine.getRuntimeDiagnostics();

    const manual = engine.refreshClimateField();
    expect(manual.temperatureK).toBeInstanceOf(Float32Array);
    const afterManual = engine.getRuntimeDiagnostics();
    expect(afterManual.climateUpdateCount).toBe(baseline.climateUpdateCount + 1);
    expect(afterManual.climateRevision).toBe(baseline.climateRevision + 1);
    expect(afterManual.climateRefreshCounts.manual).toBe(baseline.climateRefreshCounts.manual + 1);
    expect(afterManual.lastClimateRefreshReason).toBe("manual");
    expect(afterManual.stateRevision).toBe(baseline.stateRevision);
    expect(engine.getState().tick).toBe(0);
    expect(engine.getState().timeS).toBe(0);

    engine.stepClimateHydrology(STEP_S);
    const afterWater = engine.getRuntimeDiagnostics();
    expect(afterWater.climateUpdateCount).toBe(afterManual.climateUpdateCount + 1);
    expect(afterWater.climateRevision).toBe(afterManual.climateRevision + 1);
    expect(afterWater.climateRefreshCounts.forced).toBe(afterManual.climateRefreshCounts.forced + 1);
    expect(afterWater.lastClimateRefreshReason).toBe("forced");
    expect(afterWater.hydrologyRevision).toBe(afterManual.hydrologyRevision + 1);
    expect(afterWater.stateRevision).toBeGreaterThan(afterManual.stateRevision);
    expect(engine.getState().tick).toBe(0);
    expect(engine.getState().timeS).toBe(0);

    engine.stepGeology(STEP_S);
    const afterGeology = engine.getRuntimeDiagnostics();
    expect(afterGeology.climateUpdateCount).toBe(afterWater.climateUpdateCount + 1);
    expect(afterGeology.climateRefreshCounts.forced).toBe(afterWater.climateRefreshCounts.forced + 1);
    expect(afterGeology.lastClimateRefreshReason).toBe("forced");
    expect(afterGeology.geologyRevision).toBe(afterWater.geologyRevision + 1);
    expect(afterGeology.surfaceRevision).toBe(afterWater.surfaceRevision + 1);
    expect(engine.getState().tick).toBe(0);
    expect(engine.getState().timeS).toBe(0);

    engine.seek(123, 456);
    const afterSeek = engine.getRuntimeDiagnostics();
    expect(afterSeek.climateUpdateCount).toBe(afterGeology.climateUpdateCount + 1);
    expect(afterSeek.climateRefreshCounts.seek).toBe(afterGeology.climateRefreshCounts.seek + 1);
    expect(afterSeek.lastClimateRefreshReason).toBe("seek");
    expect(engine.getState().tick).toBe(123);
    expect(engine.getState().timeS).toBe(456);
  });

  it("keeps field reads observationally pure and deterministic", () => {
    const readEveryTick = makeEngine(5);
    const readAtEnd = makeEngine(5);
    const signaturesEveryTick: number[][] = [];

    for (let tick = 1; tick <= 11; tick += 1) {
      readEveryTick.step(STEP_S);
      signaturesEveryTick.push(signature(readEveryTick.getClimateField()));
      readAtEnd.step(STEP_S);
    }

    expect(signature(readAtEnd.getClimateField())).toEqual(signaturesEveryTick[signaturesEveryTick.length - 1]);
    expect(readEveryTick.getRuntimeDiagnostics()).toEqual(readAtEnd.getRuntimeDiagnostics());
    expect(readEveryTick.getState()).toEqual(readAtEnd.getState());
    expect(readEveryTick.snapshot()).toEqual(readAtEnd.snapshot());
  });
});
