import { describe, expect, it } from "vitest";
import { createEarthLikeConfig, orbitalPeriodS } from "../simulation/planetEngine/core/PlanetCore";
import { PlanetEngine } from "../simulation/planetEngine/runtime/PlanetEngine";
import { dailyMeanCosineZenith } from "../simulation/planetEngine/climate/Insolation";
import {
  dryLapseRateKPerM,
  localTemperatureK,
  type LocalTemperatureInput,
} from "../simulation/planetEngine/climate/TemperatureField";
import { seasonAt } from "../simulation/planetEngine/climate/ClimateZones";
import { co2WarmingPerDoublingK, greenhouseIncrementK } from "../simulation/planetEngine/atmosphere/Greenhouse";
import { evaporationMPerYear } from "../simulation/planetEngine/climate/Humidity";
import { precipitationMPerYear } from "../simulation/planetEngine/climate/Precipitation";

const BASE_TEMPERATURE: LocalTemperatureInput = {
  globalMeanTemperatureK: 288,
  globalMeanInsolationWm2: 340,
  irradianceWm2: 420,
  elevationM: 0,
  seaLevelM: 0,
  humidity: 0.5,
  gravityMS2: 9.81,
};

describe("M3 — climate chain", () => {
  it("temperature falls as local irradiance falls from equator to pole", () => {
    const equator = localTemperatureK(BASE_TEMPERATURE);
    const mid = localTemperatureK({ ...BASE_TEMPERATURE, irradianceWm2: 240 });
    const pole = localTemperatureK({ ...BASE_TEMPERATURE, irradianceWm2: 5 });
    expect(equator).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(pole);
  });

  it("temperature falls with altitude at the dry lapse rate", () => {
    const low = localTemperatureK(BASE_TEMPERATURE);
    const high = localTemperatureK({ ...BASE_TEMPERATURE, elevationM: 3000 });
    const expectedDrop = dryLapseRateKPerM(9.81) * 3000;
    expect(low - high).toBeCloseTo(expectedDrop, 6);
  });

  it("daily mean insolation falls from equator to pole at equinox", () => {
    const equator = dailyMeanCosineZenith(0, 0);
    const mid = dailyMeanCosineZenith(Math.PI / 4, 0);
    const pole = dailyMeanCosineZenith(Math.PI / 2, 0);
    expect(equator).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(pole);
    expect(pole).toBeCloseTo(0, 12);
  });

  it("higher CO2 warms the surface through the gas inventory", () => {
    const config = createEarthLikeConfig();
    const state = new PlanetEngine(config).getState();
    expect(greenhouseIncrementK(config, state)).toBeGreaterThan(0);
    expect(co2WarmingPerDoublingK(config, state)).toBeGreaterThan(0);
  });

  it("seasons follow declination rather than a fixed tick table", () => {
    const config = createEarthLikeConfig();
    const period = orbitalPeriodS(config);
    expect(seasonAt(config, 0)).toBe("estate");
    expect(seasonAt(config, period / 2)).toBe("inverno");
    expect(seasonAt({ ...config, axialTiltRad: 0 }, 12345)).toBe("primavera");
  });

  it("more irradiance increases evaporation and precipitation", () => {
    const evaporation = (irradianceWm2: number) => evaporationMPerYear({
      irradianceWm2,
      temperatureK: 288,
      relativeHumidity: 0.5,
      windMS: 3,
      waterAvailability: 1,
    });
    const precipitation = (irradianceWm2: number) => precipitationMPerYear({
      evaporationMPerYear: evaporation(irradianceWm2),
      humidity: 0.6,
      upliftFactor: 0,
    });
    expect(evaporation(500)).toBeGreaterThan(evaporation(200));
    expect(precipitation(500)).toBeGreaterThan(precipitation(200));
  });
});
