import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { Random } from "../simulation/core/random";
import { World } from "../simulation/core/world";
import { randomGenome, geneticDistance, geneticDistanceV2, TRAIT_RANGES, averageGenome, MATE_COMPATIBILITY_THRESHOLD, SPECIATION_DISTANCE_THRESHOLD } from "../simulation/biology/genome";
import { GENE_REGISTRY, EXTENDED_GENES, GENE_BY_KEY, FORBIDDEN_GENE_KEY_PATTERN } from "../simulation/biology/geneRegistry";
import { getGene, founderExt, inheritExt, cloneExt, deriveGeneRandom, validateGenome, inheritGenomeV2 } from "../simulation/biology/genomeExt";
import { expressGenome, phenotypeOf, DEFAULT_PHENOTYPE, markExtInert, type Phenotype } from "../simulation/biology/geneExpression";
import { migrateGenome, migrateSnapshot } from "../simulation/biology/genomeMigration";
import { createOrganism, upkeepCost } from "../simulation/biology/organism";
import { environmentalFitness } from "../simulation/biology/environment";
import { feedOrganisms } from "../simulation/ecology/feeding";
import { huntPrey } from "../simulation/ecology/predation";
import { computeSensoryChannels, BEHAVIOR_BUCKET_SIZE } from "../simulation/ecology/behavior";
import { buildOrganismBuckets } from "../simulation/ecology/spatialIndex";
import { reproduceOrganisms } from "../simulation/evolution/reproduction";
import { cloneBrainWithMutation, BRAIN_SIZE } from "../simulation/biology/brain";
import type { Cell, Genome, WorldSnapshot } from "../types";

const base = (seed = 1): Genome => randomGenome(new Random(seed));
const withExt = (g: Genome, ext: Record<string, number>): Genome => ({ ...g, ext });
const defaultsExt = () => Object.fromEntries(EXTENDED_GENES.map((d) => [d.key, d.defaultValue]));
const org = (g: Genome, energy = 80, x = 10, y = 10, id = 1) => createOrganism(id, 1, x, y, g, energy);
const smallWorld = new World({ width: 64, height: 32, seed: 3 }, 5, { enableAdvancedGenome: false });
const land = (() => { for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) if (smallWorld.planet.getCell(x, y).terrain !== "ocean") return { x, y }; throw new Error("no land"); })();

describe("v1.11.0 (spec Vibe) — neutralità dei predefiniti", () => {
  it("un genoma con ext tutto-predefinito esprime il fenotipo della v1.10", () => {
    const ph = expressGenome(withExt(base(), defaultsExt())) as unknown as Record<string, number>;
    const neutral = DEFAULT_PHENOTYPE as unknown as Record<string, number>;
    for (const k of Object.keys(neutral)) expect(ph[k], k).toBeCloseTo(neutral[k], 9);
  });
  it("mantenimento, idoneità ambientale: uguali con ext predefinito e senza ext", () => {
    const cell = smallWorld.planet.getCell(land.x, land.y) as Cell;
    for (let s = 1; s <= 25; s++) {
      const g = base(s);
      const gd = withExt(g, defaultsExt());
      expect(upkeepCost(org(gd, 60))).toBeCloseTo(upkeepCost(org(g, 60)), 12);
      expect(environmentalFitness(gd, cell)).toBeCloseTo(environmentalFitness(g, cell), 12);
    }
  });
  it("con geni spenti il mondo è identico alla v1.10 (3 semi × 600 tick, impronta di riferimento di 1967a47)", () => {
    const expected: Record<number, string> = { 1: "0984ad3134bc", 2: "4b9a03bc8ed4", 3: "1286397ccad6" };
    for (const seed of [1, 2, 3]) {
      const w = new World({ width: 128, height: 64, seed }, 300, { enableAdvancedGenome: false });
      for (let t = 0; t < 600; t++) w.step();
      const h = createHash("sha1");
      for (const o of w.organisms) { const { ext, ...g } = o.genome as Genome & { ext?: unknown }; void ext; h.update(JSON.stringify([o.id, o.position.x, o.position.y, o.energy, o.age, g, Array.from(o.brain).slice(0, 8)])); }
      expect(h.digest("hex").slice(0, 12), `seme ${seed}`).toBe(expected[seed]);
    }
  }, 120000);
  it("i geni estesi non consumano il generatore del mondo", () => {
    const a = new World({ width: 64, height: 32, seed: 7 }, 20, { enableAdvancedGenome: false });
    const b = new World({ width: 64, height: 32, seed: 7 }, 20, { enableAdvancedGenome: true });
    expect(b.toSnapshot().randomState).toBe(a.toSnapshot().randomState);
    const r = new Random(5); const st = r.getState(); deriveGeneRandom(st, 3).next(); expect(r.getState()).toBe(st);
  });
});

describe("v1.11.0 (spec Vibe) — registro e catalogo", () => {
  it("33 geni, 20 estesi, guardia anti-comportamento della specifica §2, chiavi univoche", () => {
    expect(GENE_REGISTRY.length).toBe(33);
    expect(EXTENDED_GENES.length).toBe(20);
    expect(new Set(GENE_REGISTRY.map((d) => d.key)).size).toBe(33);
    expect(new Set(GENE_REGISTRY.map((d) => d.id)).size).toBe(33);
    for (const d of EXTENDED_GENES) expect(FORBIDDEN_GENE_KEY_PATTERN.test(d.key), d.key).toBe(false);
  });
  it("ogni gene esteso ha un effetto osservabile sul fenotipo (o sul costo)", () => {
    const neutral = JSON.stringify(expressGenome(withExt(base(), defaultsExt())));
    for (const d of EXTENDED_GENES) {
      const away = d.defaultValue === d.max ? d.min : d.max;
      expect(JSON.stringify(expressGenome(withExt(base(), { ...defaultsExt(), [d.key]: away }))), d.key).not.toBe(neutral);
    }
  });
});

describe("v1.11.0 (spec Vibe) — ereditarietà e fondatori", () => {
  it("fondatori attorno al predefinito, figli nel range, deterministici dal seme", () => {
    for (let s = 0; s < 60; s++) {
      const f = founderExt(new Random(s));
      for (const d of EXTENDED_GENES) {
        expect(f[d.key]).toBeGreaterThanOrEqual(d.min); expect(f[d.key]).toBeLessThanOrEqual(d.max);
        expect(Math.abs(f[d.key] - d.defaultValue)).toBeLessThanOrEqual(0.4 * (d.max - d.min) / 2 + 1e-9);
      }
      const a = withExt(base(1), f), b = withExt(base(2), founderExt(new Random(s + 1000)));
      expect(inheritExt(a, b, new Random(s))).toEqual(inheritExt(a, b, new Random(s)));
      const c = cloneExt(a, new Random(s));
      for (const d of EXTENDED_GENES) { expect(c[d.key]).toBeGreaterThanOrEqual(d.min); expect(c[d.key]).toBeLessThanOrEqual(d.max); }
    }
  });
  it("i tratti storici di inheritGenomeV2 coincidono con quelli di inheritGenome usando lo stesso generatore", async () => {
    const { inheritGenome } = await import("../simulation/biology/genome");
    const a = base(1), b = base(2);
    const v2 = inheritGenomeV2(a, b, new Random(11));
    const v1 = inheritGenome(a, b, new Random(11));
    for (const k of Object.keys(TRAIT_RANGES)) expect((v2 as never)[k]).toBe((v1 as never)[k]);
  });
});

describe("v1.11.0 (spec Vibe) — distanza genetica", () => {
  it("senza ext (da entrambe le parti) è identica alla v1.10; con ext predefiniti scala di sqrt(13/ΣW)", () => {
    const a = base(1), b = base(2);
    const legacy = geneticDistance(a, b);
    const W = 13 + EXTENDED_GENES.reduce((s, d) => s + d.distanceWeight, 0);
    expect(geneticDistance(withExt(a, defaultsExt()), withExt(b, defaultsExt()))).toBeCloseTo(legacy * Math.sqrt(13 / W), 12);
    expect(geneticDistanceV2(a, b)).toBeCloseTo(legacy * Math.sqrt(13 / W), 12); // geni mancanti = predefinito
  });
  it("simmetrica, in [0,1], zero per genomi uguali; le soglie non sono state modificate", () => {
    for (let s = 1; s <= 40; s++) {
      const a = withExt(base(s), founderExt(new Random(s))), b = withExt(base(s + 90), founderExt(new Random(s + 1)));
      const d = geneticDistanceV2(a, b);
      expect(d).toBeCloseTo(geneticDistanceV2(b, a), 12); expect(d).toBeGreaterThanOrEqual(0); expect(d).toBeLessThanOrEqual(1);
      expect(geneticDistanceV2(a, a)).toBe(0);
    }
    expect(MATE_COMPATIBILITY_THRESHOLD).toBe(0.16);
    expect(SPECIATION_DISTANCE_THRESHOLD).toBe(0.26);
  });
  it("la media dei genomi porta con sé i geni estesi", () => {
    const avg = averageGenome([withExt(base(1), { furDensity: 0.2 }), withExt(base(2), { furDensity: 0.6 })])!;
    expect(getGene(avg, "furDensity")).toBeCloseTo(0.4, 12);
    expect(averageGenome([base(1), base(2)])!.ext).toBeUndefined();
  });
});

describe("v1.11.0 (spec Vibe) — migrazione e salvataggi", () => {
  it("salvataggio v1.10 (senza genomeVersion): si carica, i 13 tratti restano, ext ai predefiniti, il mondo prosegue", () => {
    const w = new World({ width: 96, height: 48, seed: 12 }, 80, { enableAdvancedGenome: false });
    for (let t = 0; t < 40; t++) w.step();
    const snap = JSON.parse(JSON.stringify(w.toSnapshot())) as WorldSnapshot;
    delete snap.genomeVersion; delete snap.advancedGenome;
    const loaded = World.fromSnapshot(snap);
    loaded.organisms.forEach((o, i) => {
      for (const k of Object.keys(TRAIT_RANGES)) expect((o.genome as never)[k]).toBe((w.organisms[i].genome as never)[k]);
      for (const d of EXTENDED_GENES) expect(o.genome.ext![d.key]).toBe(d.defaultValue);
    });
    for (let t = 0; t < 60; t++) loaded.step();
    expect(loaded.toSnapshot().genomeVersion).toBe(2);
  });
  it("roundtrip serialize→migrate→serialize è stabile; ricaricare due volte non cambia nulla; ripresa identica all'originale", () => {
    const a = new World({ width: 96, height: 48, seed: 31 }, 90);
    for (let t = 0; t < 30; t++) a.step();
    const json = JSON.stringify(a.toSnapshot());
    const once = migrateSnapshot(JSON.parse(json)).snapshot;
    expect(JSON.stringify(migrateSnapshot(once).snapshot.organisms)).toBe(JSON.stringify(once.organisms));
    const b = World.fromSnapshot(JSON.parse(json));
    for (let t = 0; t < 50; t++) { a.step(); b.step(); }
    const view = (w: World) => JSON.stringify(w.organisms.map((o) => [o.id, o.position.x, o.position.y, o.energy, o.genome.ext]));
    expect(view(b)).toBe(view(a));
  });
  it("mondo senza geni estesi resta senza; il controllo inerte conserva i geni ma senza effetto, anche dopo un salvataggio", () => {
    const off = new World({ width: 64, height: 32, seed: 2 }, 40, { enableAdvancedGenome: false });
    for (let t = 0; t < 20; t++) off.step();
    expect(World.fromSnapshot(JSON.parse(JSON.stringify(off.toSnapshot()))).organisms.every((o) => o.genome.ext === undefined)).toBe(true);
    const ctl = new World({ width: 96, height: 48, seed: 21 }, 120, { enableGeneEffects: false });
    for (let t = 0; t < 120; t++) ctl.step();
    const loaded = World.fromSnapshot(JSON.parse(JSON.stringify(ctl.toSnapshot())));
    for (const w of [ctl, loaded]) for (const o of w.organisms) { expect(o.genome.ext).toBeDefined(); expect(phenotypeOf(o.genome)).toBe(DEFAULT_PHENOTYPE); }
  });
  it("migrazione difensiva: NaN, fuori range, null, chiavi sconosciute e tratti storici dentro ext", () => {
    const m = migrateGenome({ ...base(3), ext: { furDensity: NaN, endurance: 9, futuro: 0.1, evasion: 0.5 } }, 1);
    expect(m.genome.ext!.furDensity).toBe(GENE_BY_KEY.get("furDensity")!.defaultValue);
    expect(m.genome.ext!.endurance).toBe(1);
    expect(m.genome.ext!.futuro).toBe(0.1);
    expect(m.genome.ext!.evasion).toBe(0.5); // conservata ma non letta
    expect(m.issues.length).toBeGreaterThan(0);
    expect(() => migrateGenome(null, 1)).not.toThrow();
    expect(validateGenome(m.genome).issues.some((i) => i.startsWith("unknown-gene"))).toBe(true);
  });
});

const ph = (ext: Record<string, number>): Phenotype => expressGenome(withExt(base(), { ...defaultsExt(), ...ext }));

describe("v1.11.0 (spec Vibe) — effetti biologici", () => {
  it("costo: più geni costosi = più mantenimento; più economici del predefinito = meno", () => {
    const g = base(3);
    const cost = (ext: Record<string, number>) => upkeepCost(org(withExt(g, { ...defaultsExt(), ...ext }), 100));
    const c0 = cost({});
    for (const [k, v] of [["furDensity", 1], ["dermalArmor", 0.6], ["endurance", 1], ["peripheralAcuity", 1], ["olfactorySensitivity", 1], ["energyReserve", 1], ["digestiveEfficiency", 1], ["thermoregulation", 1], ["hydrationEfficiency", 1], ["seasonalRobustness", 1], ["altitudeAdaptation", 1], ["grazingEfficiency", 1], ["dietFlexibility", 1], ["memorySpan", 1], ["neuralStability", 1]] as const) expect(cost({ [k]: v }), k).toBeGreaterThan(c0 - (k === "endurance" ? 1 : 0));
    expect(cost({ digestiveEfficiency: 0 })).toBeLessThan(c0);
  });
  it("LOC-01 e ECO-02: la resistenza taglia il termine di movimento, la flessibilità il costo della carnivoria (senza azzerarli)", () => {
    expect(ph({ endurance: 1 }).movementCostFactor).toBeGreaterThan(0);
    expect(ph({ endurance: 1 }).movementCostFactor).toBeLessThan(1);
    expect(ph({ dietFlexibility: 1 }).carnivoryCostFactor).toBeGreaterThan(0);
    const g = { ...base(4), carnivory: 0.8 };
    expect(upkeepCost(org(withExt(g, { ...defaultsExt(), dietFlexibility: 1 }), 100))).toBeLessThan(upkeepCost(org(withExt(g, defaultsExt()), 100)) + 1e-9 + 0.5);
  });
  it("FIS-01/FIS-02: più energia dalla stessa pianta e tetto più alto", () => {
    const gain = (ext: Record<string, number>, energy: number) => {
      const w = new World({ width: 64, height: 32, seed: 3 }, 5, { enableAdvancedGenome: false });
      w.planet.getCell(land.x, land.y).vegetation = 1;
      const o = org(withExt({ ...base(5), carnivory: 0 }, { ...defaultsExt(), ...ext }), energy, land.x, land.y);
      feedOrganisms([o], w.planet);
      return o.energy - energy;
    };
    expect(gain({ digestiveEfficiency: 1 }, 20)).toBeGreaterThan(gain({}, 20));
    expect(gain({ digestiveEfficiency: 0 }, 20)).toBeLessThan(gain({}, 20));
    expect(gain({}, 150)).toBe(0);
    expect(gain({ energyReserve: 1 }, 150)).toBeGreaterThan(0);
  });
  it("ECO-01: il pascolo efficiente riduce il peso di domanda (provvisorio) ma non il guadagno per organismo isolato", () => {
    expect(ph({ grazingEfficiency: 1 }).grazingDemandFactor).toBeCloseTo(0.7, 12);
  });
  const arenaWorld = new World({ width: 64, height: 32, seed: 3 }, 5, { enableAdvancedGenome: false });
  const arena = (predExt: Record<string, number>, preyExt: Record<string, number>, seed: number) => {
    const predator = org(withExt({ ...base(7), carnivory: 0.8, huntingSkill: 0.4, size: 1, speed: 1 }, { ...defaultsExt(), ...predExt }), 30, land.x, land.y, 1);
    const prey = org(withExt({ ...base(8), carnivory: 0, evasion: 0.2, size: 1, speed: 1 }, { ...defaultsExt(), ...preyExt }), 80, land.x + 1, land.y, 2);
    const kills = huntPrey([predator, prey], arenaWorld.planet, new Random(seed), 0, false);
    return { kills, predator, prey };
  };
  it("MOR-02/03 e LOC-02: più corazza o corporatura robusta = meno catture; più scatto cacciatore = più catture; lo scatto costa energia", () => {
    let armored = 0, plain = 0, robust = 0, slim = 0, burst = 0, calm = 0;
    for (let s = 1; s <= 3000; s++) {
      armored += arena({}, { dermalArmor: 0.6 }, s).kills; plain += arena({}, {}, s).kills;
      robust += arena({}, { bodyStature: 1 }, s).kills; slim += arena({}, { bodyStature: 0 }, s).kills;
      burst += arena({ burstPower: 1 }, {}, s).kills; calm += arena({ burstPower: 0 }, {}, s).kills;
    }
    expect(armored).toBeLessThan(plain);
    expect(robust).toBeLessThan(slim);
    expect(burst).toBeGreaterThan(calm);
    // a parità di seme, quando il tentativo avviene e fallisce per entrambi, chi ha lo scatto ha speso 6 energia in più
    let compared = 0;
    for (let s = 1; s < 400 && compared < 5; s++) {
      const a = arena({ burstPower: 1 }, {}, s), b = arena({}, {}, s);
      if (a.kills === 0 && b.kills === 0 && b.predator.energy < 30) { compared++; expect(b.predator.energy - a.predator.energy).toBeCloseTo(6, 9); }
    }
    expect(compared).toBeGreaterThan(0);
  });
  it("FIS-02: la stessa uccisione dà più energia con digestione efficiente", () => {
    let n = 0;
    for (let s = 1; s <= 600 && n < 5; s++) { const a = arena({}, {}, s), b = arena({ digestiveEfficiency: 1 }, {}, s); if (a.kills === 1 && b.kills === 1) { n++; expect(b.predator.energy).toBeGreaterThan(a.predator.energy); } }
    expect(n).toBeGreaterThan(0);
  });
  it("PER-01/02/03 e FIS-01: fear, memoria, gruppo e energia relativa al tetto", () => {
    const chan = (ext: Record<string, number>, scene: "threat" | "memory" | "flock" | "energy") => {
      const me = org(withExt({ ...base(7), carnivory: 0.1, vision: 6 }, { ...defaultsExt(), ...ext }), scene === "energy" ? 120 : 80, 6, 10, 1);
      const others: ReturnType<typeof org>[] = [me];
      if (scene === "threat") { const t = org({ ...base(8), carnivory: 0.8 }, 80, 9, 10, 2); t.speciesId = 2; others.push(t); }
      if (scene === "flock") others.push(org({ ...base(9) }, 80, 9, 10, 3));
      if (scene === "memory") me.memory = { x: 9, y: 10, tick: 0, kind: "food" } as never;
      const buckets = buildOrganismBuckets(others, BEHAVIOR_BUCKET_SIZE);
      return computeSensoryChannels(me, smallWorld.planet, buckets, BEHAVIOR_BUCKET_SIZE, 10);
    };
    expect(Math.abs(chan({ peripheralAcuity: 1 }, "threat").fearX)).toBeGreaterThan(Math.abs(chan({}, "threat").fearX));
    expect(chan({ olfactorySensitivity: 1 }, "memory").memoryX).toBeGreaterThan(chan({}, "memory").memoryX);
    expect(Math.abs(chan({ socialTolerance: 0 }, "flock").flockX)).toBeGreaterThan(Math.abs(chan({ socialTolerance: 1 }, "flock").flockX));
    expect(chan({ energyReserve: 1 }, "energy").energyNorm).toBeLessThan(chan({}, "energy").energyNorm);
  });
  it("PER-01: una minaccia appena oltre la vista base si sente solo con più acuità", () => {
    const run = (ext: Record<string, number>) => {
      const me = org(withExt({ ...base(7), carnivory: 0.1, vision: 4 }, { ...defaultsExt(), ...ext }), 80, 6, 10, 1);
      const t = org({ ...base(8), carnivory: 0.8 }, 80, 10.8, 10, 2); t.speciesId = 2;
      const buckets = buildOrganismBuckets([me, t], BEHAVIOR_BUCKET_SIZE);
      return computeSensoryChannels(me, smallWorld.planet, buckets, BEHAVIOR_BUCKET_SIZE, 10).fearX;
    };
    expect(run({})).toBe(0);
    expect(Math.abs(run({ peripheralAcuity: 1 }))).toBeGreaterThan(0);
  });
  it("COG-01: un ricordo di 400 tick c'è solo con memoria lunga", () => {
    const run = (ext: Record<string, number>) => {
      const o = org(withExt(base(7), { ...defaultsExt(), ...ext }), 80, 6, 10, 1);
      o.memory = { x: 9, y: 10, tick: 0, kind: "food" } as never;
      return computeSensoryChannels(o, smallWorld.planet, buildOrganismBuckets([o], BEHAVIOR_BUCKET_SIZE), BEHAVIOR_BUCKET_SIZE, 400).memoryX;
    };
    expect(run({})).toBe(0);
    expect(run({ memorySpan: 1 })).toBeGreaterThan(0);
  });
  it("MOR-01, FIS-03/04, ADA-01/02: idoneità ambientale dai due lati", () => {
    const g = { ...base(2), preferredTemperature: 15, temperatureTolerance: 10, preferredWater: 0.5, waterTolerance: 0.3 };
    const cell = (temperature: number, water = 0.5, elevation = 0, seasonalOffset = 0) => ({ temperature, water, elevation, seasonalOffset, terrain: "plains", vegetation: 0 }) as unknown as Cell;
    const f = (ext: Record<string, number>, c: Cell) => environmentalFitness(withExt(g, { ...defaultsExt(), ...ext }), c);
    expect(f({ furDensity: 1 }, cell(0))).toBeGreaterThan(f({}, cell(0)));
    expect(f({ furDensity: 1 }, cell(30))).toBeLessThan(f({}, cell(30)));
    expect(f({ thermoregulation: 1 }, cell(15))).toBeGreaterThan(f({}, cell(15)));
    expect(f({ hydrationEfficiency: 1 }, cell(15))).toBeGreaterThan(f({}, cell(15)));
    expect(f({ seasonalRobustness: 1 }, cell(0, 0.5, 0, -15))).toBeGreaterThan(f({}, cell(0, 0.5, 0, -15)));
    expect(f({ altitudeAdaptation: 1 }, cell(15, 0.5, 0.9))).toBeGreaterThan(f({}, cell(15, 0.5, 0.9)));
    expect(f({ altitudeAdaptation: 1 }, cell(15, 0.5, 0))).toBeCloseTo(f({}, cell(15, 0.5, 0)), 12);
  });
  it("REP-01/02 e COG-02: investimento parentale, maturità, fedeltà neurale", () => {
    const birth = (ext: Record<string, number>) => {
      for (let s = 1; s <= 2000; s++) {
        const p = org(withExt({ ...base(5), fertility: 1, lifespan: 1000 }, { ...defaultsExt(), ...ext }), 140, land.x, land.y, 1); p.age = 500;
        const kids = reproduceOrganisms([p], arenaWorld.planet, new Random(s), () => 99, false, false);
        if (kids.length) return { parent: p.energy, child: kids[0].energy };
      }
      throw new Error("nessuna nascita");
    };
    const n = birth({}), hi = birth({ parentalInvestment: 1 }), lo = birth({ parentalInvestment: 0 });
    expect(n.child).toBe(50); expect(n.parent).toBe(85);
    expect(hi.child).toBeGreaterThan(50); expect(lo.child).toBeLessThan(50);
    expect(hi.parent).toBeLessThan(n.parent); expect(lo.parent).toBeGreaterThan(n.parent);
    expect(ph({ maturityRate: 1 }).maturityFraction).toBeCloseTo(0.06, 12);
    expect(ph({ maturityRate: 0 }).maturityFraction).toBeCloseTo(0.16, 12);
    const parent = new Float32Array(BRAIN_SIZE).fill(0.1);
    expect(Array.from(cloneBrainWithMutation(parent, new Random(3), 0))).toEqual(Array.from(parent)); // fedeltà massima
    expect(ph({ neuralStability: 1 }).brainMutationStd).toBeCloseTo(0.18, 12);
    expect(ph({ neuralStability: 0 }).brainMutationStd).toBeCloseTo(0.42, 12);
  });
  it("un mondo con geni estesi evolve senza errori né valori non validi", () => {
    const w = new World({ width: 128, height: 64, seed: 4 }, 150);
    for (let t = 0; t < 300; t++) w.step();
    for (const o of w.organisms) { expect(validateGenome(o.genome).ok).toBe(true); expect(Number.isFinite(o.energy)).toBe(true); }
    expect(w.organisms.some((o) => o.genome.ext)).toBe(true);
  }, 60000);
});
