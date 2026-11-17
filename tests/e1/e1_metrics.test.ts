/**
 * E1 — test isolati dell'harness scientifico. Non toccano il motore e non
 * cambiano nessuna regola biologica: verificano solo che le misure siano
 * deterministiche, coerenti e calcolate da dati realmente disponibili.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { createWorld, createWorldWithInfo, runScenario, type ScenarioSpec } from "../../tools/e1/runner";
import { hash32, sampleGeneticPairs, sampledGeneticDistance, sampleState, accumulate } from "../../tools/e1/metrics";
import { applyPerturbation, applyPerturbationWithReport, planPerturbation } from "../../tools/e1/initialConditions";
import { buildPhase2Scenarios, buildScenarios } from "../../tools/e1/scenarios";

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

  it("la destinazione predefinita è portabile e centralizzata", () => {
    const helper = readFileSync(resolve(process.cwd(), "tools/e1/experiment.ts"), "utf8");
    expect(helper).toContain('from "node:os"');
    expect(helper).toContain("tmpdir()");
    expect(helper).toContain("e1-results.json");
    expect(helper).not.toMatch(/C:[\\/]Users/i);
    for (const script of ["scripts/e1_ecosystem.experiment.ts", "scripts/e1_ecosystem.phase2.experiment.ts"]) {
      const source = readFileSync(resolve(process.cwd(), script), "utf8");
      expect(source).toContain("resolveOutputPath");
      expect(source).not.toMatch(/C:[\\/]Users/i);
    }
  });

  it("hash32 è deterministico e non usa casualità", () => {
    expect(hash32(11, 7, 42)).toBe(hash32(11, 7, 42));
    expect(hash32(11, 7, 42)).not.toBe(hash32(11, 7, 43));
    expect(hash32("tick", 1)).toBeGreaterThanOrEqual(0);
  });

  it("le coppie genetiche escludono sé stessi e duplicati, usando tutte le coppie se piccole", () => {
    expect(sampleGeneticPairs([5], 11)).toEqual([]);
    expect(sampleGeneticPairs([5, 5], 11)).toEqual([]);
    const pairs = sampleGeneticPairs([5, 1, 5, 3], 11, 120);
    expect(pairs).toEqual([[1, 3], [1, 5], [3, 5]]);
    expect(pairs.every(([a, b]) => a < b)).toBe(true);
    expect(new Set(pairs.map((p) => p.join(","))).size).toBe(pairs.length);
  });

  it("il campionamento genetico grande è deterministico e senza ripetizioni", () => {
    const ids = Array.from({ length: 40 }, (_, i) => i + 1);
    const a = sampleGeneticPairs(ids, 11, 10);
    const b = sampleGeneticPairs(ids, 11, 10);
    expect(a).toEqual(b);
    expect(a).toHaveLength(10);
    expect(new Set(a.map((p) => p.join(","))).size).toBe(10);
    expect(a.every(([x, y]) => x < y)).toBe(true);
    expect(sampleGeneticPairs(ids, 12, 10)).not.toEqual(a);

    const genetic = sampledGeneticDistance(createWorld(base).organisms, 11, 120);
    expect(genetic.pairsSampled).toBeLessThanOrEqual(genetic.pairsTotal);
    expect(Number.isFinite(genetic.mean)).toBe(true);
    expect(["all_pairs", "coprime_stride_sample"]).toContain(genetic.method);
  });

  it("i campioni riportano coppie totali/campionate e la popolazione vuota è sicura", () => {
    const world = createWorld(base);
    const small = sampleState(world, { ...zeroCounters });
    expect(small.geneticPairsTotal).toBe((world.organisms.length * (world.organisms.length - 1)) / 2);
    expect(small.geneticPairsSampled).toBe(120);
    expect(small.geneticPairMethod).toBe("coprime_stride_sample");

    const exhaustive = sampledGeneticDistance(world.organisms, 11, 1000);
    expect(exhaustive.pairsSampled).toBe(exhaustive.pairsTotal);
    expect(exhaustive.method).toBe("all_pairs");

    world.organisms = [];
    const empty = sampledGeneticDistance(world.organisms, 1);
    expect(empty.pairsTotal).toBe(0);
    expect(empty.pairsSampled).toBe(0);
    expect(empty.mean).toBe(0);
  });

  it("S08 conserva eventi del tick e usa il denominatore pre-cull", () => {
    const opts = { ...base, ticks: 8, sampleEvery: 1 };
    const plain = runScenario(opts);
    const culled = runScenario({ ...opts, perturbation: { atTick: 4, kind: "cull80" } });
    const plainAt4 = plain.samples.find((s) => s.tick === 4)!;
    const cullAt4 = culled.samples.find((s) => s.tick === 4)!;

    expect(cullAt4.populationAtStart).toBe(plainAt4.populationAtStart);
    expect(cullAt4.populationAfterStep).toBe(plainAt4.populationAfterStep);
    expect(cullAt4.eventDenominator).toBe(Math.max(1, cullAt4.populationAtStart));
    expect(cullAt4.birthRate).toBe(plainAt4.birthRate);
    expect(cullAt4.deathRate).toBe(plainAt4.deathRate);
    expect(cullAt4.predationPressure).toBe(plainAt4.predationPressure);
    expect(cullAt4.perturbationRemoved).toBeGreaterThan(0);
    expect(cullAt4.perturbationKept).toBe(cullAt4.population);
    expect(cullAt4.populationAfterStep - cullAt4.perturbationRemoved).toBe(cullAt4.population);
    expect(culled.perturbationReport).not.toBeNull();
    expect(culled.perturbationReport!.removed).toBe(cullAt4.perturbationRemoved);
    expect(culled.perturbationReport!.kept).toBe(cullAt4.perturbationKept);
    expect(culled.perturbationReport!.populationBefore).toBe(cullAt4.populationAfterStep);
  });

  it("il cull è stratificato, esatto e indipendente da ordine, genoma e RNG", () => {
    const world = createWorld({ ...base, setup: "mixed", population: 40 });
    const before = world.toSnapshot().randomState;
    const organisms = world.organisms.map((o, i) => ({
      ...o,
      id: i + 100,
      speciesId: i % 2 === 0 ? 1 : 2,
      position: { ...o.position },
      home: { ...o.home },
      memory: null,
    }));
    const plan = planPerturbation(organisms, "cull80", 450);
    const reversed = planPerturbation(organisms.slice().reverse(), "cull80", 450);
    const changedGenome = planPerturbation(
      organisms.map((o) => ({ ...o, genome: { ...o.genome, carnivory: o.speciesId === 1 ? 0.6 : 0.05 } })),
      "cull80",
      450,
    );

    expect(plan.report.expectedKept).toBe(Math.ceil(organisms.length / 5));
    expect(plan.kept.length + plan.removed.length).toBe(organisms.length);
    expect(plan.report.perSpecies.reduce((s, p) => s + p.kept, 0)).toBe(plan.kept.length);
    expect(plan.report.perSpecies.every((p) => p.kept === Math.ceil(p.before / 5))).toBe(true);
    expect(reversed.kept.map((o) => o.id).sort()).toEqual(plan.kept.map((o) => o.id).sort());
    expect(changedGenome.kept.map((o) => o.id)).toEqual(plan.kept.map((o) => o.id));

    const applied = applyPerturbationWithReport(world, "cull80", 450);
    expect(applied.report.kept).toBe(applied.world.organisms.length);
    expect(applied.world.toSnapshot().randomState).toBe(before);
  });

  it("su più tick il cull non favorisce sistematicamente un gruppo genetico", () => {
    const source = createWorld(base);
    const organisms = source.organisms.map((o, i) => ({
      ...o,
      id: i + 1,
      speciesId: 1,
      genome: { ...o.genome, carnivory: i % 2 === 0 ? 0.05 : 0.6 },
      position: { ...o.position },
      home: { ...o.home },
      memory: null,
    }));
    let keptA = 0;
    let keptB = 0;
    const totalPerGroup = 20 * 60;
    for (let tick = 0; tick < 60; tick++) {
      for (const o of planPerturbation(organisms, "cull80", tick).kept) {
        if (o.genome.carnivory === 0.05) keptA++;
        else keptB++;
      }
    }
    expect(Math.abs(keptA / totalPerGroup - keptB / totalPerGroup)).toBeLessThan(0.15);
  });

  it("la selezione dell'habitat dichiara il campionamento e i controlli scambiati", () => {
    const poor = createWorldWithInfo({ ...base, setup: "poorHabitat" });
    const rich = createWorldWithInfo({ ...base, setup: "richHabitat" });
    expect(poor.info.habitat?.method).toBe("sampled_regular_grid");
    expect(poor.info.habitat?.globalExtremesClaimed).toBe(false);
    expect(poor.info.habitat?.selectedCells).toHaveLength(24);
    expect(poor.info.habitat!.gridSamples).toBeGreaterThan(24);
    expect(rich.info.habitat?.globalExtremesClaimed).toBe(false);

    const swapped = createWorldWithInfo({ ...base, setup: "poorPositionRichResources" });
    const habitat = swapped.info.habitat!;
    expect(habitat.resourceCells).toHaveLength(24);
    expect(habitat.selectedCells).toHaveLength(24);
    expect(habitat.meanResourceVegetation).toBeGreaterThan(habitat.meanSelectedVegetation);
    habitat.selectedCells.forEach((cell, i) => {
      expect(swapped.world.planet.getCell(cell.x, cell.y).vegetation).toBeCloseTo(habitat.resourceCells![i].vegetation, 5);
    });

    const phase2 = buildPhase2Scenarios({ ticks: 4, sampleEvery: 1, seeds: [11, 12] });
    expect(phase2).toHaveLength(14);
    expect(new Set(phase2.map((s) => s.id)).size).toBe(7);
  });
});
