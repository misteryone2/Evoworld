import { describe, expect, it } from "vitest";
import type { GasKey } from "../simulation/planetEngine/contracts";
import {
  createEarthLikeConfig,
  gravityMS2,
  orbitalPeriodS,
  rotationPhaseAt,
} from "../simulation/planetEngine/core/PlanetCore";
import { orbitAt, solveEccentricAnomaly } from "../simulation/planetEngine/core/Orbit";
import { stellarFluxWm2 } from "../simulation/planetEngine/core/Stellar";
import { greenhouseDeltaK } from "../simulation/planetEngine/core/EnergyBudget";
import { PlanetInvariantError, validateConfig } from "../simulation/planetEngine/core/invariants";
import { PlanetEngine } from "../simulation/planetEngine/runtime/PlanetEngine";
import { hashSeed, mulberry32, random2D } from "../simulation/planetEngine/deterministic";
import { daysToSeconds, legacyTemperatureFromKelvin, normalizeAngleRad, PLANET_UNITS } from "../simulation/planetEngine/units";

describe("M1 — Planet Core", () => {
  it("derives Earth-like gravity and orbital period from SI constants", () => {
    const config = createEarthLikeConfig();
    expect(gravityMS2(config)).toBeCloseTo(9.82, 1);
    expect(orbitalPeriodS(config) / PLANET_UNITS.secondsPerEarthDay).toBeCloseTo(365.25, 1);
  });

  it("keeps one sidereal rotation phase deterministic over one period", () => {
    const config = createEarthLikeConfig();
    expect(rotationPhaseAt(config, 0)).toBe(0);
    expect(normalizeAngleRad(rotationPhaseAt(config, config.rotationPeriodS))).toBeLessThan(1e-9);
    expect(rotationPhaseAt(config, config.rotationPeriodS / 4)).toBeCloseTo(Math.PI / 2, 9);
  });

  it("solves Kepler's equation deterministically across eccentricities", () => {
    for (const eccentricity of [0, 0.0167086, 0.3, 0.7, 0.9]) {
      for (const mean of [0, 0.37, Math.PI, 4.5, Math.PI * 2 - 0.1]) {
        const eccentric = solveEccentricAnomaly(mean, eccentricity);
        const residual = eccentric - eccentricity * Math.sin(eccentric) - normalizeAngleRad(mean);
        expect(Math.abs(residual)).toBeLessThan(1e-8);
      }
    }
  });

  it("keeps orbital distance between periapsis and apoapsis", () => {
    const config = createEarthLikeConfig();
    const periapsis = config.orbit.semiMajorAxisM * (1 - config.orbit.eccentricity);
    const apoapsis = config.orbit.semiMajorAxisM * (1 + config.orbit.eccentricity);
    for (const timeS of [0, daysToSeconds(10), daysToSeconds(100), daysToSeconds(365)]) {
      const position = orbitAt(config, timeS);
      expect(position.distanceM).toBeGreaterThanOrEqual(periapsis - 1e-3);
      expect(position.distanceM).toBeLessThanOrEqual(apoapsis + 1e-3);
      expect(position.timeS).toBe(timeS);
    }
  });

  it("derives declination from obliquity, not from a hard-coded season table", () => {
    const flat = createEarthLikeConfig({ axialTiltRad: 0 });
    expect(orbitAt(flat, 0).declinationRad).toBeCloseTo(0, 12);

    const tilted = createEarthLikeConfig({
      axialTiltRad: Math.PI / 6,
      orbit: { meanAnomalyAtEpochRad: 0, longitudeOfPeriapsisRad: Math.PI / 2 },
    });
    expect(orbitAt(tilted, 0).declinationRad).toBeCloseTo(Math.PI / 6, 6);
  });

  it("computes stellar flux from luminosity and orbital distance", () => {
    const config = createEarthLikeConfig();
    const flux = stellarFluxWm2(config.star.luminosityW, config.orbit.semiMajorAxisM);
    expect(flux).toBeGreaterThan(1350);
    expect(flux).toBeLessThan(1370);
    expect(stellarFluxWm2(config.star.luminosityW, config.orbit.semiMajorAxisM * 2)).toBeCloseTo(flux / 4, 9);
    expect(() => stellarFluxWm2(config.star.luminosityW, 0)).toThrow(RangeError);
  });
});

describe("M1 — Energy budget", () => {
  it("reproduces an Earth-like equilibrium and greenhouse increment", () => {
    const engine = new PlanetEngine(createEarthLikeConfig());
    const snapshot = engine.snapshot();

    expect(snapshot.equilibriumTemperatureK).toBeGreaterThan(250);
    expect(snapshot.equilibriumTemperatureK).toBeLessThan(260);
    expect(snapshot.greenhouseDeltaK).toBeGreaterThan(30);
    expect(snapshot.greenhouseDeltaK).toBeLessThan(36);
    expect(snapshot.surfaceTemperatureK).toBeGreaterThan(284);
    expect(snapshot.surfaceTemperatureK).toBeLessThan(292);
    expect(snapshot.surfacePressurePa).toBeCloseTo(101325, 3);
  });

  it("vanishes without atmosphere and warms when CO2 increases", () => {
    const config = createEarthLikeConfig();
    const composition = config.atmosphere.composition;
    const doubled = createEarthLikeConfig({
      atmosphere: {
        composition: {
          ...composition,
          N2: composition.N2! - composition.CO2!,
          CO2: composition.CO2! * 2,
        },
      },
    });

    const earthLike = composition as Record<GasKey, number>;
    expect(greenhouseDeltaK(earthLike, 0)).toBe(0);
    expect(greenhouseDeltaK(doubled.atmosphere.composition as Record<GasKey, number>, 101325)).toBeGreaterThan(
      greenhouseDeltaK(earthLike, 101325),
    );
  });

  it("converts Kelvin to the legacy gameplay temperature scale explicitly", () => {
    expect(legacyTemperatureFromKelvin(273.15)).toBeCloseTo(20, 10);
    expect(legacyTemperatureFromKelvin(293.15)).toBeCloseTo(40, 10);
  });
});

describe("M1 — Determinism and invariants", () => {
  it("derives identical snapshots from identical configs and step schedules", () => {
    const config = createEarthLikeConfig();
    const a = new PlanetEngine(config);
    const b = new PlanetEngine(config);
    for (let i = 0; i < 12; i += 1) {
      expect(a.step(3600)).toEqual(b.step(3600));
    }
  });

  it("is path independent when seeking to the same absolute time", () => {
    const config = createEarthLikeConfig();
    const stepped = new PlanetEngine(config);
    const totalS = daysToSeconds(50);
    for (let i = 0; i < 50; i += 1) stepped.step(daysToSeconds(1));

    const sought = new PlanetEngine(config).seek(50, totalS);
    expect(sought.orbit.distanceM).toBeCloseTo(stepped.snapshot().orbit.distanceM, 6);
    expect(sought.fluxWm2).toBeCloseTo(stepped.snapshot().fluxWm2, 6);
    expect(sought.surfaceTemperatureK).toBeCloseTo(stepped.snapshot().surfaceTemperatureK, 9);
  });

  it("uses stateless derived randomness instead of Math.random", () => {
    expect(hashSeed(42, "geology")).toBe(hashSeed(42, "geology"));
    expect(hashSeed(42, "geology")).not.toBe(hashSeed(42, "climate"));
    const a = mulberry32(hashSeed(42, "geology"));
    const b = mulberry32(hashSeed(42, "geology"));
    for (let i = 0; i < 8; i += 1) expect(a()).toBe(b());
    expect(random2D(42, 3, 7)).toBe(random2D(42, 3, 7));
  });

  it("rejects physically meaningless configurations", () => {
    expect(() => validateConfig(createEarthLikeConfig({ massKg: 0 }))).toThrow(PlanetInvariantError);
    expect(() => validateConfig(createEarthLikeConfig({ orbit: { eccentricity: 1 } }))).toThrow(PlanetInvariantError);
    expect(() =>
      validateConfig(createEarthLikeConfig({ atmosphere: { composition: { CO2: 0.5 } } })),
    ).toThrow(PlanetInvariantError);
    expect(() => new PlanetEngine(createEarthLikeConfig({ radiusM: -1 }))).toThrow(PlanetInvariantError);
  });
});
