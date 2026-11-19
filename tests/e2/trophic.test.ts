import { describe, expect, it } from "vitest";
import { makeRun, makeSample } from "./fixtures";
import {
  resampleResult,
  seriesStability,
  trophicPersistence,
  trophicSeriesSet,
  trophicStability,
  truncateResult,
} from "../../tools/e2/trophic";

const samples = [
  makeSample({
    tick: 0, population: 100, organismsSampled: 100,
    carnivoreFraction: 0.2, herbivoreFraction: 0.8,
    predationKills: 0, cumulativePredationKills: 0, predationPressure: 0,
    occupiedVegetation: 0.5, occupiedLandFraction: 0.8,
  }),
  makeSample({
    tick: 10, population: 100, organismsSampled: 100,
    carnivoreFraction: 0.4, herbivoreFraction: 0.6,
    predationKills: 3, cumulativePredationKills: 12, predationPressure: 0.03,
    occupiedVegetation: 0.4, occupiedLandFraction: 0.75,
  }),
  makeSample({
    tick: 20, population: 100, organismsSampled: 100,
    carnivoreFraction: 0.6, herbivoreFraction: 0.4,
    predationKills: 5, cumulativePredationKills: 30, predationPressure: 0.05,
    occupiedVegetation: 0.3, occupiedLandFraction: 0.7,
  }),
] as ReturnType<typeof makeSample>[];

describe("E2.2 trophic observability", () => {
  it("derives trait counts, kill snapshots and interval kill rates", () => {
    const result = makeRun("S06_predator_prey_mixed", 1, samples);
    const series = trophicSeriesSet(result);
    expect(series.herbivore.map((point) => point.value)).toEqual([80, 60, 40]);
    expect(series.carnivore.map((point) => point.value)).toEqual([20, 40, 60]);
    expect(series.killsPerTick.map((point) => point.value)).toEqual([0, 3, 5]);
    expect(series.killsCumulative.map((point) => point.value)).toEqual([0, 12, 30]);
    expect(series.killsIntervalRate).toEqual([
      { tick: 10, value: 1.2 },
      { tick: 20, value: 1.8 },
    ]);
    expect(series.vegetation.map((point) => point.value)).toEqual([0.5, 0.4, 0.3]);
  });

  it("reports trait-group persistence without claiming individual roles", () => {
    const result = makeRun("S06_predator_prey_mixed", 2, [
      makeSample({ tick: 0, population: 10, carnivoreFraction: 0.3, herbivoreFraction: 0.7, cumulativePredationKills: 0 }),
      makeSample({ tick: 10, population: 10, carnivoreFraction: 0.2, herbivoreFraction: 0.8, cumulativePredationKills: 1 }),
      makeSample({ tick: 20, population: 10, carnivoreFraction: 0, herbivoreFraction: 1, cumulativePredationKills: 1 }),
    ]);
    const persistence = trophicPersistence(result);
    expect(persistence.sampledTicks).toBe(3);
    expect(persistence.herbivore.presentTicks).toBe(3);
    expect(persistence.herbivore.extinctionTick).toBeNull();
    expect(persistence.carnivore.presentTicks).toBe(2);
    expect(persistence.carnivore.extinctionTick).toBe(20);
    expect(persistence.carnivore.finalCount).toBe(0);
    expect(persistence.coexistenceTicks).toBe(2);
    expect(persistence.coexistenceFraction).toBeCloseTo(0.666667, 6);
    expect(persistence.firstTraitLossGroup).toBe("carnivore");
    expect(persistence.firstTraitLossTick).toBe(20);
  });

  it("computes stability summaries and handles constant series", () => {
    const constant = [0, 10, 20].map((tick) => ({ tick, value: 5 }));
    const stability = seriesStability(constant);
    expect(stability.n).toBe(3);
    expect(stability.mean).toBe(5);
    expect(stability.sd).toBe(0);
    expect(stability.cv).toBe(0);
    expect(stability.lag1).toBeNull();
    expect(stability.trendSlope).toBe(0);
    expect(stability.oscillation.range).toBe(0);

    const increasing = [0, 10, 20, 30].map((tick) => ({ tick, value: tick / 10 }));
    const trend = seriesStability(increasing);
    expect(trend.trendSlope).toBeCloseTo(0.1, 6);
    expect(trend.oscillation.directionChanges).toBe(0);
  });

  it("exposes stability for every observable trophic series", () => {
    const result = makeRun("S06_predator_prey_mixed", 3, samples);
    const stability = trophicStability(result);
    expect(Object.keys(stability).sort()).toEqual([
      "carnivore", "herbivore", "killsCumulative", "killsIntervalRate", "killsPerTick", "total", "vegetation",
    ]);
    expect(stability.killsIntervalRate.mean).toBeCloseTo(1.5, 6);
    expect(stability.carnivore.trendSlope).toBeCloseTo(2, 6);
  });

  it("resamples and truncates runs for sensitivity analysis", () => {
    const result = makeRun("S06_predator_prey_mixed", 4, [
      ...samples,
      makeSample({ tick: 30, population: 100, carnivoreFraction: 0.5, herbivoreFraction: 0.5, cumulativePredationKills: 42 }),
    ]);
    expect(resampleResult(result, 20).samples.map((sample) => sample.tick)).toEqual([0, 20]);
    const truncated = truncateResult(result, 10);
    expect(truncated.samples.map((sample) => sample.tick)).toEqual([0, 10]);
    expect(truncated.ticks).toBe(10);
    expect(() => resampleResult(result, 0)).toThrow();
    expect(() => truncateResult(result, -1)).toThrow();
  });
});
