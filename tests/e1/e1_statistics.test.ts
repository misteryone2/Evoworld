/**
 * E1.3 — test delle statistiche appaiate per seed. Verificano che il disegno
 * appaiato venga usato davvero (differenze individuali), non una differenza
 * tra medie indipendenti.
 */
import { describe, expect, it } from "vitest";
import {
  buildPhase2Report,
  pairedDifference,
  seedValues,
  type PairedComparison,
  type SeedValue,
} from "../../tools/e1/statistics";
import type { RunResult } from "../../tools/e1/runner";
import type { E1Sample } from "../../tools/e1/metrics";

const meta = { label: "confronto", description: "confronto appaiato di test" };

function run(seed: number, scenario: string, population: number): RunResult {
  const sample = { tick: 900, population, speciesTotalEver: 1, perturbationRemoved: 0 } as E1Sample;
  return {
    scenario,
    description: "fake run",
    seed,
    width: 128,
    height: 128,
    initialPopulation: 150,
    ticks: 900,
    sampleEvery: 50,
    setup: "baseline",
    setupInfo: { kind: "baseline" },
    perturbation: null,
    perturbationReport: null,
    options: undefined,
    completedTicks: 900,
    extinctAt: null,
    elapsedMs: 0,
    samples: [sample],
  };
}

describe("E1.3 — differenze appaiate per seed", () => {
  it("coppie complete: differenze individuali, media, SD, min/max, IC95 e validPairs", () => {
    const a: SeedValue[] = [{ seed: 1, value: 20 }, { seed: 2, value: 22 }, { seed: 3, value: 18 }];
    const b: SeedValue[] = [{ seed: 1, value: 10 }, { seed: 2, value: 12 }, { seed: 3, value: 13 }];
    const r = pairedDifference(a, b, meta);

    expect(r.pairs).toEqual([
      { seed: 1, a: 20, b: 10, difference: 10 },
      { seed: 2, a: 22, b: 12, difference: 10 },
      { seed: 3, a: 18, b: 13, difference: 5 },
    ]);
    expect(r.validPairs).toBe(3);
    expect(r.meanDifference).toBeCloseTo(25 / 3, 4);
    const expectedSd = Math.sqrt(((10 - 25 / 3) ** 2 + (10 - 25 / 3) ** 2 + (5 - 25 / 3) ** 2) / 2);
    expect(r.sd).toBeCloseTo(expectedSd, 4);
    expect(r.min).toBe(5);
    expect(r.max).toBe(10);
    expect(r.ci95).not.toBeNull();
    const half = (4.303 * expectedSd) / Math.sqrt(3); // t(0.95, 2 df) = 4.303
    expect(r.ci95!.low).toBeCloseTo(25 / 3 - half, 3);
    expect(r.ci95!.high).toBeCloseTo(25 / 3 + half, 3);
    expect(r.missingInA).toEqual([]);
    expect(r.missingInB).toEqual([]);
  });

  it("coppie incomplete: usa l'intersezione e dichiara i seed mancanti", () => {
    const a: SeedValue[] = [{ seed: 1, value: 5 }, { seed: 2, value: 7 }, { seed: 3, value: 9 }];
    const b: SeedValue[] = [{ seed: 2, value: 3 }, { seed: 3, value: 4 }, { seed: 4, value: 100 }];
    const r = pairedDifference(a, b, meta);

    expect(r.pairs.map((p) => p.seed)).toEqual([2, 3]);
    expect(r.validPairs).toBe(2);
    expect(r.pairs.map((p) => p.difference)).toEqual([4, 5]);
    expect(r.missingInA).toEqual([4]);
    expect(r.missingInB).toEqual([1]);
  });

  it("nessuna coppia valida: IC95 assente e nessuna media inventata", () => {
    const r = pairedDifference([{ seed: 1, value: 3 }, { seed: 2, value: 4 }], [{ seed: 3, value: 9 }], meta);
    expect(r.validPairs).toBe(0);
    expect(r.pairs).toEqual([]);
    expect(r.ci95).toBeNull();
    expect(r.meanDifference).toBe(0);
    expect(r.missingInA).toEqual([3]);
    expect(r.missingInB).toEqual([1, 2]);
  });

  it("una sola coppia: SD zero e IC95 non calcolabile", () => {
    const r = pairedDifference([{ seed: 1, value: 8 }], [{ seed: 1, value: 3 }], meta);
    expect(r.validPairs).toBe(1);
    expect(r.pairs[0].difference).toBe(5);
    expect(r.sd).toBe(0);
    expect(r.ci95).toBeNull();
  });

  it("seed duplicati sono un errore in entrambi i gruppi", () => {
    expect(() => pairedDifference(
      [{ seed: 1, value: 2 }, { seed: 1, value: 3 }],
      [{ seed: 1, value: 1 }],
      meta,
    )).toThrow(/seed duplicati.*A/);
    expect(() => pairedDifference(
      [{ seed: 1, value: 2 }],
      [{ seed: 2, value: 1 }, { seed: 2, value: 5 }],
      meta,
    )).toThrow(/seed duplicati.*B/);
  });

  it("risultati non ordinati producono lo stesso risultato (e sono riproducibili)", () => {
    const a: SeedValue[] = [{ seed: 5, value: 15 }, { seed: 1, value: 11 }, { seed: 3, value: 19 }];
    const b: SeedValue[] = [{ seed: 3, value: 10 }, { seed: 5, value: 12 }, { seed: 1, value: 9 }];
    const expected = pairedDifference(a, b, meta);
    expect(pairedDifference([...a].reverse(), [...b].reverse(), meta)).toEqual(expected);
    expect(pairedDifference(a, b, meta)).toEqual(expected);
    expect(expected.pairs.map((p) => p.seed)).toEqual([1, 3, 5]);
  });

  it("seedValues estrae il valore per seed senza richiedere ordini particolari", () => {
    const runs = [run(3, "S09_poor_habitat", 12), run(1, "S09_poor_habitat", 10)];
    expect(seedValues(runs)).toEqual([{ seed: 3, value: 12 }, { seed: 1, value: 10 }]);
  });

  it("buildPhase2Report include tutti e cinque i confronti appaiati richiesti", () => {
    const ids = [
      "S01_stability_baseline",
      "S06_predator_prey_mixed",
      "S08_recovery_after_cull80",
      "S09_poor_habitat",
      "S10_rich_habitat",
      "S13_poor_position_rich_resources",
      "S14_rich_position_poor_resources",
    ];
    const values: Record<string, number[]> = {
      S01_stability_baseline: [20, 22, 24],
      S06_predator_prey_mixed: [30, 31, 29],
      S08_recovery_after_cull80: [15, 16, 14],
      S09_poor_habitat: [10, 11, 12],
      S10_rich_habitat: [25, 26, 27],
      S13_poor_position_rich_resources: [14, 15, 16],
      S14_rich_position_poor_resources: [18, 19, 20],
    };
    const results: RunResult[] = [];
    for (const id of ids) {
      for (const [i, seed] of [1, 2, 3].entries()) results.push(run(seed, id, values[id][i]));
    }
    const report = buildPhase2Report(results, { ticks: 900, sampleEvery: 50, seeds: [1, 2, 3] });
    const paired = report.pairedComparisons as PairedComparison[];

    expect(paired.map((p) => p.label)).toEqual([
      "resource_effect_at_poor_positions",
      "resource_effect_at_rich_positions",
      "position_effect_with_poor_resources",
      "position_effect_with_rich_resources",
      "cull_effect_S08_minus_S01",
    ]);
    expect(paired.every((p) => p.validPairs === 3 && p.pairs.length === 3 && p.ci95 !== null)).toBe(true);
    expect(report.habitat.contrasts.every((c) => c.paired.validPairs === 3)).toBe(true);
    expect(report.perturbation.finalPopulation.paired.label).toBe("cull_effect_S08_minus_S01");
    // La differenza descrittiva di gruppo resta disponibile ma non sostituisce
    // il confronto appaiato.
    expect(typeof report.habitat.contrasts[0].meanDifference).toBe("number");
  });
});
