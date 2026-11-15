import { describe, it, expect } from "vitest";
import { Random } from "../simulation/core/random";
import { World } from "../simulation/core/world";
import {
  randomGenome, inheritGenome, geneticDistance, averageGenome, TRAIT_RANGES, founderGenes, inheritGenes, cloneGenes,
  deriveGeneRandom, migrateGenome, validateGenome, advancedMeanSquare, advancedGeneStats,
} from "../simulation/biology/genome";
import { GENE_CATALOG, GENE_BY_ID, GENE_IDS, CATEGORY_WEIGHTS, FORBIDDEN_BEHAVIOR_WORDS, geneValue, geneDefault } from "../simulation/biology/geneRegistry";
import { expressGenes, phenotypeOf, NEUTRAL_PHENOTYPE, activeTorpor } from "../simulation/biology/phenotype";
import { createOrganism, upkeepCost, isDying } from "../simulation/biology/organism";
import { environmentalFitness } from "../simulation/biology/environment";
import { feedOrganisms } from "../simulation/ecology/feeding";
import { huntPrey } from "../simulation/ecology/predation";
import { computeSensoryChannels, BEHAVIOR_BUCKET_SIZE } from "../simulation/ecology/behavior";
import { buildOrganismBuckets } from "../simulation/ecology/spatialIndex";
import { reproduceOrganisms } from "../simulation/evolution/reproduction";
import type { Cell, Genome, WorldSnapshot } from "../types";

const base = (seed = 1): Genome => randomGenome(new Random(seed));
const withGenes = (g: Genome, genes: Record<string, number>): Genome => ({ ...g, genes });
const org = (g: Genome, energy = 80, x = 10, y = 10, id = 1) => createOrganism(id, 1, x, y, g, energy);
const findLand = (w: World) => {
  for (let y = 0; y < w.planet.height; y++) for (let x = 0; x < w.planet.width; x++) if (w.planet.getCell(x, y).terrain !== "ocean") return { x, y };
  throw new Error("nessuna terra");
};

describe("v1.11.0 — catalogo dei geni", () => {
  it("id unici, intervalli e predefiniti validi, testi di effetto e compromesso presenti", () => {
    expect(new Set(GENE_IDS).size).toBe(GENE_IDS.length);
    for (const g of GENE_CATALOG) {
      expect(g.min).toBeLessThan(g.max);
      expect(g.default).toBeGreaterThanOrEqual(g.min);
      expect(g.default).toBeLessThanOrEqual(g.max);
      expect(g.mutationStd).toBeGreaterThan(0);
      expect(g.effect.length).toBeGreaterThan(20);
      expect(g.tradeoff.length).toBeGreaterThan(20);
      expect(g.interactions.length).toBeGreaterThan(5);
    }
  });
  it("tutte le famiglie hanno almeno un gene e i pesi delle categorie sommano a 1", () => {
    const cats = new Set(GENE_CATALOG.map((g) => g.category));
    for (const c of Object.keys(CATEGORY_WEIGHTS)) expect(cats.has(c as never)).toBe(true);
    expect(Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
  it("nessun gene comportamentale diretto: gli id non descrivono comportamenti", () => {
    for (const id of GENE_IDS) for (const w of FORBIDDEN_BEHAVIOR_WORDS) expect(id.toLowerCase().includes(w)).toBe(false);
  });
  it("ogni gene ha un effetto osservabile: variarlo dal predefinito cambia il fenotipo", () => {
    const neutral = expressGenes({});
    for (const def of GENE_CATALOG) {
      const away = def.default === def.max ? def.min : def.max;
      const changed = expressGenes({ [def.id]: away });
      expect(JSON.stringify(changed), def.id).not.toBe(JSON.stringify(neutral));
    }
  });
  it("i 13 tratti di base sono intatti", () => {
    expect(Object.keys(TRAIT_RANGES)).toEqual(["size", "speed", "metabolism", "vision", "fertility", "lifespan", "carnivory", "preferredTemperature", "temperatureTolerance", "preferredWater", "waterTolerance", "evasion", "huntingSkill"]);
  });
});

describe("v1.11.0 — neutralità: senza geni o ai predefiniti nulla cambia", () => {
  it("fenotipo neutro per genoma senza geni e per geni tutti predefiniti", () => {
    expect(phenotypeOf(base())).toBe(NEUTRAL_PHENOTYPE);
    expect(expressGenes({})).toEqual(NEUTRAL_PHENOTYPE);
    expect(expressGenes(Object.fromEntries(GENE_CATALOG.map((g) => [g.id, g.default])))).toEqual(NEUTRAL_PHENOTYPE);
  });
  it("mantenimento, idoneità ambientale e morte identici (bit per bit) con geni predefiniti", () => {
    const w = new World({ width: 64, height: 32, seed: 3 }, 5, { enableAdvancedGenome: false });
    for (let s = 1; s <= 20; s++) {
      const g = base(s);
      const gd = withGenes(g, Object.fromEntries(GENE_CATALOG.map((d) => [d.id, d.default])));
      expect(upkeepCost(org(gd, 60))).toBe(upkeepCost(org(g, 60)));
      const cell = w.planet.getCell(5, 5) as Cell;
      expect(environmentalFitness(gd, cell)).toBe(environmentalFitness(g, cell));
      const old = org(g); old.age = g.lifespan - 0.5;
      const old2 = org(gd); old2.age = g.lifespan - 0.5;
      expect(isDying(old2)).toBe(isDying(old));
    }
  });
});

describe("v1.11.0 — ereditarietà e mutazione", () => {
  it("figlio dentro gli intervalli, deterministico dal seme, tratti di base dallo stesso flusso di prima", () => {
    const a = withGenes(base(1), founderGenes(new Random(1)));
    const b = withGenes(base(2), founderGenes(new Random(2)));
    for (let s = 0; s < 50; s++) {
      const g1 = inheritGenes(a, b, new Random(s));
      const g2 = inheritGenes(a, b, new Random(s));
      expect(g1).toEqual(g2);
      for (const d of GENE_CATALOG) {
        expect(g1[d.id]).toBeGreaterThanOrEqual(d.min);
        expect(g1[d.id]).toBeLessThanOrEqual(d.max);
      }
    }
  });
  it("senza mutazione il figlio ha la media dei genitori; con mutazione a volte si discosta", () => {
    const a = withGenes(base(1), { bodyDensity: 0.8, memoryRetention: 0.6 });
    const b = withGenes(base(2), { bodyDensity: 1.2, memoryRetention: 1.4 });
    let exact = 0;
    let mutated = 0;
    for (let s = 0; s < 400; s++) {
      const c = inheritGenes(a, b, new Random(s));
      if (c.bodyDensity === 1) exact++;
      else mutated++;
    }
    expect(exact).toBeGreaterThan(250); // ~85% senza mutazione
    expect(mutated).toBeGreaterThan(10); // ~15% mutano
  });
  it("un gene mancante in un genitore vale il predefinito", () => {
    const a = withGenes(base(1), { bodyDensity: 1.3 });
    const b = base(2); // genitore senza geni (vecchio)
    let sum = 0;
    for (let s = 0; s < 200; s++) sum += inheritGenes(a, b, new Random(s)).bodyDensity;
    expect(sum / 200).toBeCloseTo(1.15, 1);
  });
  it("la mutazione cambia pochi geni alla volta e cloneGenes funziona", () => {
    const a = withGenes(base(1), founderGenes(new Random(9)));
    const c = cloneGenes(a, new Random(4));
    let changed = 0;
    for (const d of GENE_CATALOG) if (c[d.id] !== geneValue(a.genes, d.id)) changed++;
    expect(changed).toBeLessThan(GENE_CATALOG.length);
  });
  it("i fondatori stanno vicino al valore neutro e dentro gli intervalli", () => {
    for (let s = 0; s < 100; s++) {
      const f = founderGenes(new Random(s));
      for (const d of GENE_CATALOG) {
        expect(f[d.id]).toBeGreaterThanOrEqual(d.min);
        expect(f[d.id]).toBeLessThanOrEqual(d.max);
        expect(Math.abs(f[d.id] - d.default)).toBeLessThanOrEqual(0.25 * (d.max - d.min) / 2 + 1e-9);
      }
    }
  });
  it("il generatore dei geni non consuma il generatore del mondo", () => {
    const w1 = new World({ width: 64, height: 32, seed: 7 }, 20, { enableAdvancedGenome: false });
    const w2 = new World({ width: 64, height: 32, seed: 7 }, 20, { enableAdvancedGenome: true });
    expect(w2.toSnapshot().randomState).toBe(w1.toSnapshot().randomState);
    const r = new Random(5);
    const state = r.getState();
    deriveGeneRandom(state, 3).next();
    expect(r.getState()).toBe(state);
  });
});

describe("v1.11.0 — distanza genetica", () => {
  const oldDistance = (a: Genome, b: Genome) => {
    let s = 0;
    const names = Object.keys(TRAIT_RANGES) as (keyof typeof TRAIT_RANGES)[];
    for (const t of names) { const r = TRAIT_RANGES[t].max - TRAIT_RANGES[t].min; const d = (a[t] - b[t]) / r; s += d * d; }
    return Math.sqrt(s / names.length);
  };
  it("senza geni avanzati è identica alla formula della v1.10", () => {
    for (let s = 1; s <= 30; s++) expect(geneticDistance(base(s), base(s + 50))).toBe(oldDistance(base(s), base(s + 50)));
  });
  it("geni uguali (anche solo ai predefiniti) non cambiano la distanza dei tratti di base", () => {
    const a = base(1), b = base(2);
    const defaults = Object.fromEntries(GENE_CATALOG.map((d) => [d.id, d.default]));
    expect(geneticDistance(withGenes(a, defaults), withGenes(b, defaults))).toBeCloseTo(oldDistance(a, b), 12);
    expect(geneticDistance(withGenes(a, defaults), b)).toBeCloseTo(oldDistance(a, b), 12); // un genoma vecchio resta confrontabile
  });
  it("zero con genomi identici, simmetrica, e cresce con la divergenza dei geni", () => {
    const a = withGenes(base(1), founderGenes(new Random(1)));
    const b = withGenes(base(1), { ...a.genes, bodyDensity: 1.4 });
    expect(geneticDistance(a, a)).toBe(0);
    expect(geneticDistance(a, b)).toBeCloseTo(geneticDistance(b, a), 12);
    expect(geneticDistance(a, b)).toBeGreaterThan(0);
  });
  it("robusta al numero di geni: il contributo avanzato è una media, limitata a [0, 1] qualunque sia il numero di geni", () => {
    const lo = Object.fromEntries(GENE_CATALOG.map((d) => [d.id, d.min]));
    const hi = Object.fromEntries(GENE_CATALOG.map((d) => [d.id, d.max]));
    expect(advancedMeanSquare(lo, hi)).toBeCloseTo(1, 9);
    expect(advancedMeanSquare(lo, lo)).toBe(0);
    // la stessa differenza relativa (metà intervallo) su un sottoinsieme di geni dà un contributo minore, non uguale a quello su tutti
    const half = { ...Object.fromEntries(GENE_CATALOG.map((d) => [d.id, d.default])), bodyDensity: 1.4 };
    expect(advancedMeanSquare(half, undefined)).toBeLessThan(0.1);
  });
  it("la media dei genomi porta con sé i geni", () => {
    const avg = averageGenome([withGenes(base(1), { bodyDensity: 0.8 }), withGenes(base(2), { bodyDensity: 1.2 })])!;
    expect(avg.genes!.bodyDensity).toBeCloseTo(1, 12);
    expect(averageGenome([base(1), base(2)])!.genes).toBeUndefined();
    const stats = advancedGeneStats([withGenes(base(1), { bodyDensity: 0.8 }), withGenes(base(2), { bodyDensity: 1.2 })])!;
    expect(stats.bodyDensity.mean).toBeCloseTo(1, 12);
    expect(stats.bodyDensity.stdDev).toBeCloseTo(0.2, 12);
  });
});

describe("v1.11.0 — migrazione e salvataggi", () => {
  it("migrateGenome conserva i 13 tratti, aggiunge i geni ai predefiniti, è idempotente e non modifica l'originale", () => {
    const old = base(4);
    const frozen = JSON.stringify(old);
    const m = migrateGenome(old);
    expect(JSON.stringify(old)).toBe(frozen);
    for (const t of Object.keys(TRAIT_RANGES)) expect((m as never)[t]).toBe((old as never)[t]);
    for (const d of GENE_CATALOG) expect(m.genes![d.id]).toBe(d.default);
    expect(migrateGenome(m)).toEqual(m);
    expect(validateGenome(m)).toEqual([]);
  });
  it("conserva geni parziali e sconosciuti, ripara valori non validi o fuori intervallo", () => {
    const m = migrateGenome(withGenes(base(1), { bodyDensity: 1.3, geneFuturo: 7, memoryRetention: NaN, limbLength: 99 }));
    expect(m.genes!.bodyDensity).toBe(1.3);
    expect(m.genes!.geneFuturo).toBe(7);
    expect(m.genes!.memoryRetention).toBe(geneDefault("memoryRetention"));
    expect(m.genes!.limbLength).toBe(GENE_BY_ID.get("limbLength")!.max);
    expect(validateGenome(withGenes(base(1), { limbLength: 99 })).length).toBe(1);
  });
  it("un salvataggio della v1.10 (senza geni né schema) si carica, i tratti restano, i geni partono neutri e il mondo prosegue", () => {
    const w = new World({ width: 96, height: 48, seed: 12 }, 80, { enableAdvancedGenome: false });
    for (let t = 0; t < 40; t++) w.step();
    const snap = JSON.parse(JSON.stringify(w.toSnapshot())) as WorldSnapshot;
    delete snap.genomeSchema;
    delete snap.advancedGenome;
    for (const o of snap.organisms) expect(o.genome.genes).toBeUndefined();
    const loaded = World.fromSnapshot(snap);
    expect(loaded.organisms.length).toBe(w.organisms.length);
    loaded.organisms.forEach((o, i) => {
      for (const t of Object.keys(TRAIT_RANGES)) expect((o.genome as never)[t]).toBe((w.organisms[i].genome as never)[t]);
      for (const d of GENE_CATALOG) expect(o.genome.genes![d.id]).toBe(d.default);
    });
    for (let t = 0; t < 60; t++) loaded.step(); // continua senza errori
    expect(loaded.toSnapshot().genomeSchema).toBe(2);
  });
  it("un salvataggio nuovo contiene i geni e ripresa e originale proseguono esattamente allo stesso modo", () => {
    const a = new World({ width: 96, height: 48, seed: 31 }, 90);
    for (let t = 0; t < 30; t++) a.step();
    const json = JSON.stringify(a.toSnapshot());
    expect(json.includes("bodyDensity")).toBe(true);
    const b = World.fromSnapshot(JSON.parse(json));
    for (let t = 0; t < 60; t++) { a.step(); b.step(); }
    const view = (w: World) => JSON.stringify(w.organisms.map((o) => [o.id, o.position.x, o.position.y, o.energy, o.genome.genes]));
    expect(view(b)).toBe(view(a));
  });
  it("un salvataggio senza geni avanzati (opzione spenta) resta senza dopo il caricamento", () => {
    const a = new World({ width: 64, height: 32, seed: 2 }, 40, { enableAdvancedGenome: false });
    for (let t = 0; t < 20; t++) a.step();
    const b = World.fromSnapshot(JSON.parse(JSON.stringify(a.toSnapshot())));
    expect(b.organisms.every((o) => o.genome.genes === undefined)).toBe(true);
  });
  it("ricaricare due volte un salvataggio migrato non cambia nulla (migrazione ripetibile)", () => {
    const w = new World({ width: 64, height: 32, seed: 6 }, 40, { enableAdvancedGenome: false });
    for (let t = 0; t < 10; t++) w.step();
    const snap = JSON.parse(JSON.stringify(w.toSnapshot())) as WorldSnapshot;
    delete snap.genomeSchema; delete snap.advancedGenome;
    const once = World.fromSnapshot(snap);
    const twice = World.fromSnapshot(JSON.parse(JSON.stringify(once.toSnapshot())));
    expect(JSON.stringify(twice.organisms.map((o) => o.genome))).toBe(JSON.stringify(once.organisms.map((o) => o.genome)));
  });
});

describe("v1.11.0 — effetti biologici osservabili", () => {
  it("costi: i geni costosi aumentano il mantenimento, quelli più bassi lo riducono", () => {
    const g = base(3);
    const cost = (genes: Record<string, number>) => upkeepCost(org(withGenes(g, genes), 100));
    const c0 = cost({});
    for (const [id, hi] of [["bodyDensity", 1.4], ["bodyFatReserve", 1.5], ["limbLength", 1.4], ["sprintBias", 1.6], ["proximitySensing", 2], ["torporCapacity", 0.6], ["digestiveEfficiency", 1.4], ["meatEfficiency", 1.4], ["memoryRetention", 2]] as const) {
      expect(cost({ [id]: hi }), id).toBeGreaterThan(c0);
    }
    expect(cost({ bodyDensity: 0.7 })).toBeLessThan(c0);
  });
  it("torpore: a bassa energia il mantenimento cala (solo con il gene) e a energia alta non cambia", () => {
    const g = withGenes(base(3), { torporCapacity: 0.6 });
    const phenotype = phenotypeOf(g);
    expect(activeTorpor(phenotype, 20)).toBe(0.6);
    expect(activeTorpor(phenotype, 140)).toBe(0);
    const without = withGenes(base(3), { torporCapacity: 0 });
    expect(upkeepCost(org(g, 20))).toBeLessThan(upkeepCost(org(without, 20)));
  });
  it("digestione efficiente: più energia dalla stessa vegetazione; riserva di grasso: tetto di energia più alto", () => {
    const w = new World({ width: 64, height: 32, seed: 3 }, 5, { enableAdvancedGenome: false });
    const { x, y } = findLand(w);
    w.planet.getCell(x, y).vegetation = 1;
    const gain = (genes: Record<string, number>, energy: number) => {
      const w2 = new World({ width: 64, height: 32, seed: 3 }, 5, { enableAdvancedGenome: false });
      w2.planet.getCell(x, y).vegetation = 1;
      const o = org(withGenes({ ...base(5), carnivory: 0 }, genes), energy, x, y);
      feedOrganisms([o], w2.planet);
      return o.energy - energy;
    };
    expect(gain({ digestiveEfficiency: 1.4 }, 20)).toBeGreaterThan(gain({}, 20));
    expect(gain({ digestiveEfficiency: 0.7 }, 20)).toBeLessThan(gain({}, 20));
    // con energia già al tetto base (150) solo chi ha più riserva può ancora guadagnare
    expect(gain({}, 150)).toBe(0);
    expect(gain({ bodyFatReserve: 1.5 }, 150)).toBeGreaterThan(0);
  });
  const arenaWorld = new World({ width: 64, height: 32, seed: 3 }, 5, { enableAdvancedGenome: false });
  const arenaSpot = findLand(arenaWorld);
  const arena = (predGenes: Record<string, number>, preyGenes: Record<string, number>, seed: number, predEnergy = 30) => {
    const { x, y } = arenaSpot;
    const predator = org(withGenes({ ...base(7), carnivory: 0.8, huntingSkill: 0.4, size: 1, speed: 1 }, predGenes), predEnergy, x, y, 1);
    const prey = org(withGenes({ ...base(8), carnivory: 0, evasion: 0.2, size: 1, speed: 1 }, preyGenes), 80, x + 1, y, 2);
    const kills = huntPrey([predator, prey], arenaWorld.planet, new Random(seed), 0, false);
    return { kills, predator, prey };
  };
  it("corazza e scatto: una preda densa viene catturata meno; un cacciatore con più scatto cattura di più", () => {
    let dense = 0, light = 0, fast = 0, slow = 0;
    for (let s = 1; s <= 3000; s++) {
      dense += arena({}, { bodyDensity: 1.4 }, s).kills;
      light += arena({}, { bodyDensity: 0.7 }, s).kills;
      fast += arena({ sprintBias: 1.6 }, {}, s).kills;
      slow += arena({ sprintBias: 0.6 }, {}, s).kills;
    }
    expect(dense).toBeLessThan(light);
    expect(fast).toBeGreaterThan(slow);
  });
  it("efficienza della carne: la stessa uccisione dà più energia con il gene alto", () => {
    let compared = 0;
    for (let s = 1; s <= 400 && compared < 5; s++) {
      const a = arena({}, {}, s), b = arena({ meatEfficiency: 1.4 }, {}, s);
      if (a.kills === 1 && b.kills === 1) { compared++; expect(b.predator.energy - 30 + 12).toBeGreaterThan(a.predator.energy - 30 + 12); }
    }
    expect(compared).toBeGreaterThan(0);
  });
  it("percezione degli altri animali: con più portata si sente una preda che con la portata base resta fuori", () => {
    const w = new World({ width: 64, height: 32, seed: 3 }, 5, { enableAdvancedGenome: false });
    const run = (genes: Record<string, number>) => {
      // vista bassa (raggio base 3): la preda a 5 celle è fuori portata; con portata ×2 (raggio 6) è dentro
      const predator = org(withGenes({ ...base(7), carnivory: 0.8, vision: 3 }, genes), 40, 6, 10, 1);
      const prey = org({ ...base(8), carnivory: 0 }, 80, 11, 10, 2);
      prey.speciesId = 2; // la preda è di un'altra specie (altrimenti è un compagno di branco, non una preda)
      const buckets = buildOrganismBuckets([predator, prey], BEHAVIOR_BUCKET_SIZE);
      return computeSensoryChannels(predator, w.planet, buckets, BEHAVIOR_BUCKET_SIZE, 10);
    };
    expect(run({}).huntX).toBe(0);
    expect(run({ proximitySensing: 2 }).huntX).toBeGreaterThan(0);
    expect(run({ proximitySensing: 0.5 }).huntX).toBe(0);
  });
  it("memoria: un ricordo di cibo vecchio di 400 tick c'è ancora solo con più memoria", () => {
    const w = new World({ width: 64, height: 32, seed: 3 }, 5, { enableAdvancedGenome: false });
    const { x, y } = findLand(w);
    const run = (genes: Record<string, number>) => {
      const o = org(withGenes(base(7), genes), 80, x, y, 1);
      o.memory = { x: x + 3, y, tick: 0, kind: "food" } as never;
      const buckets = buildOrganismBuckets([o], BEHAVIOR_BUCKET_SIZE);
      return computeSensoryChannels(o, w.planet, buckets, BEHAVIOR_BUCKET_SIZE, 400);
    };
    expect(run({}).memoryX).toBe(0);
    expect(run({ memoryRetention: 2 }).memoryX).toBeGreaterThan(0);
  });
  it("asimmetria termica e idrica: vantaggio da un lato, svantaggio dall'altro", () => {
    const g = { ...base(2), preferredTemperature: 15, temperatureTolerance: 10, preferredWater: 0.5, waterTolerance: 0.3 };
    const cell = (temperature: number, water: number) => ({ temperature, water, terrain: "land", vegetation: 0 }) as unknown as Cell;
    const f = (genes: Record<string, number>, c: Cell) => environmentalFitness(withGenes(g, genes), c);
    expect(f({ thermalBias: 1 }, cell(0, 0.5))).toBeGreaterThan(f({ thermalBias: 0 }, cell(0, 0.5)));
    expect(f({ thermalBias: 1 }, cell(30, 0.5))).toBeLessThan(f({ thermalBias: 0 }, cell(30, 0.5)));
    expect(f({ thermalBias: -1 }, cell(30, 0.5))).toBeGreaterThan(f({ thermalBias: 0 }, cell(30, 0.5)));
    expect(f({ droughtBias: 1 }, cell(15, 0.1))).toBeGreaterThan(f({ droughtBias: 0 }, cell(15, 0.1)));
    expect(f({ droughtBias: 1 }, cell(15, 0.9))).toBeLessThan(f({ droughtBias: 0 }, cell(15, 0.9)));
    // al preferito non c'è differenza
    expect(f({ thermalBias: 1 }, cell(15, 0.5))).toBeCloseTo(f({}, cell(15, 0.5)), 12);
  });
  it("riproduzione: più investimento costa di più al genitore e dà più energia al nato; maturazione veloce = vita più breve e prima maturità", () => {
    const w = new World({ width: 64, height: 32, seed: 3 }, 5, { enableAdvancedGenome: false });
    const { x, y } = findLand(w);
    const birth = (genes: Record<string, number>) => {
      for (let s = 1; s <= 2000; s++) {
        const p = org(withGenes({ ...base(5), fertility: 1, lifespan: 1000 }, genes), 140, x, y, 1);
        p.age = 500;
        const kids = reproduceOrganisms([p], w.planet, new Random(s), () => 99, false, false);
        if (kids.length) return { parentEnergy: p.energy, childEnergy: kids[0].energy };
      }
      throw new Error("nessuna nascita");
    };
    const normal = birth({}), heavy = birth({ gestationInvestment: 1.5 }), light = birth({ gestationInvestment: 0.7 });
    expect(normal.childEnergy).toBe(50);
    expect(heavy.childEnergy).toBeGreaterThan(normal.childEnergy);
    expect(light.childEnergy).toBeLessThan(normal.childEnergy);
    expect(heavy.parentEnergy).toBeLessThan(normal.parentEnergy);
    expect(light.parentEnergy).toBeGreaterThan(normal.parentEnergy);
    const fast = expressGenes({ maturationRate: 1.6 });
    expect(fast.maturityFraction).toBeLessThan(0.1);
    expect(fast.lifespanFactor).toBeLessThan(1);
    const o = withGenes({ ...base(1), lifespan: 1000 }, { maturationRate: 1.6 });
    const dying = org(o); dying.age = 900;
    expect(isDying(dying)).toBe(true);
    const normalOne = org(withGenes(o, {})); normalOne.age = 900;
    expect(isDying(normalOne)).toBe(false);
  });
  it("collisioni: la massa dipende dalla densità (fenotipo) e un mondo con geni avanzati evolve senza errori né valori non validi", () => {
    expect(phenotypeOf(withGenes(base(1), { bodyDensity: 1.4 })).massFactor).toBe(1.4);
    const w = new World({ width: 128, height: 64, seed: 4 }, 150);
    for (let t = 0; t < 300; t++) w.step();
    for (const o of w.organisms) {
      expect(validateGenome(o.genome)).toEqual([]);
      expect(Number.isFinite(o.energy)).toBe(true);
    }
    expect(w.organisms.some((o) => o.genome.genes)).toBe(true);
  });
});
