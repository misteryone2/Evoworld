/**
 * E1 — test isolati dell'harness scientifico. Non toccano il motore e non
 * cambiano nessuna regola biologica: verificano solo che le misure siano
 * deterministiche, coerenti e calcolate da dati realmente disponibili.
 */
import { describe, it, expect } from "vitest";
import { createWorld, runScenario, type ScenarioSpec } from "../../tools/e1/runner";
import { sampleState, accumulate } from "../../tools/e1/metrics";

const base: ScenarioSpec = {
  id: "TEST",
  description: "harness test",
  seed: 11,
  width: 48,
  height: 48,
  population: 40,
  ticks: 20,
  sampleEvery: 5,
  setup: "baseline",
};

describe("E1 harness — coerenza delle metriche", () => {
  it("è deterministico a parità di seed e condizioni iniziali", () => {
    const a = runScenario(base);
    const b = runScenario(base);
    expect(a.samples).toEqual(b.samples);
    expect(a.completedTicks).toBe(b.completedTicks);
  });

  it("campi derivati sono coerenti con lo stato osservabile", () => {
    const world = createWorld(base);
    const counters = { births: 0, deaths: 0, predationKills: 0 };
    const s = sampleState(world, counters);
    expect(s.population).toBe(world.organisms.length);
    expect(Object.values(s.speciesCounts).reduce((a, b) => a + b, 0)).toBe(s.population);
    expect(s.shannon).toBeGreaterThanOrEqual(0);
    expect(s.occupiedVegetation).toBeGreaterThanOrEqual(0);
    expect(s.occupiedVegetation).toBeLessThanOrEqual(1);
    expect(Number.isFinite(s.meanGeneticDistance)).toBe(true);
    world.step();
    accumulate(counters, world);
    expect(counters.births).toBe(world.getStats().births);
  });

  it("le condizioni iniziali sono esplicithe e verificabili", () => {
    const herb = createWorld({ ...base, setup: "herbivore" });
    expect(herb.organisms.every((o) => o.genome.carnivory === 0.05)).toBe(true);
    const carn = createWorld({ ...base, setup: "carnivore" });
    expect(carn.organisms.every((o) => o.genome.carnivory === 0.6)).toBe(true);
    const mixed = createWorld({ ...base, setup: "mixed" });
    expect(new Set(mixed.organisms.map((o) => o.speciesId)).size).toBe(2);
  });

  it("la mortalità forzata produce estinzione senza toccare le regole", () => {
    const r = runScenario({ ...base, setup: "oldWeak", ticks: 50 });
    expect(r.extinctAt).not.toBeNull();
    expect(r.samples[r.samples.length - 1].population).toBe(0);
  });

  it("la perturbazione di cull è osservabile come perdita di popolazione", () => {
    const opts = { ...base, ticks: 12, sampleEvery: 1 };
    const plain = runScenario(opts);
    const culled = runScenario({ ...opts, perturbation: { atTick: 6, kind: "cull80" } });
    const at6 = culled.samples.find((s) => s.tick === 6);
    expect(at6).toBeTruthy();
    const before = plain.samples.find((s) => s.tick === 5)!.population;
    expect(at6!.population).toBeLessThanOrEqual(Math.ceil(before * 0.25) + 2);
  });

  it("semelli diversi producono serie diverse", () => {
    const a = runScenario(base);
    const b = runScenario({ ...base, seed: 12 });
    expect(a.samples.map((s) => s.population)).not.toEqual(b.samples.map((s) => s.population));
  });
});
