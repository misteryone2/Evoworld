/**
 * SIMULATION_HEURISTIC
 *
 * Hysteresis and cooldown prevent rapid oscillation between adjacent biomes
 * when suitability scores are nearly tied. Memory is engine-owned and
 * serializable, so consecutive snapshots see the same classification history.
 */

import type { TerrainType } from "../contracts";
import { PlanetInvariantError } from "../core/invariants";
import { clamp } from "../units";
import { type BiomeInput, biomeScores, type BiomeScores, highestBiome } from "./classifier";

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

/** Public read-only surface of the engine-owned biome memory. */
export interface ReadonlyBiomeMemory {
  readonly size: number;
  get(index: number): Readonly<BiomeMemory> | undefined;
  view(): ReadonlyMap<number, Readonly<BiomeMemory>>;
  entries(): ReadonlyMap<number, Readonly<BiomeMemory>>;
  toJSON(): SerializedBiomeMemory[];
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
 * Single source of truth for a per-cell biome decision. Both the runtime
 * (which owns memory commits) and snapshots (which are pure readers) call it,
 * so a read can never diverge from the committed history.
 */
export function decideBiome(
  input: Omit<BiomeInput, "climateStability">,
  tick: number,
  memory?: BiomeMemory,
): BiomeDecision {
  return updateBiome(
    biomeScores({ ...input, climateStability: memory?.stability ?? 1 }),
    tick,
    memory,
  );
}

/**
 * Explicit, serializable per-cell biome memory. The engine owns all writes;
 * snapshots receive only a frozen read-only view.
 */
export class BiomeMemoryStore implements ReadonlyBiomeMemory {
  private readonly records = new Map<number, BiomeMemory>();

  get size(): number {
    return this.records.size;
  }

  get(index: number): BiomeMemory | undefined {
    return this.records.get(index);
  }

  set(index: number, record: BiomeMemory): void {
    this.records.set(index, { ...record });
  }

  /** Frozen defensive view: safe for historical snapshots to retain. */
  view(): ReadonlyMap<number, Readonly<BiomeMemory>> {
    const frozen = new Map<number, Readonly<BiomeMemory>>();
    for (const [index, record] of this.records) frozen.set(index, Object.freeze({ ...record }));
    return frozen;
  }

  /**
   * Monotonic write. A decision computed for an older tick can never overwrite
   * a newer record, even if a stale caller attempts it.
   */
  commit(index: number, decision: BiomeDecision, tick: number): BiomeMemory {
    if (!Number.isInteger(tick) || tick < 0) {
      throw new PlanetInvariantError("biome memory commit requires a non-negative integer tick");
    }
    const existing = this.records.get(index);
    if (existing && existing.tick > tick) return { ...existing };
    const next: BiomeMemory = {
      biome: decision.biome,
      tick,
      stability: clamp(decision.stability, 0, 1),
    };
    this.records.set(index, next);
    return { ...next };
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

/**
 * Frozen adapter returned to snapshots and external consumers. It deliberately
 * exposes no `set`, `commit`, `clear` or raw map, so only the engine can write.
 */
export function readonlyBiomeMemory(store: BiomeMemoryStore): ReadonlyBiomeMemory {
  return Object.freeze({
    get size(): number {
      return store.size;
    },
    get(index: number): Readonly<BiomeMemory> | undefined {
      const record = store.get(index);
      return record ? Object.freeze({ ...record }) : undefined;
    },
    view(): ReadonlyMap<number, Readonly<BiomeMemory>> {
      return store.view();
    },
    entries(): ReadonlyMap<number, Readonly<BiomeMemory>> {
      return store.view();
    },
    toJSON(): SerializedBiomeMemory[] {
      return store.toJSON();
    },
  });
}
