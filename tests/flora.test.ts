import { describe, it, expect } from "vitest";
import {
  climateIndex,
  floraCandidates,
  plantsInCell,
  planFlora,
  floraBudget,
  plantShape,
  plantGenesFor,
  plantGenomeForCell,
  foliageColor,
  PLANT_KINDS,
  type PlantKind,
  type PlantPlacement,
} from "../lib/flora";
import { createLocalGround } from "../lib/localGround";
import { makeVf } from "./helpers_vf";

const W = 512;
const H = 512;
const countKinds = (plants: PlantPlacement[]) => {
  const c = {} as Record<PlantKind, number>;
  for (const k of PLANT_KINDS) c[k] = 0;
  for (const p of plants) c[p.kind]++;
  return c;
};
/** Tutte le piante di un'area, scorrendo ogni cella. */
function allPlants(vfOpts: Parameters<typeof makeVf>[0]) {
  const g = createLocalGround(makeVf(vfOpts), W, H);
  const out: PlantPlacement[] = [];
  for (let y = 0; y < g.cellsHeight; y++) for (let x = 0; x < g.cellsWidth; x++) out.push(...plantsInCell(g, g.vf.originX + x, g.vf.originY + y));
  return out;
}

describe("v1.8.0 — flora 3D: regole", () => {
  it("climateIndex: 1 all'equatore, 0 ai poli, più freddo in quota", () => {
    expect(climateIndex(H / 2, H, 0.3)).toBeCloseTo(1, 9);
    expect(climateIndex(0, H, 0.3)).toBe(0);
    expect(climateIndex(H / 4, H, 0.3)).toBeCloseTo(0.5, 9);
    expect(climateIndex(H / 2, H, 0.9)).toBeLessThan(climateIndex(H / 2, H, 0.3));
    expect(climateIndex(H / 2 + H, H, 0.3)).toBeCloseTo(1, 9); // si richiude
  });

  it("nessuna pianta sull'oceano, sui laghi o sui fiumi", () => {
    expect(allPlants({ terrain: 0 })).toHaveLength(0);
    expect(allPlants({ terrain: 4, lake: () => true })).toHaveLength(0);
    const vf = makeVf({ terrain: 4 });
    vf.riverFlow.fill(0.6);
    const g = createLocalGround(vf, W, H);
    let n = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) n += plantsInCell(g, 100 + x, 200 + y).length;
    expect(n).toBe(0);
  });

  it("deserto: cactus e niente alberi; senza vegetazione quasi nulla", () => {
    const k = countKinds(allPlants({ terrain: 2, vegetation: 0.5, originY: 256 })); // equatore
    expect(k.cactus).toBeGreaterThan(0);
    expect(k.broadleaf + k.conifer + k.palm + k.acacia).toBe(0);
  });

  it("il deserto freddo (poli) non ha cactus", () => {
    const k = countKinds(allPlants({ terrain: 2, vegetation: 0.5, originY: 0 }));
    expect(k.cactus).toBe(0);
  });

  it("foresta boreale: conifere; foresta tropicale: latifoglie e palme", () => {
    const boreal = countKinds(allPlants({ terrain: 4, vegetation: 0.8, originY: 20 }));
    expect(boreal.conifer).toBeGreaterThan(boreal.broadleaf * 3);
    const tropical = countKinds(allPlants({ terrain: 4, vegetation: 0.8, originY: 230 }));
    expect(tropical.conifer).toBe(0);
    expect(tropical.broadleaf).toBeGreaterThan(0);
    expect(tropical.palm).toBeGreaterThan(0);
  });

  it("savana: acacie; pianura: erba e cespugli, alberi rari", () => {
    const sav = countKinds(allPlants({ terrain: 6, vegetation: 0.6, originY: 230, cells: 256 }));
    expect(sav.acacia).toBeGreaterThan(0);
    expect(sav.grass).toBeGreaterThan(sav.acacia);
    const plains = countKinds(allPlants({ terrain: 1, vegetation: 0.8, originY: 230, cells: 256 }));
    expect(plains.grass).toBeGreaterThan(plains.bush);
    expect(plains.bush).toBeGreaterThan(plains.broadleaf);
  });

  it("più vegetazione, più piante", () => {
    const low = allPlants({ terrain: 4, vegetation: 0.1, originY: 230 }).length;
    const high = allPlants({ terrain: 4, vegetation: 0.9, originY: 230 }).length;
    expect(high).toBeGreaterThan(low * 1.5);
  });

  it("floraCandidates: oceano e alta montagna non hanno nulla", () => {
    expect(floraCandidates(0, 1, 1, 0.1)).toEqual([]);
    expect(floraCandidates(3, 1, 0.5, 0.9)).toEqual([]);
  });

  it("deterministico: stessa cella, stesse piante", () => {
    const a = allPlants({ terrain: 4, vegetation: 0.7, originY: 230 });
    const b = allPlants({ terrain: 4, vegetation: 0.7, originY: 230 });
    expect(a.length).toBe(b.length);
    expect(a.map((p) => [p.kind, p.gx, p.gy])).toEqual(b.map((p) => [p.kind, p.gx, p.gy]));
  });

  it("ogni pianta sta dentro la propria cella e i geni sono nei limiti", () => {
    for (const p of allPlants({ terrain: 1, vegetation: 0.9, originY: 230 })) {
      expect(p.gx).toBeGreaterThanOrEqual(p.cellX);
      expect(p.gx).toBeLessThan(p.cellX + 1);
      expect(p.gy).toBeGreaterThanOrEqual(p.cellY);
      expect(p.gy).toBeLessThan(p.cellY + 1);
      const g = p.genes;
      for (const v of [g.height, g.crown, g.vigor]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(g.lean)).toBeLessThanOrEqual(1);
      expect(Math.abs(g.hue)).toBeLessThanOrEqual(1);
    }
  });

  it("i geni dipendono dalla cella: due cellule diverse non sono uguali", () => {
    const a = plantGenesFor(10, 20, "broadleaf", 0.8, 0.9);
    const b = plantGenesFor(11, 20, "broadleaf", 0.8, 0.9);
    expect(a.height).not.toBe(b.height);
    expect(plantGenesFor(10, 20, "broadleaf", 0.8, 0.9)).toEqual(a);
  });
});

describe("v1.8.0 — flora 3D: piano di posa", () => {
  it("floraBudget ripartisce il totale in alberi, cespugli ed erba", () => {
    const b = floraBudget(1000);
    expect(b.trees).toBe(600);
    expect(b.bushes).toBe(150);
    expect(b.grass).toBe(250);
    expect(floraBudget(0)).toEqual({ trees: 0, bushes: 0, grass: 0 });
    expect(floraBudget(-5)).toEqual({ trees: 0, bushes: 0, grass: 0 });
  });

  it("planFlora rispetta i tetti per famiglia e non supera il budget totale", () => {
    const g = createLocalGround(makeVf({ terrain: 4, vegetation: 0.9, originY: 230 }), W, H);
    // v1.9.0 — alberi grandi, quindi radi: serve un budget piccolo perché i tetti per famiglia entrino in gioco.
    const budget = floraBudget(6);
    const plan = planFlora(g, 132, 262, budget);
    const trees = plan.filter((p) => p.kind !== "grass" && p.kind !== "bush").length;
    const bushes = plan.filter((p) => p.kind === "bush").length;
    const grass = plan.filter((p) => p.kind === "grass").length;
    expect(trees).toBeLessThanOrEqual(budget.trees);
    expect(bushes).toBeLessThanOrEqual(budget.bushes);
    expect(grass).toBeLessThanOrEqual(budget.grass);
    expect(trees).toBe(budget.trees); // in una foresta fitta gli alberi bastano a riempire il tetto
  });

  it("planFlora parte dal centro: le piante scelte sono più vicine al fuoco di quelle scartate", () => {
    // v1.9.0 — gli alberi sono radi (pochi per area), quindi si prova con l'erba, che è abbondante.
    const g = createLocalGround(makeVf({ terrain: 1, vegetation: 1, originY: 230 }), W, H);
    const plan = planFlora(g, 132, 262, { trees: 0, bushes: 0, grass: 20 });
    const farthest = Math.max(...plan.map((p) => Math.hypot(p.gx - 132, p.gy - 262)));
    const all = allPlants({ terrain: 1, vegetation: 1, originY: 230 }).filter((p) => p.kind === "grass");
    const farthestAll = Math.max(...all.map((p) => Math.hypot(p.gx - 132, p.gy - 262)));
    expect(plan.length).toBe(20);
    expect(farthest).toBeLessThan(farthestAll / 2);
  });

  it("senza budget non c'è flora", () => {
    const g = createLocalGround(makeVf({ terrain: 4 }), W, H);
    expect(planFlora(g, 132, 232, floraBudget(0))).toEqual([]);
  });

  it("l'erba non toglie spazio agli alberi", () => {
    const g = createLocalGround(makeVf({ terrain: 1, vegetation: 1, originY: 230 }), W, H);
    const plan = planFlora(g, 132, 262, floraBudget(200));
    expect(plan.filter((p) => p.kind === "grass").length).toBeLessThanOrEqual(floraBudget(200).grass);
  });
});

describe("v1.8.0 — flora 3D: forma e colore", () => {
  const genes = (h: number, c: number, v = 0.8) => ({ height: h, crown: c, lean: 0, hue: 0, vigor: v });
  it("ogni tipo ha dimensioni positive e finite", () => {
    for (const kind of PLANT_KINDS) {
      const s = plantShape(kind, genes(0.5, 0.5));
      for (const v of [s.height, s.crownRadius]) {
        expect(v).toBeGreaterThan(0);
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(s.trunkHeight).toBeGreaterThanOrEqual(0);
      expect(s.trunkHeight).toBeLessThanOrEqual(s.height);
    }
  });

  it("geni più alti e vigorosi, pianta più alta; chioma più larga con crown", () => {
    expect(plantShape("broadleaf", genes(1, 0.5)).height).toBeGreaterThan(plantShape("broadleaf", genes(0, 0.5)).height);
    expect(plantShape("broadleaf", genes(0.5, 0.5, 1)).height).toBeGreaterThan(plantShape("broadleaf", genes(0.5, 0.5, 0)).height);
    expect(plantShape("acacia", genes(0.5, 1)).crownRadius).toBeGreaterThan(plantShape("acacia", genes(0.5, 0)).crownRadius);
  });

  it("i tipi hanno proporzioni diverse: conifera alta e stretta, acacia larga e bassa", () => {
    const c = plantShape("conifer", genes(0.5, 0.5));
    const a = plantShape("acacia", genes(0.5, 0.5));
    expect(c.height / c.crownRadius).toBeGreaterThan(a.height / a.crownRadius);
  });

  const mk = (kind: PlantKind, terrain: number, temperature = 15): PlantPlacement => ({
    kind,
    gx: 0,
    gy: 0,
    yaw: 0,
    genes: genes(0.5, 0.5),
    genome: plantGenomeForCell(0, 0, kind),
    cellX: 0,
    cellY: 0,
    terrain,
    vegetation: 1,
    temperature,
  });

  it("d'autunno la latifoglia vira all'arancio, la conifera no", () => {
    const summer = foliageColor(mk("broadleaf", 4), 0.1);
    const autumn = foliageColor(mk("broadleaf", 4), 0.625);
    expect(autumn[0]).toBeGreaterThan(summer[0]);
    const coniferSummer = foliageColor(mk("conifer", 4), 0.1);
    const coniferAutumn = foliageColor(mk("conifer", 4), 0.625);
    expect(coniferAutumn).toEqual(coniferSummer);
  });

  it("col freddo il fogliame si copre di neve", () => {
    const warm = foliageColor(mk("conifer", 4, 15), 0.1);
    const cold = foliageColor(mk("conifer", 4, -10), 0.1);
    expect(cold[0]).toBeGreaterThan(warm[0] + 100);
    expect(cold[1]).toBeGreaterThan(warm[1] + 100);
  });

  it("clima secco: il fogliame è più giallo (meno verde relativo al rosso) che in foresta", () => {
    const forest = foliageColor(mk("bush", 4), 0.1);
    const desert = foliageColor(mk("bush", 2), 0.1);
    expect(desert[0] / desert[1]).toBeGreaterThan(forest[0] / forest[1]);
  });

  it("i colori restano nel range 0..255", () => {
    for (const kind of PLANT_KINDS) for (const t of [-20, 0, 15, 40]) for (const ph of [0, 0.3, 0.625, 0.9]) {
      for (const ch of foliageColor(mk(kind, 4, t), ph)) {
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(255);
      }
    }
  });
});
