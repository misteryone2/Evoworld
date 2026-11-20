/**
 * SIMULATION_HEURISTIC
 *
 * Continuous biome suitability. Latitude is deliberately absent: it can only
 * influence a biome through temperature, insolation and seasonality.
 */

import type { TerrainType } from "../contracts";
import { clamp } from "../units";

export type BiomeScores = Record<TerrainType, number>;

export interface BiomeInput {
  temperatureK: number;
  precipitationMPerYear: number;
  humidity: number;
  elevationM: number;
  seaLevelM: number;
  slope: number;
  soilMoisture: number;
  climateStability: number;
  iceFraction: number;
}

export const BIOME_ORDER: readonly TerrainType[] = [
  "ocean", "mountain", "plains", "desert", "forest", "tundra", "savanna",
];

function gaussian(value: number, center: number, width: number): number {
  const z = (value - center) / Math.max(width, 1e-6);
  return Math.exp(-0.5 * z * z);
}

export function biomeScores(input: BiomeInput): BiomeScores {
  const heightM = Math.max(0, input.elevationM - input.seaLevelM);
  const wet = clamp(input.humidity, 0, 1);
  const soil = clamp(input.soilMoisture, 0, 1);
  const stability = clamp(input.climateStability, 0, 1);
  const ice = clamp(input.iceFraction, 0, 1);
  const precipitation = Math.max(0, input.precipitationMPerYear);

  const cold = clamp((283.15 - input.temperatureK) / 30, 0, 1);
  const warm = clamp((input.temperatureK - 278.15) / 25, 0, 1);
  const dry = clamp((750 - precipitation) / 750, 0, 1);
  const moist = clamp(precipitation / 1500, 0, 1);

  return {
    ocean: input.elevationM < input.seaLevelM ? 3 : 0,
    mountain: clamp(heightM / 3000, 0, 1) * 1.6 + clamp(input.slope, 0, 1) * 1.2 + cold * 0.3,
    plains: 0.45 + gaussian(input.temperatureK, 288, 20) * 0.6 + gaussian(precipitation, 700, 500) * 0.5,
    desert: dry * 1.7 + warm * 0.25 - wet * 0.8 - soil * 0.5,
    forest: warm * 0.9 + moist * 1.5 + soil * 0.8 + stability * 0.35 + gaussian(precipitation, 1400, 700) * 0.4,
    tundra: cold * 1.6 + ice * 1.8 + dry * 0.2,
    savanna: warm * 0.9 + gaussian(precipitation, 900, 500) * 1.2 + (1 - stability) * 0.25,
  };
}

export function highestBiome(scores: BiomeScores): TerrainType {
  let best: TerrainType = BIOME_ORDER[0];
  let bestScore = -Infinity;
  for (const biome of BIOME_ORDER) {
    if (scores[biome] > bestScore) {
      best = biome;
      bestScore = scores[biome];
    }
  }
  return best;
}

export function classifyBiome(input: BiomeInput): TerrainType {
  return highestBiome(biomeScores(input));
}
