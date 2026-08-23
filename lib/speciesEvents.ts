import type { SpeciesRecord } from "../types";
import { TICKS_PER_YEAR } from "../simulation/core/constants";

/**
 * v1.0.3 — Osservazione storica. A single notable event in a planet's
 * evolutionary history: either a species coming into existence (either the
 * founding population at world creation, or a new species splitting off
 * via speciation) or a species going extinct.
 */
export interface SpeciesEvent {
  tick: number;
  year: number;
  type: "origin" | "extinction";
  speciesId: number;
  parentSpeciesId: number | null;
}

/**
 * Builds a chronological event timeline directly from the species
 * registry — every SpeciesRecord has carried originTick/extinctionTick
 * since v0.2.1, so this needs no new engine data at all, just a
 * transformation of data that already exists. Sorted most-recent-first.
 */
export function buildEventTimeline(records: SpeciesRecord[]): SpeciesEvent[] {
  const events: SpeciesEvent[] = [];
  for (const r of records) {
    events.push({
      tick: r.originTick,
      year: r.originYear,
      type: "origin",
      speciesId: r.speciesId,
      parentSpeciesId: r.parentSpeciesId,
    });
    if (r.extinctionTick !== null) {
      events.push({
        tick: r.extinctionTick,
        year: Math.floor(r.extinctionTick / TICKS_PER_YEAR),
        type: "extinction",
        speciesId: r.speciesId,
        parentSpeciesId: r.parentSpeciesId,
      });
    }
  }
  return events.sort((a, b) => b.tick - a.tick);
}
