/**
 * SIMULATION_HEURISTIC
 *
 * Hysteresis and cooldown prevent rapid oscillation between adjacent biomes
 * when suitability scores are nearly tied.
 */

import type { TerrainType } from "../contracts";
import { clamp } from "../units";
import { type BiomeScores, highestBiome } from "./classifier";

export interface BiomeMemory {
  biome: TerrainType;
  tick: number;
  stability: number;
}

export interface BiomeDecision {
  biome: TerrainType;
  stability: number;
  changed: boolean;
}

export const BIOME_HYSTERESIS = 0.15;
export const BIOME_COOLDOWN_TICKS = 8;

export function updateBiome(
  scores: BiomeScores,
  tick: number,
  memory?: BiomeMemory,
  hysteresis = BIOME_HYSTERESIS,
  cooldownTicks = BIOME_COOLDOWN_TICKS,
): BiomeDecision {
  const candidate = highestBiome(scores);
  if (!memory) return { biome: candidate, stability: 1, changed: true };

  const withinCooldown = tick - memory.tick < cooldownTicks;
  const margin = scores[candidate] - scores[memory.biome];
  const shouldSwitch = !withinCooldown && margin > hysteresis;
  const biome = shouldSwitch ? candidate : memory.biome;
  const targetStability = clamp(margin / Math.max(hysteresis, 1e-6), 0, 1);
  const stability = clamp(memory.stability * 0.8 + targetStability * 0.2, 0, 1);

  return { biome, stability, changed: biome !== memory.biome };
}
