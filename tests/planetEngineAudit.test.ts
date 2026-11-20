import { describe, expect, it } from "vitest";
import { MODEL_CLASSIFICATION, type GasKey } from "../simulation/planetEngine/contracts";
import {
  createEarthLikeConfig,
  DEFAULT_PLANET_SCHEDULER,
  resolveSchedulerConfig,
} from "../simulation/planetEngine/core/PlanetCore";
import { computeEnergyBudget } from "../simulation/planetEngine/core/EnergyBudget";
import { orbitAt } from "../simulation/planetEngine/core/Orbit";
import { PlanetInvariantError, validateConfig } from "../simulation/planetEngine/core/invariants";
import {
  MOLAR_MASS_KG_PER_MOL,
  dryAirMassKgFromState,
  meanMolarMassKgPerMol,
  setAtmosphericWaterMassKg,
  waterMassKgFromState,
} from "../simulation/planetEngine/atmosphere/Composition";
import { applyWaterFluxes, totalWaterInventoryKg } from "../simulation/planetEngine/hydrology/Inventory";
import {
  cellAreasForConfig,
  gridAreaMatchesSphere,
  latitudeCellAreasM2,
  totalCellAreaM2,
} from "../simulation/planetEngine/surface/GridGeometry";
import { buildElevationGrid, elevationHistogram } from "../simulation/planetEngine/surface/Hypsometry";
import { oceanFractionOf } from "../simulation/planetEngine/surface/Continents";
import { BIOME_COOLDOWN_TICKS, BIOME_HYSTERESIS, BiomeMemoryStore, updateBiome } from "../simulation/planetEngine/biomes/stability";
import { BIOME_ORDER, type BiomeScores } from "../simulation/planetEngine/biomes/classifier";
import { dryLapseRateKPerM, localTemperatureK, type LocalTemperatureInput } from "../simulation/planetEngine/climate/TemperatureField";
import { requireFiniteGridCoordinate } from "../simulation/planetEngine/snapshot/EnvironmentSnapshot";
import { PlanetEngine } from "../simulation/planetEngine/runtime/PlanetEngine";
import { PLANET_UNITS } from "../simulation/planetEngine/units";

const SMALL_SURFACE = { gridWidth: 16, gridHeight: 16 };

function speciesMassKg(
  composition: Record<GasKey, number>,
  totalMassKg: number,
  gas: GasKey,
): number {
  const mean = meanMolarMassKgPerMol(composition);
  const totalMoles = totalMassKg / mean;
  return composition[gas] * totalMoles * MOLAR_MASS_KG_PER_MOL[gas];
}

function zeroScores(): BiomeScores {
  return Object.fromEntries(BIOME_ORDER.map((key) => [key, 0])) as BiomeScores;
}

describe("Audit — atmospheric water contract", () => {
  it("owns vapor mass in the hydrosphere and mirrors it into composition", () => {
    const engine = new PlanetEngine(createEarthLikeConfig({ surface: SMALL_SURFACE }));
    const state = engine.getState();
    const vaporBeforeKg = state.hydrosphere.vaporMassKg;
    const waterBeforeKg = totalWaterInventoryKg(state);
    const dryAirBeforeKg = dryAirMassKgFromState(state);

    expect(Math.abs(waterMassKgFromState(state) - vaporBeforeKg) / vaporBeforeKg).toBeLessThan(1e-10);
    expect(vaporBeforeKg).toBeGreaterThan(0);
    expect(state.atmosphere.composition.H2O).toBeGreaterThan(0);

    const applied = applyWaterFluxes(state, {
      evaporationKg: 1e10,
      precipitationKg: 4e9,
      runoffKg: 1e9,
    });

    expect(Math.abs(state.hydrosphere.vaporMassKg - (vaporBeforeKg + 6e9)) / vaporBeforeKg).toBeLessThan(1e-10);
    expect(applied.precipitationKg).toBe(applied.condensationKg);
    expect(Math.abs(waterMassKgFromState(state) - state.hydrosphere.vaporMassKg) / vaporBeforeKg).toBeLessThan(1e-10);
    expect(Math.abs(totalWaterInventoryKg(state) - waterBeforeKg) / waterBeforeKg).toBeLessThan(1e-10);
    expect(Math.abs(dryAirMassKgFromState(state) - dryAirBeforeKg) / dryAirBeforeKg).toBeLessThan(1e-10);
  });

  it("conserves dry-air moles when atmospheric water mass is changed directly", () => {
    const engine = new PlanetEngine(createEarthLikeConfig({ surface: SMALL_SURFACE }));
    const state = engine.getState();
    const dryGases: GasKey[] = ["N2", "O2", "CO2", "CH4", "Ar", "other"];
    const before = dryGases.map((gas) => speciesMassKg(state.atmosphere.composition, state.atmosphere.totalMassKg, gas));

    const targetVaporKg = state.hydrosphere.vaporMassKg * 1.2;
    state.hydrosphere.vaporMassKg = targetVaporKg;
    setAtmosphericWaterMassKg(state, targetVaporKg);

    const after = dryGases.map((gas) => speciesMassKg(state.atmosphere.composition, state.atmosphere.totalMassKg, gas));
    after.forEach((mass, index) => {
      expect(Math.abs(mass - before[index]) / before[index]).toBeLessThan(1e-9);
    });
    expect(Math.abs(waterMassKgFromState(state) - targetVaporKg) / targetVaporKg).toBeLessThan(1e-10);
  });
});

describe("Audit — unified time orchestration", () => {
  it("runs subsystems on deterministic intervals and keeps pending SI time", () => {
    const engine = new PlanetEngine(createEarthLikeConfig({
      surface: SMALL_SURFACE,
      scheduler: { climateIntervalTicks: 1, hydrologyIntervalTicks: 2, geologyIntervalTicks: 3 },
    }));
    expect(resolveSchedulerConfig(engine.getConfig()).geologyIntervalTicks).toBe(3);

    const deltaS = 100;
    for (let tick = 1; tick <= 6; tick += 1) {
      const snapshot = engine.step(deltaS);
      const scheduler = engine.getState().scheduler;
      expect(snapshot.tick).toBe(tick);
      expect(snapshot.timeS).toBeCloseTo(tick * deltaS, 9);
      expect(scheduler.lastClimateTick).toBe(tick);
      expect(scheduler.lastHydrologyTick).toBe(tick % 2 === 0 ? tick : tick - 1);
      expect(scheduler.lastGeologyTick).toBe(tick % 3 === 0 ? tick : tick - (tick % 3));
      expect(scheduler.pendingHydrologyS).toBeCloseTo(tick % 2 === 0 ? 0 : deltaS, 9);
      expect(scheduler.pendingGeologyS).toBeCloseTo((tick % 3) * deltaS, 9);
      expect(JSON.parse(JSON.stringify(scheduler))).toEqual(scheduler);
    }
  });

  it("keeps manual subsystem helpers outside the production clock", () => {
    const engine = new PlanetEngine(createEarthLikeConfig({ surface: SMALL_SURFACE }));
    const before = engine.getState();
    engine.stepClimateHydrology(3600);
    engine.stepGeology(3600);
    const after = engine.getState();
    expect(after.tick).toBe(before.tick);
    expect(after.timeS).toBe(before.timeS);
  });

  it("rejects invalid step and seek inputs", () => {
    const engine = new PlanetEngine(createEarthLikeConfig({ surface: SMALL_SURFACE }));
    expect(() => engine.step(-1)).toThrow(PlanetInvariantError);
    expect(() => engine.step(Number.NaN)).toThrow(PlanetInvariantError);
    expect(() => engine.seek(-1, 0)).toThrow(PlanetInvariantError);
    expect(() => engine.seek(1, Number.POSITIVE_INFINITY)).toThrow(PlanetInvariantError);
    expect(() => validateConfig(createEarthLikeConfig({
      scheduler: { ...DEFAULT_PLANET_SCHEDULER, hydrologyIntervalTicks: 0 },
    }))).toThrow(PlanetInvariantError);
  });
});

describe("Audit — latitude-dependent cell areas", () => {
  it("telescopes to the exact sphere area and weights polar rows less", () => {
    const config = createEarthLikeConfig({ surface: SMALL_SURFACE });
    const areas = latitudeCellAreasM2(config.surface.gridWidth, config.surface.gridHeight, config.radiusM);
    const expected = 4 * Math.PI * config.radiusM ** 2;
    expect(Math.abs(totalCellAreaM2(areas) - expected) / expected).toBeLessThan(1e-12);
    expect(gridAreaMatchesSphere(cellAreasForConfig(config), config)).toBe(true);

    const width = config.surface.gridWidth;
    const equatorRow = Math.floor(config.surface.gridHeight / 2) - 1;
    expect(areas[equatorRow * width]).toBeGreaterThan(areas[0]);
    expect(areas[equatorRow * width]).toBeGreaterThan(areas[areas.length - width]);
    for (let y = 1; y <= equatorRow; y += 1) {
      expect(areas[y * width]).toBeGreaterThan(areas[(y - 1) * width]);
    }
  });

  it("accumulates area-weighted elevation bins", () => {
    const config = createEarthLikeConfig({ surface: SMALL_SURFACE });
    const grid = buildElevationGrid(config);
    const histogram = elevationHistogram(grid);
    const total = histogram.areasM2.reduce((sum, area) => sum + area, 0);
    const expectedTotal = totalCellAreaM2(grid.cellAreasM2);
    expect(Math.abs(total - expectedTotal) / expectedTotal).toBeLessThan(1e-12);
    expect(grid.cellAreasM2.length).toBe(grid.elevationM.length);
    const meanArea = total / grid.elevationM.length;
    expect(Math.abs(grid.cellAreaM2 - meanArea) / meanArea).toBeLessThan(1e-12);
  });

  it("weights the ocean fraction by area instead of cell count", () => {
    const config = createEarthLikeConfig({ surface: SMALL_SURFACE });
    const areas = cellAreasForConfig(config);
    const mask = new Uint8Array(areas.length);
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < config.surface.gridWidth; x += 1) mask[y * config.surface.gridWidth + x] = 1;
    }
    const countFraction = mask.reduce((sum, value) => sum + value, 0) / mask.length;
    expect(oceanFractionOf(mask, areas)).toBeLessThan(countFraction);
    expect(oceanFractionOf(mask)).toBeCloseTo(countFraction, 12);
  });
});

describe("Audit — persistent biome hysteresis", () => {
  it("keeps a biome inside the cooldown and requires a real margin after it", () => {
    const memory = { biome: "forest" as const, tick: 0, stability: 1 };
    const close = { ...zeroScores(), forest: 1, desert: 1 + BIOME_HYSTERESIS / 2 };
    expect(updateBiome(close, 1, memory).biome).toBe("forest");
    expect(updateBiome(close, BIOME_COOLDOWN_TICKS, memory).biome).toBe("forest");
    const decisive = { ...zeroScores(), forest: 1, desert: 1 + BIOME_HYSTERESIS * 2 };
    expect(updateBiome(decisive, BIOME_COOLDOWN_TICKS, memory).biome).toBe("desert");
  });

  it("shares engine-owned serializable memory across consecutive snapshots", () => {
    const width = SMALL_SURFACE.gridWidth;
    const engine = new PlanetEngine(createEarthLikeConfig({ surface: SMALL_SURFACE }));
    const first = engine.createEnvironmentSnapshot();
    first.sample(4, 4);
    const store = engine.getBiomeMemory();
    const index = 4 * width + 4;
    const initial = store.get(index);
    expect(initial).toBeDefined();

    const second = engine.createEnvironmentSnapshot();
    second.sample(4, 4);
    const persisted = store.get(index);
    expect(persisted?.biome).toBe(initial?.biome);
    expect(persisted?.tick).toBe(initial?.tick);
    expect(persisted?.stability).toBeGreaterThanOrEqual(0);
    expect(persisted?.stability).toBeLessThanOrEqual(1);
    expect(BiomeMemoryStore.fromJSON(store.toJSON()).toJSON()).toEqual(store.toJSON());

    second.materialize();
    expect(store.entries().size).toBe(width * SMALL_SURFACE.gridHeight);
  });
});

describe("Audit — hydrological and mass/energy conservation", () => {
  it("conserves water and non-volcanic gas mass over a full step schedule", () => {
    const engine = new PlanetEngine(createEarthLikeConfig({ surface: SMALL_SURFACE }));
    const waterBeforeKg = engine.totalWaterKg();
    const initial = engine.getState();
    const conservedGases: GasKey[] = ["N2", "O2", "Ar", "CH4", "other"];
    const gasBeforeKg = conservedGases.map((gas) =>
      speciesMassKg(initial.atmosphere.composition, initial.atmosphere.totalMassKg, gas));

    for (let i = 0; i < 8; i += 1) engine.step(3600);

    const after = engine.getState();
    expect(Math.abs(engine.totalWaterKg() - waterBeforeKg) / waterBeforeKg).toBeLessThan(1e-10);
    conservedGases.forEach((gas, index) => {
      const mass = speciesMassKg(after.atmosphere.composition, after.atmosphere.totalMassKg, gas);
      expect(Math.abs(mass - gasBeforeKg[index]) / gasBeforeKg[index]).toBeLessThan(1e-9);
    });
    expect(after.atmosphere.composition.CO2).toBeGreaterThan(initial.atmosphere.composition.CO2);
  });

  it("keeps the global energy balance consistent with its stated approximations", () => {
    const engine = new PlanetEngine(createEarthLikeConfig({ surface: SMALL_SURFACE }));
    const config = engine.getConfig();
    const state = engine.getState();
    const budget = computeEnergyBudget(config, orbitAt(config, state.timeS), state);

    expect(budget.absorbedWm2).toBeCloseTo(budget.meanInsolationWm2 * (1 - budget.albedo), 9);
    expect(PLANET_UNITS.stefanBoltzmann * budget.equilibriumTemperatureK ** 4).toBeCloseTo(budget.absorbedWm2, 6);
    expect(budget.surfaceTemperatureK).toBeCloseTo(budget.equilibriumTemperatureK + budget.greenhouseDeltaK, 9);
    expect(engine.snapshot().timeS).toBe(state.timeS);
  });
});

describe("Audit — explicit subsystem classification", () => {
  it("does not claim physical precision for heuristic or approximated subsystems", () => {
    expect(MODEL_CLASSIFICATION.gasInventory).toBe("PHYSICAL_MODEL");
    expect(MODEL_CLASSIFICATION.hypsometry).toBe("PHYSICAL_MODEL");
    expect(MODEL_CLASSIFICATION.energyBudget).toBe("APPROXIMATION");
    expect(MODEL_CLASSIFICATION.greenhouse).toBe("APPROXIMATION");
    expect(MODEL_CLASSIFICATION.erosion).toBe("APPROXIMATION");
    expect(MODEL_CLASSIFICATION.localClimate).toBe("APPROXIMATION");
    expect(MODEL_CLASSIFICATION.atmosphericCirculation).toBe("SIMULATION_HEURISTIC");
    expect(MODEL_CLASSIFICATION.geology).toBe("SIMULATION_HEURISTIC");
    expect(MODEL_CLASSIFICATION.waterCycle).toBe("SIMULATION_HEURISTIC");
    expect(MODEL_CLASSIFICATION.drainageProxy).toBe("SIMULATION_HEURISTIC");
    expect(MODEL_CLASSIFICATION.biomeClassifier).toBe("SIMULATION_HEURISTIC");
    for (const tag of Object.values(MODEL_CLASSIFICATION)) {
      expect(["PHYSICAL_MODEL", "APPROXIMATION", "SIMULATION_HEURISTIC", "VISUAL_EFFECT"]).toContain(tag);
    }
  });

  it("drives local temperature from irradiance and the physical dry lapse rate", () => {
    const base: LocalTemperatureInput = {
      globalMeanTemperatureK: 288,
      globalMeanInsolationWm2: 340,
      irradianceWm2: 420,
      elevationM: 0,
      seaLevelM: 0,
      humidity: 0.5,
      gravityMS2: 9.81,
    };
    expect(dryLapseRateKPerM(9.81)).toBeCloseTo(9.81 / PLANET_UNITS.dryAirCpJPerKgK, 9);
    expect(localTemperatureK({ ...base, irradianceWm2: 520 })).toBeGreaterThan(localTemperatureK(base));
    expect(localTemperatureK({ ...base, elevationM: 1000 })).toBeLessThan(localTemperatureK(base));
  });
});

describe("Audit — snapshot immutability and validation", () => {
  it("returns frozen defensive copies that cannot mutate engine state", () => {
    const engine = new PlanetEngine(createEarthLikeConfig({ surface: SMALL_SURFACE }));
    const snapshot = engine.createEnvironmentSnapshot();
    const sample = snapshot.sample(3, 2);
    const cell = snapshot.toLegacyCell(3, 2);
    const stateBefore = engine.getState();

    expect(Object.isFrozen(sample)).toBe(true);
    expect(Object.isFrozen(cell)).toBe(true);
    expect(() => {
      (sample as { temperatureK: number }).temperatureK = 0;
    }).toThrow(TypeError);
    expect(() => {
      (cell as { water: number }).water = -1;
    }).toThrow(TypeError);
    expect(engine.getState()).toEqual(stateBefore);
    expect(snapshot.sample(3, 2)).toEqual(sample);
  });

  it("wraps finite integer coordinates and rejects every other coordinate", () => {
    const width = SMALL_SURFACE.gridWidth;
    const snapshot = new PlanetEngine(createEarthLikeConfig({ surface: SMALL_SURFACE })).createEnvironmentSnapshot();
    expect(requireFiniteGridCoordinate(-1, width, "x")).toBe(width - 1);
    expect(snapshot.sample(-1, 0)).toEqual(snapshot.sample(width - 1, 0));
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, "3", null]) {
      expect(() => snapshot.sample(invalid as number, 0)).toThrow(PlanetInvariantError);
    }
  });

  it("rejects invalid water fluxes and vapor masses", () => {
    const state = new PlanetEngine(createEarthLikeConfig({ surface: SMALL_SURFACE })).getState();
    expect(() => applyWaterFluxes(state, { evaporationKg: -1, precipitationKg: 0, runoffKg: 0 }))
      .toThrow(PlanetInvariantError);
    expect(() => applyWaterFluxes(state, { evaporationKg: Number.NaN, precipitationKg: 0, runoffKg: 0 }))
      .toThrow(PlanetInvariantError);
    expect(() => setAtmosphericWaterMassKg(state, -1)).toThrow(PlanetInvariantError);
  });
});

describe("Audit — determinism across seeds", () => {
  it("repeats exactly for a seed and diverges for a different seed", () => {
    const seedA = createEarthLikeConfig({ seed: 11, surface: SMALL_SURFACE });
    const seedB = createEarthLikeConfig({ seed: 12, surface: SMALL_SURFACE });
    const gridA = buildElevationGrid(seedA);
    expect(Array.from(buildElevationGrid(seedA).elevationM)).toEqual(Array.from(gridA.elevationM));
    expect(Array.from(buildElevationGrid(seedB).elevationM)).not.toEqual(Array.from(gridA.elevationM));

    const a = new PlanetEngine(seedA);
    const repeat = new PlanetEngine(seedA);
    const other = new PlanetEngine(seedB);
    for (let i = 0; i < 3; i += 1) {
      expect(a.step(3600)).toEqual(repeat.step(3600));
      other.step(3600);
    }
    expect(a.snapshot()).toEqual(repeat.snapshot());
    expect(a.snapshot()).not.toEqual(other.snapshot());
  });
});
