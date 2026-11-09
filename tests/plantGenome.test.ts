import { describe, it, expect } from "vitest";
import { Random } from "../simulation/core/random";
import {
  PLANT_TRAIT_NAMES,
  PLANT_TRAIT_RANGES,
  PLANT_MUTATION_RATE,
  randomPlantGenome,
  mutatePlantGenome,
  crossPlantGenomes,
  clampPlantGenome,
  plantGeneticDistance,
  averagePlantGenome,
  type PlantGenome,
} from "../simulation/biology/plantGenome";
import { plantGenomeForCell, plantGenesFor, plantsInCell, PLANT_KINDS } from "../lib/flora";
import { createLocalGround } from "../lib/localGround";
import { makeVf } from "./helpers_vf";

const inRange = (g: PlantGenome) => PLANT_TRAIT_NAMES.every((t) => g[t] >= PLANT_TRAIT_RANGES[t].min && g[t] <= PLANT_TRAIT_RANGES[t].max);

describe("v1.10.0 — genoma delle piante", () => {
  it("ogni tratto ha un intervallo valido", () => {
    expect(PLANT_TRAIT_NAMES.length).toBe(17);
    for (const t of PLANT_TRAIT_NAMES) expect(PLANT_TRAIT_RANGES[t].max).toBeGreaterThan(PLANT_TRAIT_RANGES[t].min);
  });

  it("un genoma casuale sta nei limiti ed è deterministico dal seme", () => {
    const a = randomPlantGenome(new Random(5));
    const b = randomPlantGenome(new Random(5));
    const c = randomPlantGenome(new Random(6));
    expect(inRange(a)).toBe(true);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("la mutazione non modifica l'originale e resta nei limiti, anche spinta all'estremo", () => {
    const g = randomPlantGenome(new Random(1));
    const copy = { ...g };
    const m = mutatePlantGenome(g, new Random(2), 1, 5); // ogni tratto, mutazioni enormi
    expect(g).toEqual(copy);
    expect(inRange(m)).toBe(true);
    expect(m).not.toEqual(g);
  });

  it("alla frequenza di base muta circa il 15% dei tratti", () => {
    const rng = new Random(11);
    const g = randomPlantGenome(new Random(3));
    let changed = 0;
    let total = 0;
    for (let k = 0; k < 400; k++) {
      const m = mutatePlantGenome(g, rng);
      for (const t of PLANT_TRAIT_NAMES) {
        total++;
        if (m[t] !== g[t]) changed++;
      }
    }
    expect(changed / total).toBeGreaterThan(PLANT_MUTATION_RATE * 0.8);
    expect(changed / total).toBeLessThan(PLANT_MUTATION_RATE * 1.2);
  });

  it("con frequenza 0 non cambia nulla", () => {
    const g = randomPlantGenome(new Random(8));
    expect(mutatePlantGenome(g, new Random(9), 0)).toEqual(g);
  });

  it("la ricombinazione prende ogni tratto da uno dei due genitori", () => {
    const a = randomPlantGenome(new Random(1));
    const b = randomPlantGenome(new Random(2));
    const child = crossPlantGenomes(a, b, new Random(3));
    for (const t of PLANT_TRAIT_NAMES) expect([a[t], b[t]]).toContain(child[t]);
    expect(crossPlantGenomes(a, a, new Random(4))).toEqual(a);
  });

  it("la distanza genetica: 0 con sé stessi, simmetrica, vicina a 1 agli estremi", () => {
    const a = randomPlantGenome(new Random(1));
    const b = randomPlantGenome(new Random(2));
    expect(plantGeneticDistance(a, a)).toBe(0);
    expect(plantGeneticDistance(a, b)).toBeCloseTo(plantGeneticDistance(b, a), 12);
    const lo = {} as PlantGenome;
    const hi = {} as PlantGenome;
    for (const t of PLANT_TRAIT_NAMES) {
      lo[t] = PLANT_TRAIT_RANGES[t].min;
      hi[t] = PLANT_TRAIT_RANGES[t].max;
    }
    expect(plantGeneticDistance(lo, hi)).toBeCloseTo(1, 9);
  });

  it("clampPlantGenome rimette nei limiti e sostituisce i valori non validi", () => {
    const g = randomPlantGenome(new Random(1));
    const bad = { ...g, height: 7, lean: -9, lifespan: NaN };
    const fixed = clampPlantGenome(bad);
    expect(inRange(fixed)).toBe(true);
    expect(fixed.height).toBe(1);
    expect(fixed.lean).toBe(-1);
    expect(Number.isFinite(fixed.lifespan)).toBe(true);
  });

  it("il genoma medio sta nei limiti; di un gruppo vuoto è null", () => {
    expect(averagePlantGenome([])).toBeNull();
    const avg = averagePlantGenome([randomPlantGenome(new Random(1)), randomPlantGenome(new Random(2))])!;
    expect(inRange(avg)).toBe(true);
  });
});

describe("v1.10.0 — la flora legge il genoma, senza cambiare l'aspetto", () => {
  it("il genoma di una cella è deterministico, nei limiti e diverso da cella a cella", () => {
    const a = plantGenomeForCell(10, 20, "broadleaf");
    expect(plantGenomeForCell(10, 20, "broadleaf")).toEqual(a);
    expect(inRange(a)).toBe(true);
    expect(plantGenomeForCell(11, 20, "broadleaf")).not.toEqual(a);
    expect(plantGenomeForCell(10, 20, "conifer")).not.toEqual(a);
  });

  it("i geni visivi sono quelli di prima: stessi hash, stesso risultato", () => {
    // I valori attesi vengono dalla definizione della v1.9.x: hash2 con i salti 1..4 del tipo.
    const g = plantGenesFor(10, 20, "broadleaf", 0.8, 0.9);
    const genome = plantGenomeForCell(10, 20, "broadleaf");
    expect(g.height).toBe(genome.height);
    expect(g.crown).toBe(genome.crown);
    expect(g.lean).toBe(genome.lean);
    expect(g.hue).toBe(genome.hue);
    expect(g.vigor).toBeCloseTo(Math.min(1, 0.8 * 0.7 + 0.9 * 0.3), 12);
    expect(g.height).toBeGreaterThanOrEqual(0);
    expect(g.height).toBeLessThan(1);
    expect(g.lean).toBeGreaterThanOrEqual(-1);
    expect(g.lean).toBeLessThanOrEqual(1);
  });

  it("ogni pianta della scena porta il suo genoma, coerente con i suoi geni visivi", () => {
    const g = createLocalGround(makeVf({ terrain: 4, vegetation: 1, originY: 230, cells: 128 }), 512, 512);
    let seen = 0;
    for (let y = 0; y < 128 && seen < 50; y++) {
      for (let x = 0; x < 128; x++) {
        for (const p of plantsInCell(g, g.vf.originX + x, g.vf.originY + y)) {
          expect(inRange(p.genome)).toBe(true);
          expect(p.genes.height).toBe(p.genome.height);
          expect(p.genes.hue).toBe(p.genome.hue);
          seen++;
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("tutti i tipi di pianta hanno un genoma valido", () => {
    for (const k of PLANT_KINDS) expect(inRange(plantGenomeForCell(3, 4, k))).toBe(true);
  });
});
