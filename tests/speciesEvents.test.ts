import { describe, it, expect } from "vitest";
import { buildEventTimeline } from "../lib/speciesEvents";
import { TICKS_PER_YEAR } from "../simulation/core/constants";
import type { Genome, SpeciesRecord } from "../types";

const dummyGenome = {} as Genome; // originGenomeSnapshot content is irrelevant to timeline logic

function record(overrides: Partial<SpeciesRecord>): SpeciesRecord {
  return {
    speciesId: 1,
    parentSpeciesId: null,
    originTick: 0,
    originYear: 0,
    population: 10,
    alive: true,
    extinctionTick: null,
    originGenomeSnapshot: dummyGenome,
    ...overrides,
  };
}

describe("buildEventTimeline", () => {
  it("produces one origin event for a founding species with no extinction", () => {
    const events = buildEventTimeline([record({ speciesId: 1 })]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("origin");
    expect(events[0].parentSpeciesId).toBeNull();
  });

  it("produces both an origin and an extinction event for an extinct species", () => {
    const events = buildEventTimeline([record({ speciesId: 1, originTick: 200, extinctionTick: 4000 })]);
    expect(events).toHaveLength(2);
    const types = events.map((e) => e.type).sort();
    expect(types).toEqual(["extinction", "origin"]);
  });

  it("computes the extinction event's year from its tick using TICKS_PER_YEAR", () => {
    const tick = TICKS_PER_YEAR * 3 + 50;
    const events = buildEventTimeline([record({ speciesId: 1, extinctionTick: tick })]);
    const extinction = events.find((e) => e.type === "extinction")!;
    expect(extinction.year).toBe(3);
  });

  it("sorts events most-recent-first across multiple species", () => {
    const records = [
      record({ speciesId: 1, originTick: 0 }),
      record({ speciesId: 2, originTick: 500, parentSpeciesId: 1 }),
      record({ speciesId: 1, originTick: 0, extinctionTick: 2000 }),
    ];
    const events = buildEventTimeline(records);
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1].tick).toBeGreaterThanOrEqual(events[i].tick);
    }
  });

  it("preserves parentSpeciesId on origin events for speciation, distinguishing from founding species", () => {
    const events = buildEventTimeline([record({ speciesId: 2, parentSpeciesId: 1, originTick: 800 })]);
    expect(events[0].parentSpeciesId).toBe(1);
  });

  it("returns an empty list for an empty registry", () => {
    expect(buildEventTimeline([])).toEqual([]);
  });
});
