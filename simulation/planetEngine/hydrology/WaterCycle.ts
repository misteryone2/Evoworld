/**
 * PHYSICAL_MODEL + SIMULATION_HEURISTIC
 *
 * Local evaporation/precipitation/runoff derived from climate and surface.
 * Totals are converted to masses for the conservative inventory update.
 */

import type {
  ClimateField,
  HydrologyField,
  PlanetPhysicalConfig,
  PlanetState,
  SurfaceField,
} from "../contracts";
import { surfacePressureFromState } from "../core/EnergyBudget";
import { evaporationMPerYear, relativeHumidityFromPressure } from "../climate/Humidity";
import { precipitationMPerYear } from "../climate/Precipitation";
import { computeRiverFlow, runoffFractionFromSlope, slopeAt } from "./Drainage";
import type { WaterFluxKg } from "./Inventory";
import { clamp, PLANET_UNITS } from "../units";

export interface WaterCycleInput {
  config: PlanetPhysicalConfig;
  state: PlanetState;
  surface: SurfaceField;
  climate: ClimateField;
  deltaS: number;
}

export interface WaterCycleResult {
  field: HydrologyField;
  fluxesKg: WaterFluxKg;
}

export function computeWaterCycle(input: WaterCycleInput): WaterCycleResult {
  const { config, state, surface, climate, deltaS } = input;
  const size = surface.width * surface.height;
  const pressurePa = surfacePressureFromState(config, state);
  const vaporPressurePa = state.atmosphere.composition.H2O * pressurePa;

  const soilMoisture = new Float32Array(size);
  const waterAvailability = new Float32Array(size);
  const precipitationMPerYearField = new Float32Array(size);
  const evaporationMPerYearField = new Float32Array(size);
  const runoffMPerYearField = new Float32Array(size);

  let evaporationKg = 0;
  let precipitationKg = 0;
  let runoffKg = 0;
  const kgPerMeterPerStep =
    (surface.cellAreaM2 * PLANET_UNITS.waterDensityKgM3 * deltaS) / PLANET_UNITS.secondsPerEarthYear;

  for (let i = 0; i < size; i += 1) {
    const ocean = surface.oceanMask[i] === 1;
    const heightAboveSeaM = Math.max(0, surface.elevationM[i] - surface.seaLevelM);
    const oceanProximity = ocean
      ? 1
      : 1 - clamp(heightAboveSeaM / Math.max(config.surface.roughnessM, 1), 0, 1);
    const humidity = clamp(climate.humidity[i], 0, 1);
    const localVaporPressurePa = vaporPressurePa * (ocean ? 1 : 0.6 + 0.4 * oceanProximity);
    const rh = ocean
      ? humidity
      : relativeHumidityFromPressure(climate.temperatureK[i], localVaporPressurePa, oceanProximity);

    const availability = ocean ? 1 : clamp(humidity * 0.6 + oceanProximity * 0.4, 0, 1);
    const slope = slopeAt(surface, i % surface.width, Math.floor(i / surface.width));
    const runoffFraction = runoffFractionFromSlope(slope);
    const storedMoisture = ocean ? 1 : clamp(humidity * (1 - runoffFraction) * 0.8 + 0.1, 0, 1);

    const evaporation = evaporationMPerYear({
      irradianceWm2: climate.irradianceWm2[i],
      temperatureK: climate.temperatureK[i],
      relativeHumidity: rh,
      windMS: climate.windMS[i],
      waterAvailability: availability,
    });
    const upliftFactor = ocean ? 0 : clamp(heightAboveSeaM / Math.max(config.surface.roughnessM, 1), 0, 1);
    const precipitation = precipitationMPerYear({
      evaporationMPerYear: evaporation,
      humidity: rh,
      upliftFactor,
    });
    const runoff = ocean ? 0 : Math.max(0, precipitation - evaporation) * runoffFraction;

    soilMoisture[i] = storedMoisture;
    waterAvailability[i] = availability;
    evaporationMPerYearField[i] = evaporation;
    precipitationMPerYearField[i] = precipitation;
    runoffMPerYearField[i] = runoff;

    evaporationKg += evaporation * kgPerMeterPerStep;
    precipitationKg += precipitation * kgPerMeterPerStep;
    runoffKg += runoff * kgPerMeterPerStep;
  }

  return {
    field: {
      width: surface.width,
      height: surface.height,
      soilMoisture,
      waterAvailability,
      precipitationMPerYear: precipitationMPerYearField,
      evaporationMPerYear: evaporationMPerYearField,
      runoffMPerYear: runoffMPerYearField,
      riverFlow: computeRiverFlow(surface, precipitationMPerYearField, surface.oceanMask),
    },
    fluxesKg: {
      evaporationKg,
      precipitationKg,
      runoffKg,
      iceMeltKg: 0,
      freezingKg: 0,
    },
  };
}
