/**
 * SIMULATION_HEURISTIC
 *
 * Hysteresis and cooldown prevent rapid oscillation between adjacent biomes
 * when suitability scores are nearly tied. Memory is engine-owned and
 * serializable, so consecutive snapshots see the same classification history.
 */

import type { TerrainType } from "../contracts";
import { clamp } from "../units";
import { type BiomeScores, highestBiome } from "./classifier";

export interface BiomeMemory {
  biome: TerrainType;
  tick: number;
  stability: number;
}

export interface SerializedBiomeMemory extends BiomeMemory {
  index: number;
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

/**
 * Explicit, serializable per-cell biome memory. Snapshots receive a shared
 * instance from the engine and never create their own empty memory.
 */
export class BiomeMemoryStore {
  private readonly records = new Map<number, BiomeMemory>();

  get(index: number): BiomeMemory | undefined {
    return this.records.get(index);
  }

  set(index: number, record: BiomeMemory): void {
    this.records.set(index, { ...record });
  }

  commit(index: number, decision: BiomeDecision, tick: number): BiomeMemory {
    const next: BiomeMemory = {
      biome: decision.biome,
      tick,
      stability: decision.stability,
    };
    this.records.set(index, next);
    return next;
  }

  clear(): void {
    this.records.clear();
  }

  toJSON(): SerializedBiomeMemory[] {
    return [...this.entries()].map(([index, record]) => ({ index, ...record }));
  }

  static fromJSON(records: readonly SerializedBiomeMemory[]): BiomeMemoryStore {
    const store = new BiomeMemoryStore();
    for (const record of records) store.set(record.index, record);
    return store;
  }

  entries(): ReadonlyMap<number, BiomeMemory> {
    return this.records;
  }
}
