import { describe, it, expect } from "vitest";
import { sampleHistoryPoint, maybeAppendHistory, HISTORY_SAMPLE_INTERVAL_TICKS, HISTORY_MAX_POINTS } from "../lib/historyAccumulation";
import type { RenderFrame } from "../types";

function fakeFrame(overrides: Partial<RenderFrame> = {}): RenderFrame {
  return {
    tick: 100,
    year: 0,
    stats: {
      tick: 100,
      year: 0,
      season: "primavera",
      population: 250,
      speciesCount: 2,
      speciesAlive: 2,
      speciesTotalEver: 3,
      speciesExtinct: 1,
      averageGenome: {
        size: 1.2,
        speed: 1.1,
        metabolism: 1,
        vision: 5,
        fertility: 0.5,
        lifespan: 500,
        carnivory: 0.3,
        preferredTemperature: 20,
        temperatureTolerance: 10,
        preferredWater: 0.5,
        waterTolerance: 0.3,
        evasion: 0.2,
        huntingSkill: 0.2,
      },
      births: 5,
      deaths: 3,
      predationKills: 1,
    },
    planetWidth: 2,
    planetHeight: 2,
    // v1.1 — RenderFrame no longer carries the full per-cell vegetation
    // grid (see simulation/core/renderFrame.ts); avgVegetation is now
    // computed worker-side and sent as a plain scalar.
    avgVegetation: 0.5,
    organismsX: new Float32Array(0),
    organismsY: new Float32Array(0),
    organismsSpecies: new Uint16Array(0),
    organismsSize: new Float32Array(0),
    organismsSpeed: new Float32Array(0),
    organismsCarnivory: new Float32Array(0),
    organismsVision: new Float32Array(0),
    organismsEvasion: new Float32Array(0),
    organismsHuntingSkill: new Float32Array(0),
    organismsId: new Uint32Array(0),
    speciesTree: [],
    speciesGenomeStats: [],
    ...overrides,
  };
}

describe("sampleHistoryPoint", () => {
  it("captures tick, year, population, and species count from the frame", () => {
    const point = sampleHistoryPoint(fakeFrame({ tick: 800, year: 2 }));
    expect(point.tick).toBe(800);
    expect(point.year).toBe(2);
    expect(point.population).toBe(250);
    expect(point.speciesAlive).toBe(2);
  });

  it("computes average vegetation across the grid", () => {
    const point = sampleHistoryPoint(fakeFrame());
    expect(point.avgVegetation).toBeCloseTo(0.5, 5);
  });

  it("pulls avgCarnivory/avgSize from stats.averageGenome, defaulting to 0 when null", () => {
    const withGenome = sampleHistoryPoint(fakeFrame());
    expect(withGenome.avgCarnivory).toBeCloseTo(0.3, 5);
    expect(withGenome.avgSize).toBeCloseTo(1.2, 5);

    const frame = fakeFrame();
    frame.stats = { ...frame.stats, averageGenome: null };
    const withoutGenome = sampleHistoryPoint(frame);
    expect(withoutGenome.avgCarnivory).toBe(0);
    expect(withoutGenome.avgSize).toBe(0);
  });

  it("computes biodiversity from speciesGenomeStats population shares", () => {
    const frame = fakeFrame({
      speciesGenomeStats: [
        { speciesId: 1, population: 50, genomeStats: {} as never, distanceFromParentOrigin: null, distanceFromOtherSpecies: [] },
        { speciesId: 2, population: 50, genomeStats: {} as never, distanceFromParentOrigin: null, distanceFromOtherSpecies: [] },
      ],
    });
    const point = sampleHistoryPoint(frame);
    expect(point.biodiversity).toBeCloseTo(Math.log(2), 5);
  });
});

describe("maybeAppendHistory", () => {
  it("appends a first sample to an empty history", () => {
    const result = maybeAppendHistory([], fakeFrame({ tick: 0 }));
    expect(result).toHaveLength(1);
  });

  it("does not append when fewer than HISTORY_SAMPLE_INTERVAL_TICKS have passed since the last sample", () => {
    const first = maybeAppendHistory([], fakeFrame({ tick: 0 }));
    const second = maybeAppendHistory(first, fakeFrame({ tick: HISTORY_SAMPLE_INTERVAL_TICKS - 1 }));
    expect(second).toBe(first); // same reference: no new sample taken
    expect(second).toHaveLength(1);
  });

  it("appends once at least HISTORY_SAMPLE_INTERVAL_TICKS have passed", () => {
    const first = maybeAppendHistory([], fakeFrame({ tick: 0 }));
    const second = maybeAppendHistory(first, fakeFrame({ tick: HISTORY_SAMPLE_INTERVAL_TICKS }));
    expect(second).toHaveLength(2);
    expect(second).not.toBe(first);
  });

  it("decimates (halves) the history once it exceeds HISTORY_MAX_POINTS", () => {
    let history = Array.from({ length: HISTORY_MAX_POINTS }, (_, i) => sampleHistoryPoint(fakeFrame({ tick: i * HISTORY_SAMPLE_INTERVAL_TICKS })));
    const nextTick = HISTORY_MAX_POINTS * HISTORY_SAMPLE_INTERVAL_TICKS;
    history = maybeAppendHistory(history, fakeFrame({ tick: nextTick }));
    // After exceeding the cap, decimation keeps roughly half.
    expect(history.length).toBeLessThan(HISTORY_MAX_POINTS);
    expect(history.length).toBeGreaterThan(HISTORY_MAX_POINTS / 2 - 2);
  });

  it("keeps chronological order after decimation", () => {
    let history = Array.from({ length: HISTORY_MAX_POINTS }, (_, i) => sampleHistoryPoint(fakeFrame({ tick: i * HISTORY_SAMPLE_INTERVAL_TICKS })));
    history = maybeAppendHistory(history, fakeFrame({ tick: HISTORY_MAX_POINTS * HISTORY_SAMPLE_INTERVAL_TICKS }));
    for (let i = 1; i < history.length; i++) {
      expect(history[i].tick).toBeGreaterThan(history[i - 1].tick);
    }
  });
});
