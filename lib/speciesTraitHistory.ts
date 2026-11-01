import type { RenderFrame, SpeciesRecord } from "../types";
import type { CreatureTraits } from "./creatureAnatomy";

/**
 * v1.5.0 — Creature 3D, "evoluzione nel tempo". Remembers, client-side, how
 * each species' typical body (its mean traits) looked at various moments, so
 * the species panel can show a species' shape changing across the years.
 * Pure aggregation of data already in every RenderFrame — no new engine
 * computation, same approach as lib/historyAccumulation.ts.
 */

export interface SpeciesSnapshot {
  tick: number;
  year: number;
  traits: CreatureTraits;
}

/** Minimum ticks between two remembered snapshots of the same species. */
export const TRAIT_SNAPSHOT_INTERVAL_TICKS = 200;
/** Cap on snapshots kept per species; past it, every other one is dropped (first and last always survive). */
export const TRAIT_SNAPSHOT_MAX = 40;

export type SpeciesTraitStore = Map<number, SpeciesSnapshot[]>;

/** Records one snapshot per living species if enough ticks have passed since its last one. Mutates `store`. */
export function recordSpeciesSnapshots(store: SpeciesTraitStore, frame: RenderFrame): void {
  for (const s of frame.speciesGenomeStats) {
    const list = store.get(s.speciesId) ?? [];
    if (list.length > 0 && frame.tick < list[list.length - 1].tick) list.length = 0; // the world was reset or replaced: start over
    const last = list[list.length - 1];
    if (last && frame.tick - last.tick < TRAIT_SNAPSHOT_INTERVAL_TICKS) continue;
    const g = s.genomeStats;
    list.push({
      tick: frame.tick,
      year: frame.year,
      traits: {
        speed: g.speed.mean,
        carnivory: g.carnivory.mean,
        vision: g.vision.mean,
        evasion: g.evasion.mean,
        huntingSkill: g.huntingSkill.mean,
      },
    });
    if (list.length > TRAIT_SNAPSHOT_MAX) {
      const kept = list.filter((_, i) => i % 2 === 0 || i === list.length - 1);
      list.length = 0;
      list.push(...kept);
    }
    store.set(s.speciesId, list);
  }
}

/** The species' body at the moment it appeared: its frozen origin genome. */
export function originSnapshot(record: SpeciesRecord): SpeciesSnapshot {
  const g = record.originGenomeSnapshot;
  return {
    tick: record.originTick,
    year: record.originYear,
    traits: { speed: g.speed, carnivory: g.carnivory, vision: g.vision, evasion: g.evasion, huntingSkill: g.huntingSkill },
  };
}

/**
 * Picks up to `count` evenly spaced moments from a species' life, always
 * starting with its origin and ending with its latest known form
 * (`current` for a living species, else its last remembered snapshot).
 */
export function buildTimeline(
  record: SpeciesRecord,
  snapshots: SpeciesSnapshot[],
  current: SpeciesSnapshot | null,
  count = 5,
): SpeciesSnapshot[] {
  const origin = originSnapshot(record);
  const between = snapshots.filter((s) => s.tick > origin.tick);
  const all: SpeciesSnapshot[] = [origin, ...between];
  if (current && current.tick > all[all.length - 1].tick) all.push(current);

  if (all.length <= count) return all;
  const picked: SpeciesSnapshot[] = [];
  for (let k = 0; k < count; k++) {
    picked.push(all[Math.round((k * (all.length - 1)) / (count - 1))]);
  }
  return picked;
}
