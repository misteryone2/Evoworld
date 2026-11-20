/**
 * CONTRACT / ADAPTER
 *
 * Converts a physical EnvironmentSample to the exact legacy `Cell` shape used
 * by `environmentalFitness()`. No file under simulation/biology is modified.
 */

import type { Cell, EnvironmentSample, PlanetPhysicalConfig } from "../contracts";
import { clamp, elevation01FromMeters, legacyTemperatureFromKelvin, legacyWaterAxis } from "../units";

export function environmentSampleToLegacyCell(
  sample: EnvironmentSample,
  config: PlanetPhysicalConfig,
): Cell {
  const roughnessM = Math.max(config.surface.roughnessM, 1);
  return {
    elevation: elevation01FromMeters(sample.elevationM, sample.seaLevelM, roughnessM),
    temperature: legacyTemperatureFromKelvin(sample.temperatureK),
    water: legacyWaterAxis(sample.humidity, sample.elevationM, sample.seaLevelM, roughnessM),
    vegetation: sample.biome === "ocean" ? 0 : clamp(sample.soilMoisture * 0.8, 0, 1),
    terrain: sample.biome,
    riverFlow: sample.riverFlow,
    isLake: sample.isLake,
    // Already included in `temperature`; exposed only for seasonal-damping genes.
    seasonalOffset: sample.seasonalOffsetK,
  };
}
