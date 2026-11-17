/**
 * E1 — test isolati dell'harness scientifico. Non toccano il motore e non
 * cambiano nessuna regola biologica: verificano solo che le misure siano
 * deterministiche, coerenti e calcolate da dati realmente disponibili.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { createWorld, runScenario, type ScenarioSpec } from "../../tools/e1/runner";
import { sampleState, accumulate } from "../../tools/e1/metrics";
import { applyPerturbation } from "../../tools/e1/initialConditions";
import { buildScenarios } from "../../tools/e1/scenarios";

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

const zeroCounters = { births: 0, deaths: 0, predationKills: 0 };

describe("E1 harness — coerenza delle metriche", () => {
  it("è deterministico a parità di seed e condizioni iniziali", () => {
    const a = runScenario(base);
    const b = runScenario(base);
    expect(a.samples).toEqual(b.samples);
    expect(a.completedTicks).toBe(b.completedTicks);
  });

  it("campi derivati sono coerenti con lo stato osservabile", () => {
    const world = createWorld(base);
    const counters = { ...zeroCounters };
    const s = sampleState(world, counters);
    expect(s.population).toBe(world.organisms.length);
    expect(Object.values(s.speciesCounts).reduce((a, b) => a + b, 0)).toBe(s.population);
    expect(s.shannon).toBeGreaterThanOrEqual(0);
    expect(s.occupiedVegetation).toBeGreaterThanOrEqual(0);
    expect(s.occupiedVegetation).toBeLessThanOrEqual(1);
    expect(s.organismsSampled).toBeLessThanOrEqual(s.population);
    expect(s.occupiedCellsSampled).toBeLessThanOrEqual(s.organismsSampled);
    expect(Number.isFinite(s.meanGeneticDistance)).toBe(true);
    world.step();
    const events = accumulate(counters, world);
    expect(counters.births).toBe(world.getStats().births);
    expect(events.births).toBe(world.getStats().births);
  });

  it("deduplica la vegetazione per cella geografica distinta", () => {
    const world = createWorld(base);
    const reference = world.organisms.find((o) => {
      const x = Math.round(o.position.x);
      const y = Math.round(o.position.y);
      return world.planet.peekCell(x, y) !== null;
    });
    expect(reference).toBeTruthy();

    const x = Math.round(reference!.position.x);
    const y = Math.round(reference!.position.y);
    const cell = world.planet.peekCell(x, y)!;
    for (const o of world.organisms) o.position = { x, y };

    const s = sampleState(world, { ...zeroCounters });
    expect(s.organismsSampled).toBe(world.organisms.length);
    expect(s.occupiedCellsSampled).toBe(1);
    expect(s.occupiedVegetation).toBeCloseTo(cell.vegetation, 4);
    expect(s.occupiedLandFraction).toBe(cell.terrain === "ocean" ? 0 : 1);
  });

  it("gestisce un campione vuoto senza inventare vegetazione", () => {
    const world = createWorld(base);
    world.organisms = [];
    const s = sampleState(world, { ...zeroCounters });
    expect(s.population).toBe(0);
    expect(s.organismsSampled).toBe(0);
    expect(s.occupiedCellsSampled).toBe(0);
    expect(s.occupiedVegetation).toBe(0);
    expect(s.occupiedLandFraction).toBe(0);
    expect(s.shannon).toBe(0);
    expect(Number.isFinite(s.meanGeneticDistance)).toBe(true);
  });

  it("le condizioni iniziali sono esplicite e verificabili", () => {
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

  it("S08 conserva le opzioni snapshot prima e dopo la ricostruzione", () => {
    const s08 = buildScenarios({ ticks: 8, longTicks: 16, sampleEvery: 1, seeds: [11] })
      .find((s) => s.id === "S08_recovery_after_cull80");
    expect(s08).toBeTruthy();
    expect(s08!.perturbation).toBeTruthy();

    const declared = createWorld(s08!);
    const beforeDeclared = declared.toSnapshot();
    const afterDeclared = applyPerturbation(declared, s08!.perturbation!.kind).toSnapshot();
    expect(afterDeclared.advancedGenome).toBe(beforeDeclared.advancedGenome);
    expect(afterDeclared.geneEffects).toBe(beforeDeclared.geneEffects);

    // Test più forte: anche opzioni non predefinite devono sopravvivere.
    const configured = createWorld({
      ...base,
      options: { enableAdvancedGenome: false, enableGeneEffects: false },
    });
    const beforeConfigured = configured.toSnapshot();
    expect(beforeConfigured.advancedGenome).toBe(false);
    expect(beforeConfigured.geneEffects).toBe(false);
    const afterConfigured = applyPerturbation(configured, "cull80").toSnapshot();
    expect(afterConfigured.advancedGenome).toBe(false);
    expect(afterConfigured.geneEffects).toBe(false);
  });

  it("i contatori cumulativi sopravvivono alla perturbazione", () => {
    const opts = { ...base, ticks: 8, sampleEvery: 1 };
    const plain = runScenario({ ...opts, perturbation: null });
    const culled = runScenario({ ...opts, perturbation: { atTick: 4, kind: "cull80" } });
    const plainAt4 = plain.samples.find((s) => s.tick === 4)!;
    const cullAt4 = culled.samples.find((s) => s.tick === 4)!;

    // La perturbazione avviene dopo lo step 4: gli eventi di quel tick e i
    // cumulativi devono essere identici alla corsa senza cull.
    expect(cullAt4.births).toBe(plainAt4.births);
    expect(cullAt4.deaths).toBe(plainAt4.deaths);
    expect(cullAt4.predationKills).toBe(plainAt4.predationKills);
    expect(cullAt4.cumulativeBirths).toBe(plainAt4.cumulativeBirths);
    expect(cullAt4.cumulativeDeaths).toBe(plainAt4.cumulativeDeaths);
    expect(cullAt4.cumulativePredationKills).toBe(plainAt4.cumulativePredationKills);

    const sumThrough4 = (key: "births" | "deaths" | "predationKills") =>
      plain.samples.filter((s) => s.tick >= 1 && s.tick <= 4).reduce((sum, s) => sum + s[key], 0);
    expect(plainAt4.cumulativeBirths).toBe(sumThrough4("births"));
    expect(plainAt4.cumulativeDeaths).toBe(sumThrough4("deaths"));
    expect(plainAt4.cumulativePredationKills).toBe(sumThrough4("predationKills"));

    const cullAt5 = culled.samples.find((s) => s.tick === 5)!;
    expect(cullAt5.cumulativeBirths).toBeGreaterThanOrEqual(cullAt4.cumulativeBirths);
    expect(cullAt5.cumulativeDeaths).toBeGreaterThanOrEqual(cullAt4.cumulativeDeaths);
    expect(cullAt5.cumulativePredationKills).toBeGreaterThanOrEqual(cullAt4.cumulativePredationKills);
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

  it("lo script usa una destinazione temporanea portabile", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/e1_ecosystem.experiment.ts"), "utf8");
    expect(source).toContain('from "node:os"');
    expect(source).toContain("tmpdir()");
    expect(source).toContain("process.env.E1_OUT");
    expect(source).not.toMatch(/C:[\\/]Users/i);
  });
});
