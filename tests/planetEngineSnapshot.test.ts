import { describe, expect, it } from "vitest";
import type { Cell, Genome } from "../types";
import { environmentalFitness } from "../simulation/biology/environment";
import { createEarthLikeConfig } from "../simulation/planetEngine/core/PlanetCore";
import { PlanetEngine } from "../simulation/planetEngine/runtime/PlanetEngine";
import { isEnvironmentSnapshot } from "../simulation/planetEngine/snapshot/schema";
import { legacyTemperatureFromKelvin } from "../simulation/planetEngine/units";

const SMALL_SURFACE = { gridWidth: 48, gridHeight: 48 };

const GENOME: Genome = {
  size: 1,
  speed: 1,
  metabolism: 1,
  vision: 1,
  fertility: 1,
  lifespan: 100,
  carnivory: 0,
  evasion: 1,
  huntingSkill: 1,
  preferredTemperature: 20,
  temperatureTolerance: 10,
  preferredWater: 0.6,
  waterTolerance: 0.3,
};

describe("M4 — Environment Snapshot", () => {
  it("exposes a versioned headless snapshot contract", () => {
    const engine = new PlanetEngine(createEarthLikeConfig({ surface: SMALL_SURFACE }));
    const snapshot = engine.createEnvironmentSnapshot();
    expect(isEnvironmentSnapshot(snapshot)).toBe(true);
    expect(snapshot.version).toBe(1);
    expect(snapshot.engineVersion).toBe(engine.engineVersion);
    expect(snapshot.gridWidth).toBe(SMALL_SURFACE.gridWidth);
    expect(snapshot.gridHeight).toBe(SMALL_SURFACE.gridHeight);
  });

  it("converts physical samples back to exact legacy Cell units", () => {
    const engine = new PlanetEngine(createEarthLikeConfig({ surface: SMALL_SURFACE }));
    const snapshot = engine.createEnvironmentSnapshot();
    const sample = snapshot.sample(7, 5);
    const cell = snapshot.toLegacyCell(7, 5);

    expect(cell.elevation).toBeGreaterThanOrEqual(0);
    expect(cell.elevation).toBeLessThanOrEqual(1);
    expect(cell.water).toBeGreaterThanOrEqual(0);
    expect(cell.water).toBeLessThanOrEqual(1);
    expect(cell.temperature).toBeCloseTo(legacyTemperatureFromKelvin(sample.temperatureK), 10);
    expect(cell.seasonalOffset).toBeCloseTo(sample.seasonalOffsetK, 10);
    expect(cell.terrain).toBe(sample.biome);
    expect(cell.vegetation).toBeGreaterThanOrEqual(0);
  });

  it("produces identical fitness to environmentalFitness on the same Cell values", () => {
    const engine = new PlanetEngine(createEarthLikeConfig({ surface: SMALL_SURFACE }));
    const snapshot = engine.createEnvironmentSnapshot();
    const cell = snapshot.toLegacyCell(11, 9);
    const manualCell: Cell = { ...cell };
    const extendedGenome: Genome = { ...GENOME, ext: { seasonalRobustness: 0.5, altitudeAdaptation: 0.5 } };

    expect(environmentalFitness(GENOME, cell)).toBeCloseTo(environmentalFitness(GENOME, manualCell), 12);
    expect(environmentalFitness(extendedGenome, cell)).toBeCloseTo(
      environmentalFitness(extendedGenome, manualCell),
      12,
    );
  });

  it("is deterministic and independent of cell access order", () => {
    const config = createEarthLikeConfig({ surface: SMALL_SURFACE });
    const a = new PlanetEngine(config).createEnvironmentSnapshot();
    const b = new PlanetEngine(config).createEnvironmentSnapshot();
    const first = a.sample(3, 4);

    for (const [x, y] of [[1, 1], [20, 20], [40, 7], [9, 31]] as Array<[number, number]>) b.sample(x, y);
    for (const [x, y] of [[40, 7], [9, 31], [20, 20], [1, 1]] as Array<[number, number]>) a.sample(x, y);

    expect(a.sample(3, 4)).toEqual(first);
    expect(a.sample(3, 4)).toEqual(b.sample(3, 4));
  });
});
