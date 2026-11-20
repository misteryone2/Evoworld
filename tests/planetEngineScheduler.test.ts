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
    expect(engine.getRuntimeDiagnostics().climateUpdateCount).toBe(0);

    const initialCount = engine.getRuntimeDiagnostics().climateUpdateCount + 1;
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
    expect(after.climateRevision).toBe(baseline.climateRevision);
    expect(after.climateUpdateCount).toBe(baseline.climateUpdateCount);
    expect(engine.getState().scheduler.lastHydrologyTick).toBe(1);
    expect(engine.getState().scheduler.lastGeologyTick).toBe(1);
  });
});
