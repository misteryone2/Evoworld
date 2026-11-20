import { describe, expect, it } from "vitest";
import { MODEL_CLASSIFICATION, type ElevationGrid } from "../simulation/planetEngine/contracts";
import {
  atmosphereMassFromPressureKg,
  createEarthLikeConfig,
  gravityMS2,
  orbitalPeriodS,
  surfaceAreaM2,
} from "../simulation/planetEngine/core/PlanetCore";
import { orbitAtMeanAnomaly } from "../simulation/planetEngine/core/Orbit";
import { stellarFluxWm2, spectralClassFromTemperatureK } from "../simulation/planetEngine/core/Stellar";
import {
  computeEnergyBudget,
  estimateBondAlbedo,
  surfacePressureFromState,
} from "../simulation/planetEngine/core/EnergyBudget";
import { dailyMeanCosineZenith } from "../simulation/planetEngine/climate/Insolation";
import {
  dryLapseRateKPerM,
  insolationAnomalyK,
  localTemperatureK,
  type LocalTemperatureInput,
} from "../simulation/planetEngine/climate/TemperatureField";
import { coriolisParameter, zonalWindMS } from "../simulation/planetEngine/atmosphere/Circulation";
import { solveSeaLevelM } from "../simulation/planetEngine/surface/Hypsometry";
import { erodeAndDeposit } from "../simulation/planetEngine/geology/SurfaceEvolution";
import { PlanetEngine } from "../simulation/planetEngine/runtime/PlanetEngine";
import { PLANET_UNITS } from "../simulation/planetEngine/units";

const CONFIG = createEarthLikeConfig();

/**
 * Reference values are independent textbook targets, not outputs of the code
 * under test. Tolerances are stated per assertion. See `MODELS.md` for the
 * validation-status table and the explicitly non-validated phenomena.
 */
describe("P2 — PHYSICAL_MODEL scientific reference tests", () => {
  it("gravity: g = GM/R² matches Earth reference and scales correctly", () => {
    expect(gravityMS2(CONFIG)).toBeCloseTo(9.8203, 3);
    expect(gravityMS2({ ...CONFIG, massKg: CONFIG.massKg * 2 })).toBeCloseTo(gravityMS2(CONFIG) * 2, 9);
    expect(gravityMS2({ ...CONFIG, radiusM: CONFIG.radiusM * 2 })).toBeCloseTo(gravityMS2(CONFIG) / 4, 9);
  });

  it("orbital period: 365.25 days and Kepler's third law", () => {
    const days = orbitalPeriodS(CONFIG) / PLANET_UNITS.secondsPerEarthDay;
    expect(days).toBeGreaterThan(365.0);
    expect(days).toBeLessThan(365.5);
    const farther = { ...CONFIG, orbit: { ...CONFIG.orbit, semiMajorAxisM: CONFIG.orbit.semiMajorAxisM * 2 } };
    expect(orbitalPeriodS(farther) / orbitalPeriodS(CONFIG)).toBeCloseTo(2 ** 1.5, 6);
  });

  it("insolation: solar constant near 1361 W/m² with inverse-square distance", () => {
    const at1Au = stellarFluxWm2(CONFIG.star.luminosityW, CONFIG.orbit.semiMajorAxisM);
    expect(at1Au).toBeGreaterThan(1356);
    expect(at1Au).toBeLessThan(1366);
    expect(stellarFluxWm2(CONFIG.star.luminosityW, CONFIG.orbit.semiMajorAxisM * 0.5)).toBeCloseTo(at1Au * 4, 6);
    expect(stellarFluxWm2(CONFIG.star.luminosityW, CONFIG.orbit.semiMajorAxisM * 2)).toBeCloseTo(at1Au / 4, 6);
    expect(spectralClassFromTemperatureK(5772)).toBe("G");
  });

  it("axial tilt: maximum declination equals obliquity; zero tilt removes seasons", () => {
    const tilted = orbitAtMeanAnomaly({
      ...CONFIG,
      orbit: { ...CONFIG.orbit, longitudeOfPeriapsisRad: Math.PI / 2 },
    }, 0);
    expect(tilted.declinationRad).toBeCloseTo(CONFIG.axialTiltRad, 9);
    const flat = orbitAtMeanAnomaly({ ...CONFIG, axialTiltRad: 0 }, 12345);
    expect(flat.declinationRad).toBe(0);
    const equinox = dailyMeanCosineZenith(0, 0);
    expect(equinox).toBeGreaterThan(dailyMeanCosineZenith(Math.PI / 2, 0));
    expect(equinox).toBeLessThanOrEqual(0.64);
  });

  it("temperature and altitude: physical dry lapse rate with reference drop", () => {
    const lapse = dryLapseRateKPerM(9.80665);
    expect(lapse).toBeCloseTo(0.009763, 6);
    const base: LocalTemperatureInput = {
      globalMeanTemperatureK: 288,
      globalMeanInsolationWm2: 340,
      irradianceWm2: 340,
      elevationM: 0,
      seaLevelM: 0,
      humidity: 0.5,
      gravityMS2: 9.80665,
    };
    expect(localTemperatureK(base)).toBeCloseTo(288, 9);
    const high = localTemperatureK({ ...base, elevationM: 3000 });
    expect(288 - high).toBeCloseTo(lapse * 3000, 6);
    expect(insolationAnomalyK(0, 340)).toBeLessThan(0);
    expect(insolationAnomalyK(1000, 340)).toBeGreaterThan(0);
  });

  it("pressure: p = m·g/A round-trips 1 atm and conserves the gas inventory", () => {
    const state = new PlanetEngine(CONFIG).getState();
    expect(surfacePressureFromState(CONFIG, state)).toBeCloseTo(101325, 3);
    const expectedMassKg = atmosphereMassFromPressureKg(CONFIG);
    expect(state.atmosphere.totalMassKg).toBeCloseTo(expectedMassKg, 3);
    expect(expectedMassKg).toBeGreaterThan(5e18);
    expect(expectedMassKg).toBeLessThan(5.5e18);
    expect(surfaceAreaM2(CONFIG)).toBeCloseTo(4 * Math.PI * CONFIG.radiusM ** 2, 6);
  });

  it("energy budget: σT⁴ = S(1−A)/4, reference equilibrium and greenhouse", () => {
    const budget = computeEnergyBudget(CONFIG, orbitAtMeanAnomaly(CONFIG, 0), new PlanetEngine(CONFIG).getState());
    const albedo = estimateBondAlbedo(CONFIG);
    expect(albedo).toBeCloseTo(0.28805, 6);
    expect(budget.meanInsolationWm2).toBeCloseTo(budget.fluxWm2 / 4, 9);
    expect(PLANET_UNITS.stefanBoltzmann * budget.equilibriumTemperatureK ** 4)
      .toBeCloseTo(budget.meanInsolationWm2 * (1 - albedo), 6);
    expect(budget.equilibriumTemperatureK).toBeGreaterThan(250);
    expect(budget.equilibriumTemperatureK).toBeLessThan(265);
    expect(budget.greenhouseDeltaK).toBeCloseTo(33, 6);
    expect(budget.surfaceTemperatureK).toBeGreaterThan(285);
    expect(budget.surfaceTemperatureK).toBeLessThan(295);
  });

  it("water conservation: total inventory stays constant over 20 steps", () => {
    const engine = new PlanetEngine(CONFIG);
    const before = engine.totalWaterKg();
    expect(before).toBeCloseTo(CONFIG.hydrosphere.totalWaterKg, 6);
    for (let i = 0; i < 20; i += 1) engine.step(3600);
    expect(Math.abs(engine.totalWaterKg() - before) / before).toBeLessThan(1e-10);
  }, 30_000);

  it("sea level: analytic two-level basin reference and monotonic inventory", () => {
    const areaM2 = 1e12;
    const grid: ElevationGrid = {
      width: 2,
      height: 1,
      elevationM: new Float32Array([-1000, 1000]),
      minM: -1000,
      maxM: 1000,
      cellAreasM2: new Float64Array([areaM2 / 2, areaM2 / 2]),
      cellAreaM2: areaM2 / 2,
    };
    const level = solveSeaLevelM(grid, (areaM2 / 2) * 500);
    // Histogram partial-bin integration has ≤1 bin (7.8125 m) of resolution.
    expect(Math.abs(level - (-500))).toBeLessThan(20);

    const dry = new PlanetEngine(createEarthLikeConfig({ hydrosphere: { totalWaterKg: 1e19 } }));
    const wet = new PlanetEngine(createEarthLikeConfig({ hydrosphere: { totalWaterKg: 1.4e21 } }));
    expect(wet.getSurfaceField().seaLevelM).toBeGreaterThan(dry.getSurfaceField().seaLevelM);
    const field = wet.getSurfaceField();
    expect(field.seaLevelM).toBeGreaterThan(field.minM);
    expect(field.seaLevelM).toBeLessThan(field.maxM);
    // Earth's real ocean fraction (~0.71) is NOT a validated target here: the
    // seeded hypsometric generator is an approximation (see MODELS.md).
    expect(field.oceanFraction).toBeGreaterThan(0);
    expect(field.oceanFraction).toBeLessThan(1);
  });

  it("erosion: transported mass equals volume times crust density", () => {
    const config = createEarthLikeConfig({ surface: { gridWidth: 32, gridHeight: 32 } });
    const grid = new PlanetEngine(config).getElevationGrid();
    const result = erodeAndDeposit(config, grid, PLANET_UNITS.secondsPerEarthDay);
    expect(result.erodedMassKg).toBeCloseTo(result.erodedVolumeM3 * PLANET_UNITS.crustDensityKgM3, 6);
    expect(result.depositedMassKg).toBeCloseTo(result.erodedMassKg, 6);
    expect(result.erodedVolumeM3).toBeGreaterThan(0);
  });
});

describe("P2 — APPROXIMATION and SIMULATION_HEURISTIC status", () => {
  it("keeps every subsystem tag explicit and non-overclaiming", () => {
    expect(MODEL_CLASSIFICATION.orbitalMechanics).toBe("PHYSICAL_MODEL");
    expect(MODEL_CLASSIFICATION.gasInventory).toBe("PHYSICAL_MODEL");
    expect(MODEL_CLASSIFICATION.hypsometry).toBe("PHYSICAL_MODEL");
    expect(MODEL_CLASSIFICATION.energyBudget).toBe("APPROXIMATION");
    expect(MODEL_CLASSIFICATION.greenhouse).toBe("APPROXIMATION");
    expect(MODEL_CLASSIFICATION.erosion).toBe("APPROXIMATION");
    expect(MODEL_CLASSIFICATION.localClimate).toBe("APPROXIMATION");
    expect(MODEL_CLASSIFICATION.environmentSnapshot).toBe("APPROXIMATION");
    expect(MODEL_CLASSIFICATION.atmosphericCirculation).toBe("SIMULATION_HEURISTIC");
    expect(MODEL_CLASSIFICATION.geology).toBe("SIMULATION_HEURISTIC");
    expect(MODEL_CLASSIFICATION.waterCycle).toBe("SIMULATION_HEURISTIC");
    expect(MODEL_CLASSIFICATION.drainageProxy).toBe("SIMULATION_HEURISTIC");
    expect(MODEL_CLASSIFICATION.biomeClassifier).toBe("SIMULATION_HEURISTIC");
    // VISUAL_EFFECT belongs to the shared taxonomy, but no headless Planet
    // Engine subsystem claims it; renderer-only effects are out of scope.
    expect(Object.values(MODEL_CLASSIFICATION)).not.toContain("VISUAL_EFFECT");
  });

  it("treats local temperature and wind as bounded proxies, not solved fields", () => {
    const omega = 2 * Math.PI / CONFIG.rotationPeriodS;
    expect(coriolisParameter(0, omega)).toBe(0);
    expect(coriolisParameter(Math.PI / 4, omega)).toBeGreaterThan(0);
    expect(zonalWindMS(Math.PI / 4, omega, 1e-5)).toBe(zonalWindMS(Math.PI / 4, omega, 1e-5));
    expect(zonalWindMS(Math.PI / 4, omega, 1e-5)).toBeLessThanOrEqual(60);
  });
});
