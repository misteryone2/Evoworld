/**
 * E1.3 — test del confronto prima/dopo: solo le metriche spaziali possono
 * cambiare; popolazioni, eventi e regole biologiche devono restare identici.
 */
import { describe, expect, it } from "vitest";
import { compareRunResults } from "../../tools/e1/comparison";
import type { RunResult } from "../../tools/e1/runner";
import type { E1Sample } from "../../tools/e1/metrics";

function sample(tick: number, population: number, vegetation: number): E1Sample {
  return {
    tick,
    population,
    births: 2,
    deaths: 1,
    predationKills: 0,
    cumulativeBirths: tick * 2,
    cumulativeDeaths: tick,
    speciesTotalEver: 1,
    occupiedVegetation: vegetation,
    occupiedLandFraction: 1,
    organismsSampled: population,
    occupiedCellsSampled: 3,
  } as E1Sample;
}

function result(seed: number, vegetation: number, population = 20): RunResult {
  return {
    scenario: "S09_poor_habitat",
    description: "comparison test",
    seed,
    width: 128,
    height: 128,
    initialPopulation: 150,
    ticks: 900,
    sampleEvery: 50,
    setup: "poorHabitat",
    setupInfo: { kind: "poorHabitat" },
    perturbation: null,
    perturbationReport: null,
    options: undefined,
    completedTicks: 900,
    extinctAt: null,
    elapsedMs: 1000,
    samples: [sample(0, population, vegetation), sample(50, population + 1, vegetation)],
  };
}

describe("E1.3 — confronto prima/dopo la correzione spaziale", () => {
  it("identifica le differenze spaziali e conferma l'invarianza biologica", () => {
    const before = [result(1, 0.4), result(2, 0.5)];
    const after = [result(1, 0.6), result(2, 0.7)];
    const report = compareRunResults(before, after);

    expect(report.biologicalInvariance).toBe(true);
    expect(report.nonSpatialMismatches).toEqual([]);
    expect(report.matchedRuns).toBe(2);
    expect(report.comparedSamples).toBe(4);
    expect(report.spatialChangesFound).toBe(true);
    const vegetation = report.spatial.find((s) => s.field === "occupiedVegetation")!;
    expect(vegetation.changedRuns).toBe(2);
    expect(vegetation.changedSamples).toBe(4);
    expect(vegetation.maxAbsDelta).toBeCloseTo(0.2, 6);
    const other = report.spatial.find((s) => s.field === "organismsSampled")!;
    expect(other.changedSamples).toBe(0);
  });

  it("segnala come errore ogni differenza non spaziale", () => {
    const before = [result(1, 0.4)];
    const after = [{
      ...result(1, 0.4),
      samples: [{ ...sample(0, 20, 0.4), births: 99 }, sample(50, 21, 0.4)],
    }];
    const report = compareRunResults(before, after as RunResult[]);
    expect(report.biologicalInvariance).toBe(false);
    expect(report.nonSpatialMismatches.length).toBeGreaterThan(0);
    const mismatch = report.nonSpatialMismatches[0];
    expect(mismatch.path).toContain("samples[0]");
    expect(mismatch.before).toContain('"births":2');
    expect(mismatch.after).toContain('"births":99');
  });

  it("segnala corse mancanti o in eccesso", () => {
    const report = compareRunResults([result(1, 0.4), result(2, 0.5)], [result(1, 0.4)]);
    expect(report.biologicalInvariance).toBe(false);
    expect(report.missingInAfter).toEqual(["S09_poor_habitat|2"]);
  });

  it("nessuna differenza spaziale viene inventata se i dati sono identici", () => {
    const report = compareRunResults([result(1, 0.4)], [result(1, 0.4)]);
    expect(report.biologicalInvariance).toBe(true);
    expect(report.spatialChangesFound).toBe(false);
  });
});
