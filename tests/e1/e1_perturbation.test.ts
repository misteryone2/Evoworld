/**
 * E1.3 — verifica del cull stratificato: quota TOTALE ceil(N/5) ripartita per
 * maggiori resti tra le specie. Nessuna regola biologica viene modificata.
 */
import { describe, expect, it } from "vitest";
import type { Organism } from "../../types";
import { applyPerturbationWithReport, planPerturbation } from "../../tools/e1/initialConditions";
import { createWorld, type ScenarioSpec } from "../../tools/e1/runner";

const base: ScenarioSpec = {
  id: "CULL_TEST",
  description: "cull allocation test",
  seed: 11,
  width: 48,
  height: 48,
  population: 40,
  ticks: 10,
  sampleEvery: 5,
  setup: "baseline",
};

/** Organismi sintetici con ID univoci e specie assegnate in blocco. */
function organisms(speciesSizes: number[]): Organism[] {
  const template = createWorld(base).organisms[0];
  const out: Organism[] = [];
  let id = 1;
  speciesSizes.forEach((size, index) => {
    for (let i = 0; i < size; i++) {
      out.push({
        ...template,
        id: id++,
        speciesId: index + 1,
        genome: { ...template.genome },
        position: { ...template.position },
        home: { ...template.home },
        memory: null,
      });
    }
  });
  return out;
}

/** Ripartizione attesa per maggiori resti (specifica indipendente dall'implementazione). */
function expectedTargets(speciesSizes: number[], keepEvery = 5): Map<number, number> {
  const total = Math.ceil(speciesSizes.reduce((a, b) => a + b, 0) / keepEvery);
  const floors = speciesSizes.map((n) => Math.floor(n / keepEvery));
  const targets = new Map(speciesSizes.map((n, i) => [i + 1, floors[i]]));
  let residual = total - floors.reduce((a, b) => a + b, 0);
  const order = speciesSizes
    .map((n, i) => ({ id: i + 1, remainder: n / keepEvery - floors[i] }))
    .sort((a, b) => b.remainder - a.remainder || a.id - b.id);
  for (const item of order) {
    if (residual <= 0) break;
    targets.set(item.id, Math.min(speciesSizes[item.id - 1], targets.get(item.id)! + 1));
    residual--;
  }
  return targets;
}

function expectAllocation(speciesSizes: number[]): void {
  const plan = planPerturbation(organisms(speciesSizes), "cull80", 450);
  const expected = expectedTargets(speciesSizes);
  const total = Math.ceil(speciesSizes.reduce((a, b) => a + b, 0) / 5);

  expect(plan.report.expectedKept).toBe(total);
  expect(plan.kept).toHaveLength(total);
  expect(plan.report.kept).toBe(total);
  expect(plan.report.perSpecies.map((p) => [p.speciesId, p.kept])).toEqual(
    [...expected.entries()],
  );
  expect(plan.report.perSpecies.every((p) => p.removed === p.before - p.kept)).toBe(true);
  // Nessun duplicato e nessun organismo perso nei conteggi.
  const all = [...plan.kept, ...plan.removed];
  expect(new Set(all.map((o) => o.id)).size).toBe(all.length);
  expect(all).toHaveLength(speciesSizes.reduce((a, b) => a + b, 0));
  expect(plan.kept.some((o) => plan.removed.includes(o))).toBe(false);
}

describe("E1.3 — cull stratificato e quota totale", () => {
  it("specie di dimensioni differenti", () => {
    expectAllocation([1, 6, 12]);
  });

  it("specie con un solo organismo", () => {
    expectAllocation([1, 9]); // totale 2: 1->0, 9->2 (non ceil(1/5)=1)
    expectAllocation([1]);
  });

  it("molte specie piccole", () => {
    expectAllocation(Array.from({ length: 12 }, () => 1));
    expectAllocation(Array.from({ length: 8 }, () => 2));
  });

  it("popolazione non divisibile per cinque", () => {
    expectAllocation([4, 7, 8]); // N=19, totale 4
    expectAllocation([3, 3, 3]); // N=9, totale 2
  });

  it("l'ordine dell'array non cambia la selezione", () => {
    const source = organisms([1, 6, 12, 3]);
    const forward = planPerturbation(source, "cull80", 450);
    const reversed = planPerturbation(source.slice().reverse(), "cull80", 450);
    expect(reversed.kept.map((o) => o.id).sort((a, b) => a - b))
      .toEqual(forward.kept.map((o) => o.id).sort((a, b) => a - b));
    expect(reversed.report.perSpecies).toEqual(forward.report.perSpecies);
  });

  it("a parità di seed e tick il risultato è identico", () => {
    const source = organisms([4, 7, 8]);
    const a = planPerturbation(source, "cull80", 450);
    const b = planPerturbation(source, "cull80", 450);
    expect(a.kept.map((o) => o.id)).toEqual(b.kept.map((o) => o.id));
    expect(a.report).toEqual(b.report);
  });

  it("l'RNG del motore resta invariato dopo l'applicazione del cull", () => {
    const world = createWorld({ ...base, setup: "mixed", population: 30 });
    const before = world.toSnapshot().randomState;
    const applied = applyPerturbationWithReport(world, "cull80", 450);
    expect(applied.world.toSnapshot().randomState).toBe(before);
    expect(applied.world.organisms).toHaveLength(Math.ceil(30 / 5));
    expect(applied.report.kept).toBe(applied.world.organisms.length);
  });
});
