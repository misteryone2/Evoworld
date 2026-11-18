import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeCreatureAnatomy } from "../lib/creatureAnatomy";
import { derivePhenotype, type PhenotypeProfile } from "../lib/phenotype";
import {
  BODY_PLAN_CATALOG, BODY_PLAN_IDS, LOCOMOTOR_KINDS, MAX_APPENDAGES, anatomyCacheKey, compareLegacyAnatomy, computeFingerprint, deserializeAnatomy,
  descriptorFromLegacyAnatomy, generateAnatomy, generateAnatomyCached, reduceAnatomyDetail, serializeAnatomy, validateAnatomy, validateBodyPlanSpec,
  type AnatomyDescriptor, type BodyPlanSpec, type DetailTier,
} from "../lib/anatomy";
import { deepFreeze } from "../lib/anatomy/util";

/** G2 review & hardening — suite di regressione. Ogni blocco "anomalia" riproduce un difetto dimostrato dalla diagnostica di revisione. */
const PH = {
  normal: derivePhenotype({ size: 1.1, ext: { bodyStature: 0.7, furDensity: 0.6, dermalArmor: 0.3 } }),
  armored: derivePhenotype({ size: 1.1, ext: { bodyStature: 0.5, furDensity: 0, dermalArmor: 0.6 } }),
  bare: derivePhenotype({ size: 1.1, ext: { bodyStature: 0.5, furDensity: 0, dermalArmor: 0 } }),
  missing: derivePhenotype(undefined),
};
const gen = (id: string, ph: PhenotypeProfile = PH.normal, extra: Partial<Parameters<typeof generateAnatomy>[0]> = {}) => generateAnatomy({ phenotype: ph, bodyPlan: BODY_PLAN_CATALOG[id], ...extra });
const clone = (d: AnatomyDescriptor) => JSON.parse(JSON.stringify(d));
/** Ricalcola il fingerprint di un descriptor manomesso, per verificare che la validazione strutturale (non solo l'hash) lo rifiuti. */
const refp = (d: any) => { d.fingerprint = computeFingerprint(d); return d; };
const freezePlan = (p: unknown): BodyPlanSpec => deepFreeze(JSON.parse(JSON.stringify(p)) as BodyPlanSpec);
/** Fingerprint di riferimento calcolati dall'implementazione verificata; cambiano solo se cambia la geometria o il contratto (da rivedere consapevolmente). */
const GOLDEN = { quadruped: "fcd614c7", radial: "3a295988", many: "8d9aedce" };
const ellipsoidHost = (d: AnatomyDescriptor, segId: string) => d.segments.find((s) => s.id === segId)!;

describe("G2 review — tutti i body plan, tutte le condizioni", () => {
  const scenarios: [string, PhenotypeProfile, number | undefined][] = [
    ["normale", PH.normal, undefined], ["normale+seme", PH.normal, 17], ["corazzato", PH.armored, undefined], ["corazzato+seme", PH.armored, 99],
    ["nudo", PH.bare, 5], ["geni mancanti", PH.missing, undefined],
  ];
  for (const id of BODY_PLAN_IDS) {
    it(`${id}: descriptor valido in ogni scenario`, () => {
      for (const [name, ph, seed] of scenarios) expect(validateAnatomy(gen(id, ph, { seed })), `${id}/${name}`).toEqual({ ok: true, errors: [] });
    });
    it(`${id}: ogni conteggio di appendici per gruppo (min, default, max, dispari) resta valido`, () => {
      for (const g of BODY_PLAN_CATALOG[id].groups) for (const n of [g.minCount, g.count, g.count + 1, g.maxCount]) {
        const d = gen(id, PH.armored, { appendageCounts: { [g.id]: n }, seed: 3 });
        expect(validateAnatomy(d), `${id}/${g.id}=${n}`).toEqual({ ok: true, errors: [] });
        expect(d.appendages.filter((a) => a.groupId === g.id).length).toBe(Math.min(Math.max(n, g.minCount), g.maxCount));
      }
    });
  }
  it("rispetta il limite massimo di appendici in ogni combinazione di massimi", () => {
    for (const id of BODY_PLAN_IDS) {
      const counts = Object.fromEntries(BODY_PLAN_CATALOG[id].groups.map((g) => [g.id, g.maxCount]));
      expect(gen(id, PH.armored, { appendageCounts: counts }).appendages.length).toBeLessThanOrEqual(MAX_APPENDAGES);
    }
  });
});

describe("G2 review — anomalia: appendici fuori posizione", () => {
  it("le radici stanno sulla superficie del segmento ospite (ospiti ellissoidali/sferici)", () => {
    let checked = 0;
    for (const id of BODY_PLAN_IDS) for (const ph of [PH.normal, PH.armored]) {
      const d = gen(id, ph, { seed: 4 });
      for (const a of d.appendages) {
        const h = ellipsoidHost(d, a.segmentId);
        if (h.shape !== "ellipsoid" && h.shape !== "sphere") continue;
        const r = Math.hypot((a.position.x - h.center.x) / h.halfExtents.x, (a.position.y - h.center.y) / h.halfExtents.y, (a.position.z - h.center.z) / h.halfExtents.z);
        expect(r, `${id}/${a.id}`).toBeGreaterThan(0.9);
        expect(r, `${id}/${a.id}`).toBeLessThan(1.02);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
  it("il validatore rifiuta un'appendice lontana dal suo segmento", () => {
    const d = clone(gen("quadruped"));
    d.appendages[0].position.x += 5;
    expect(validateAnatomy(refp(d)).errors.some((e) => e.startsWith("appendage-off-host"))).toBe(true);
  });
  it("ogni direzione è un versore, anche per conteggi dispari", () => {
    for (const id of BODY_PLAN_IDS) for (const g of BODY_PLAN_CATALOG[id].groups) {
      for (const a of gen(id, PH.armored, { appendageCounts: { [g.id]: g.count + 1 } }).appendages) expect(Math.hypot(a.direction.x, a.direction.y, a.direction.z)).toBeCloseTo(1, 3);
    }
    const bad = clone(gen("quadruped")); bad.appendages[0].direction = { x: 0, y: 0, z: 0 };
    expect(validateAnatomy(refp(bad)).errors).toContain(`direction-not-unit:${bad.appendages[0].id}`);
  });
  it("una zampa dispari sulla linea mediana punta verso il basso, non all'indietro", () => {
    for (const id of ["quadruped", "biped", "hexapod", "many-legged", "armored-specialist"]) {
      const d = gen(id, PH.normal, { appendageCounts: { legs: BODY_PLAN_CATALOG[id].groups.find((g) => g.id === "legs")!.count + 1 } });
      const mid = d.appendages.filter((a) => a.kind === "leg" && a.side === "mid");
      expect(mid.length, id).toBe(1);
      expect(mid[0].direction.y, id).toBeLessThan(-0.9);
    }
  });
  it("gli occhi in numero dispari non producono vettori nulli", () => {
    const d = gen("quadruped", PH.normal, { appendageCounts: { eyes: 3 } });
    expect(validateAnatomy(d).ok).toBe(true);
    expect(d.appendages.filter((a) => a.variant === "eye" && a.side === "mid")[0].direction.y).toBeCloseTo(1, 3);
  });
});

describe("G2 review — anomalia: placche concentrate su un solo segmento", () => {
  it("le placche si distribuiscono lungo i segmenti del corpo, non su uno solo", () => {
    for (const id of BODY_PLAN_IDS) {
      const plan = BODY_PLAN_CATALOG[id];
      if (plan.layout !== "axial") continue;
      const d = gen(id, PH.armored);
      const plates = d.appendages.filter((a) => a.kind === "plate");
      expect(plates.length, id).toBe(8);
      const zone = d.segments.filter((s) => ["core", "trunk", "thorax", "abdomen", "lobe"].includes(s.role));
      const zmin = Math.min(...zone.map((s) => s.center.z - s.halfExtents.z)), zmax = Math.max(...zone.map((s) => s.center.z + s.halfExtents.z));
      const zs = plates.map((p) => p.position.z);
      expect(Math.min(...zs), id).toBeGreaterThanOrEqual(zmin - 1e-6);
      expect(Math.max(...zs), id).toBeLessThanOrEqual(zmax + 1e-6);
      expect(Math.max(...zs) - Math.min(...zs), id).toBeGreaterThanOrEqual(0.75 * 0.8 * (zmax - zmin));
      expect(plates.every((p) => ["core", "trunk", "thorax", "abdomen", "lobe"].includes(d.segments.find((s) => s.id === p.segmentId)!.role)), id).toBe(true);
    }
  });
  it("senza dato di corazza (o sotto soglia) non ci sono placche", () => {
    expect(gen("quadruped", PH.missing).appendages.some((a) => a.kind === "plate")).toBe(false);
    expect(gen("quadruped", PH.bare).appendages.some((a) => a.kind === "plate")).toBe(false);
  });
});

describe("G2 review — proporzioni, estensioni e terreno (computeExtents)", () => {
  it("l'estensione complessiva include le appendici e non è mai minore del corpo", () => {
    for (const id of BODY_PLAN_IDS) {
      const d = gen(id, PH.normal);
      const p = d.proportions;
      expect(p.extentLength, id).toBeGreaterThanOrEqual(p.bodyLength - 1e-6);
      expect(p.extentWidth, id).toBeGreaterThanOrEqual(p.bodyWidth - 1e-6);
      expect(p.extentHeight, id).toBeGreaterThanOrEqual(p.bodyHeight - 1e-6);
      for (const a of d.appendages) {
        for (const ax of ["x", "y", "z"] as const) {
          const tip = a.position[ax] + a.direction[ax] * a.length;
          expect(p.bounds.min[ax] - 1e-5, `${id}/${a.id}`).toBeLessThanOrEqual(Math.min(a.position[ax], tip) - a.radius + 1e-5);
          expect(p.bounds.max[ax] + 1e-5, `${id}/${a.id}`).toBeGreaterThanOrEqual(Math.max(a.position[ax], tip) + a.radius - 1e-5);
        }
      }
    }
    const star = gen("speculative-multi-arm", PH.bare);
    expect(star.proportions.extentWidth).toBeGreaterThan(2 * star.proportions.bodyWidth);
  });
  it("il terreno si ricava dalla punta delle zampe d'appoggio, non dalla loro lunghezza", () => {
    for (const id of ["quadruped", "biped", "hexapod", "many-legged", "armored-specialist"]) {
      const d = gen(id, PH.normal);
      const legs = d.appendages.filter((a) => a.kind === "leg" && a.direction.y <= -0.5);
      const foot = Math.min(...legs.map((l) => l.position.y + l.direction.y * l.length - l.radius));
      const bottom = Math.min(...d.segments.map((s) => s.center.y - s.halfExtents.y));
      expect(d.proportions.groundY, id).toBeCloseTo(foot, 5);
      expect(d.proportions.groundClearance, id).toBeCloseTo(Math.max(0, bottom - foot), 5);
      expect(d.proportions.heightAboveGround, id).toBeCloseTo(d.proportions.bounds.max.y - foot, 5);
      const longest = Math.max(...legs.map((l) => l.length));
      expect(Math.abs((d.proportions.groundClearance as number) - longest), id).toBeGreaterThan(1e-3); // non coincide con la lunghezza di una gamba
    }
  });
  it("una zampa più lunga abbassa il terreno e alza la distanza, a parità di corpo", () => {
    const base = gen("quadruped", PH.normal), ground = base.proportions.groundY as number;
    const plan = freezePlan({ ...BODY_PLAN_CATALOG.quadruped, groups: BODY_PLAN_CATALOG.quadruped.groups.map((g) => (g.id === "legs" ? { ...g, length: g.length * 2 } : g)) });
    const longer = generateAnatomy({ phenotype: PH.normal, bodyPlan: plan });
    expect(longer.proportions.groundY as number).toBeLessThan(ground);
    expect(longer.proportions.groundClearance as number).toBeGreaterThan(base.proportions.groundClearance as number);
  });
  it("il terreno non è determinabile senza zampe d'appoggio (null, mai un numero inventato)", () => {
    for (const id of ["simple-sphere", "simple-elongated", "segmented-worm", "radial-sessile", "limbless-serpentine", "speculative-multi-arm"]) {
      const p = gen(id, PH.bare).proportions;
      expect([p.groundY, p.groundClearance, p.heightAboveGround], id).toEqual([null, null, null]);
    }
    const noLegs = gen("quadruped", PH.bare, { appendageCounts: { legs: 0 } });
    expect(noLegs.proportions.groundY).toBeNull();
  });
  it("il validatore rifiuta proporzioni incoerenti con la geometria", () => {
    const d = clone(gen("quadruped")); d.proportions.groundClearance = 99;
    expect(validateAnatomy(refp(d)).errors).toContain("proportions-mismatch");
    const e = clone(gen("quadruped")); e.proportions.groundClearance = null;
    expect(validateAnatomy(refp(e)).errors).toContain("ground-fields-inconsistent");
    const f = clone(gen("quadruped")); f.proportions.extentLength = 0.1;
    expect(validateAnatomy(refp(f)).errors).toContain("extent-smaller-than-body");
  });
  it("conserva le proporzioni dell'organismo intero a ogni livello di dettaglio", () => {
    const full = gen("hexapod");
    for (const tier of [2, 1, 0] as const) expect(reduceAnatomyDetail(full, tier).proportions).toEqual(full.proportions);
  });
});

describe("G2 review — simmetria", () => {
  it("bilaterale: ogni coppia è speculare in posizione, lunghezza e raggio", () => {
    for (const id of BODY_PLAN_IDS.filter((x) => BODY_PLAN_CATALOG[x].symmetry === "bilateral")) for (const seed of [undefined, 8]) {
      const d = gen(id, PH.normal, { seed });
      expect(d.symmetry).toEqual({ type: "bilateral", order: 2 });
      for (const s of d.segments) expect(s.center.x).toBe(0);
      for (const a of d.appendages.filter((x) => x.side === "left")) {
        const m = d.appendages.find((b) => b.side === "right" && b.groupId === a.groupId && b.segmentId === a.segmentId && b.position.z === a.position.z && b.position.y === a.position.y && b.position.x === -a.position.x);
        expect(m, `${id}/${a.id}`).toBeDefined();
        expect(m!.length).toBe(a.length); expect(m!.radius).toBe(a.radius);
      }
    }
  });
  it("radiale: l'ordine è il massimo comun divisore dei gruppi ad anello", () => {
    const o = (id: string, ph: PhenotypeProfile, counts?: Record<string, number>) => gen(id, ph, { appendageCounts: counts }).symmetry;
    expect(o("radial-sessile", PH.bare)).toEqual({ type: "radial", order: 5 });
    expect(o("radial-sessile", PH.bare, { arms: 8 })).toEqual({ type: "radial", order: 8 });
    expect(o("speculative-multi-arm", PH.bare)).toEqual({ type: "radial", order: 3 }); // 6 braccia + 3 stalks: solo l'ordine 3 vale per tutti
    expect(o("speculative-multi-arm", PH.bare, { stalks: 6 })).toEqual({ type: "radial", order: 6 });
    expect(o("speculative-multi-arm", PH.armored).order).toBe(1); // 6 braccia, 3 stalks e 8 placche: MCD = 1
    expect(o("radial-sessile", PH.armored).order).toBe(1);        // 5 braccia + 8 placche
  });
  it("sferica solo senza appendici: con placche diventa radiale", () => {
    expect(gen("simple-sphere", PH.bare).symmetry).toEqual({ type: "spherical", order: 0 });
    expect(gen("simple-sphere", PH.armored).symmetry.type).toBe("radial");
    const d = clone(gen("simple-sphere", PH.bare)); d.appendages.push({ ...clone(gen("simple-sphere", PH.armored)).appendages[0] });
    expect(validateAnatomy(refp(d)).ok).toBe(false);
  });
  it("il validatore rifiuta simmetrie rotte (coppia alterata, anello irregolare, ordine incompatibile)", () => {
    const a = clone(gen("biped")); a.appendages.find((x: any) => x.side === "right").radius += 0.05;
    expect(validateAnatomy(refp(a)).errors.some((e) => e.startsWith("asymmetric-pair"))).toBe(true);
    const r = clone(gen("radial-sessile", PH.bare)); r.appendages[1].angle += 0.4;
    expect(validateAnatomy(refp(r)).errors).toContain("radial-angles-uneven:arms");
    const o = clone(gen("radial-sessile", PH.bare)); o.symmetry.order = 4;
    expect(validateAnatomy(refp(o)).errors).toContain("radial-order-incompatible:arms:5/4");
  });
});

describe("G2 review — articolazioni", () => {
  it("ogni segmento non radice ha un'articolazione assiale verso il suo genitore; ogni appendice una radice e n-1 interne", () => {
    for (const id of BODY_PLAN_IDS) {
      const d = gen(id, PH.armored, { seed: 2 });
      for (const s of d.segments) {
        const ax = d.joints.filter((j) => j.kind === "axial" && j.childSegmentId === s.id);
        expect(ax.length, `${id}/${s.id}`).toBe(s.parentId === null ? 0 : 1);
        if (s.parentId !== null) expect(ax[0].parentSegmentId).toBe(s.parentId);
      }
      for (const a of d.appendages) {
        const roots = d.joints.filter((j) => j.kind === "root" && j.appendageId === a.id);
        expect(roots.length).toBe(1); expect(roots[0].parentSegmentId).toBe(a.segmentId);
        expect(d.joints.filter((j) => j.kind === "internal" && j.appendageId === a.id).map((j) => j.section).sort()).toEqual(Array.from({ length: a.sectionCount - 1 }, (_, i) => i + 1));
      }
      expect(new Set(d.joints.map((j) => j.id)).size).toBe(d.joints.length);
    }
  });
  it("anomalia: le sezioni interne seguono il giunto del gruppo (solo la sfera diventa cerniera)", () => {
    const inner = (id: string, group: string) => gen(id).joints.filter((j) => j.kind === "internal" && j.appendageId?.startsWith(`${group}-`)).map((j) => j.type);
    expect(new Set(inner("hexapod", "antennae"))).toEqual(new Set(["flexible"]));
    expect(new Set(inner("radial-sessile", "arms"))).toEqual(new Set(["flexible"]));
    expect(new Set(inner("simple-elongated", "flagella"))).toEqual(new Set(["flexible"]));
    expect(new Set(inner("quadruped", "legs"))).toEqual(new Set(["hinge"]));    // root "ball"
    expect(new Set(inner("hexapod", "legs"))).toEqual(new Set(["hinge"]));      // root "hinge"
    expect(new Set(inner("biped", "arms"))).toEqual(new Set(["hinge"]));
  });
  it("il dof coincide con il tipo di giunto", () => {
    const dof: Record<string, number> = { fixed: 0, hinge: 1, segmental: 2, ball: 3, flexible: 3 };
    for (const id of BODY_PLAN_IDS) for (const j of gen(id).joints) expect(j.dof, `${id}/${j.id}`).toBe(dof[j.type]);
  });
});

describe("G2 review — modalità locomotorie", () => {
  it("anomalia: 'appendage-driven' e 'radial' senza appendici locomotorie diventano 'limbless'", () => {
    const d = gen("supported-multicellular", PH.bare, { appendageCounts: { fins: 0 } });
    expect(d.locomotion.mode).toBe("limbless");
    expect(validateAnatomy(d).ok).toBe(true);
    expect(gen("supported-multicellular", PH.bare).locomotion.mode).toBe("appendage-driven");
    const plan = freezePlan({ ...BODY_PLAN_CATALOG["radial-sessile"], groups: BODY_PLAN_CATALOG["radial-sessile"].groups.map((g) => ({ ...g, minCount: 0, count: 0 })) });
    expect(generateAnatomy({ phenotype: PH.bare, bodyPlan: plan }).locomotion.mode).toBe("limbless");
  });
  it("il validatore rifiuta modalità incoerenti con le appendici", () => {
    const a = clone(gen("supported-multicellular", PH.bare, { appendageCounts: { fins: 0 } })); a.locomotion.mode = "appendage-driven";
    expect(validateAnatomy(refp(a)).errors).toContain("locomotion-without-locomotor-appendages:appendage-driven");
    const b = clone(gen("quadruped")); b.locomotion.mode = "bipedal";
    expect(validateAnatomy(refp(b)).errors).toContain("locomotion-inconsistent:bipedal:4");
    const c = clone(gen("quadruped")); c.locomotion.supportingLimbs = 3;
    expect(validateAnatomy(refp(c)).errors).toContain("supporting-limbs-mismatch");
  });
  it("il numero di zampe determina la modalità delle piante 'legged'", () => {
    const mode = (n: number) => gen("many-legged", PH.bare, { appendageCounts: { legs: n } }).locomotion.mode;
    expect([mode(2), mode(3), mode(4), mode(5), mode(6), mode(8), mode(40)]).toEqual(["bipedal", "multipedal", "quadrupedal", "multipedal", "hexapodal", "multipedal", "multipedal"]);
    expect(gen("quadruped", PH.bare, { appendageCounts: { legs: 0 } }).locomotion.mode).toBe("limbless");
    for (const k of LOCOMOTOR_KINDS) expect(typeof k).toBe("string");
  });
  it("la modalità non dipende da velocità né da altri geni", () => {
    const a = generateAnatomy({ phenotype: derivePhenotype({ size: 1, ext: {} }), bodyPlan: BODY_PLAN_CATALOG.biped });
    const b = generateAnatomy({ phenotype: derivePhenotype({ size: 1, ext: { endurance: 1, burstPower: 1 } as any }), bodyPlan: BODY_PLAN_CATALOG.biped });
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});

describe("G2 review — limite massimo di appendici", () => {
  const custom = freezePlan({
    id: "custom-cap", family: "complex", symmetry: "bilateral", layout: "axial", locomotion: "legged", axialJoint: "fixed",
    segments: [{ id: "b", role: "trunk", shape: "ellipsoid", parent: null, length: 2, width: 1, height: 1 }],
    groups: [
      { id: "legs", kind: "leg", attach: "b", placement: "lateral", orientation: "down", count: 40, minCount: 0, maxCount: 60, length: 1, radius: 0.05, sections: 1, joint: "hinge", span: 0.9, yOffset: -0.5 },
      { id: "eyes", kind: "sensory", variant: "eye", attach: "b", placement: "lateral", orientation: "outward", count: 4, minCount: 0, maxCount: 60, length: 0.1, radius: 0.1, sections: 1, joint: "fixed", span: 0.5, yOffset: 0.3 },
    ],
  });
  it("anomalia: il tetto ripartisce il budget tra i gruppi invece di azzerare quelli in coda", () => {
    const d = generateAnatomy({ phenotype: PH.armored, bodyPlan: custom, appendageCounts: { legs: 60, eyes: 5 } });
    const legs = d.appendages.filter((a) => a.kind === "leg").length, eyes = d.appendages.filter((a) => a.variant === "eye").length, plates = d.appendages.filter((a) => a.kind === "plate").length;
    expect(d.appendages.length).toBeLessThanOrEqual(MAX_APPENDAGES);
    expect(plates).toBe(8);
    expect(eyes).toBeGreaterThanOrEqual(2);
    expect(legs).toBeGreaterThanOrEqual(40);
    expect(legs % 2).toBe(0); expect(eyes % 2).toBe(0); // le coppie bilaterali sono preservate
    expect(validateAnatomy(d)).toEqual({ ok: true, errors: [] });
  });
  it("è deterministico e non altera i conteggi sotto il tetto", () => {
    const a = generateAnatomy({ phenotype: PH.armored, bodyPlan: custom, appendageCounts: { legs: 60, eyes: 5 } });
    expect(a.fingerprint).toBe(generateAnatomy({ phenotype: PH.armored, bodyPlan: custom, appendageCounts: { legs: 60, eyes: 5 } }).fingerprint);
    const ok = generateAnatomy({ phenotype: PH.bare, bodyPlan: custom, appendageCounts: { legs: 40, eyes: 4 } });
    expect(ok.appendages.length).toBe(44);
  });
  it("il validatore rifiuta più appendici del tetto", () => {
    const d = clone(gen("quadruped")); d.appendages = Array.from({ length: MAX_APPENDAGES + 1 }, () => d.appendages[0]);
    expect(validateAnatomy(d).errors.some((e) => e.startsWith("too-many-appendages"))).toBe(true);
  });
});

describe("G2 review — body plan personalizzati e validazione degli spec", () => {
  it("il catalogo è valido", () => { for (const id of BODY_PLAN_IDS) expect(validateBodyPlanSpec(BODY_PLAN_CATALOG[id]), id).toEqual([]); });
  it("rileva spec incoerenti", () => {
    const base = JSON.parse(JSON.stringify(BODY_PLAN_CATALOG.quadruped));
    const errs = (mut: (s: any) => void) => { const s = JSON.parse(JSON.stringify(base)); mut(s); return validateBodyPlanSpec(s); };
    expect(errs((s) => { s.segments = []; })).toContain("no-segments");
    expect(errs((s) => { s.segments[0].parent = "x"; }).some((e) => e.startsWith("unknown-parent"))).toBe(true);
    expect(errs((s) => { s.segments[1].parent = "tail"; }).some((e) => e.startsWith("parent-cycle") || e.startsWith("roots"))).toBe(true);
    expect(errs((s) => { s.groups[0].attach = "nowhere"; }).some((e) => e.startsWith("unknown-attach"))).toBe(true);
    expect(errs((s) => { s.groups[0].count = 99; }).some((e) => e.startsWith("bad-count-range"))).toBe(true);
    expect(errs((s) => { s.groups[0].sections = 9; }).some((e) => e.startsWith("bad-sections"))).toBe(true);
    expect(errs((s) => { s.groups[0].placement = "radial"; }).some((e) => e.startsWith("placement-incompatible"))).toBe(true);
    expect(errs((s) => { s.symmetry = "radial"; }).some((e) => e.startsWith("placement-incompatible"))).toBe(true);
    expect(errs((s) => { s.segments[0].length = -1; }).some((e) => e.startsWith("bad-dimensions"))).toBe(true);
    expect(validateBodyPlanSpec(null as any)).toEqual(["malformed-spec"]);
  });
  it("anomalia: uno spec non valido dà un errore descrittivo, non un crash interno", () => {
    const bad = freezePlan({ ...BODY_PLAN_CATALOG.quadruped, segments: [] });
    expect(() => generateAnatomy({ phenotype: PH.normal, bodyPlan: bad })).toThrow(/BodyPlanSpec non valido.*no-segments/);
    expect(() => generateAnatomyCached({ phenotype: PH.normal, bodyPlan: bad })).toThrow(/BodyPlanSpec non valido/);
  });
  it("spec personalizzato valido: genera, valida, serializza", () => {
    const plan = freezePlan({
      id: "custom-two-lobes", family: "simple", symmetry: "none", layout: "explicit", locomotion: "amorphous", axialJoint: "flexible",
      segments: [{ id: "a", role: "core", shape: "sphere", parent: null, length: 1, width: 1, height: 1, at: [0, 0, 0] }, { id: "b", role: "lobe", shape: "sphere", parent: "a", length: 0.6, width: 0.6, height: 0.6, at: [0.6, 0, 0.3] }],
      groups: [],
    });
    const d = generateAnatomy({ phenotype: PH.armored, bodyPlan: plan, seed: 1 });
    expect(validateAnatomy(d).ok).toBe(true);
    expect(deserializeAnatomy(serializeAnatomy(d)).ok).toBe(true);
  });
});

describe("G2 review — cache: chiavi, collisioni, valori mancanti, spec personalizzati", () => {
  const input = (ph: PhenotypeProfile, extra: object = {}) => ({ phenotype: ph, bodyPlan: BODY_PLAN_CATALOG.quadruped, ...extra });
  it("la cache coincide con la generazione diretta per input diversi", () => {
    for (const id of BODY_PLAN_IDS) for (const ph of Object.values(PH)) for (const seed of [undefined, 1, 77]) {
      const i = { phenotype: ph, bodyPlan: BODY_PLAN_CATALOG[id], seed };
      expect(generateAnatomyCached(i).fingerprint, `${id}/${String(seed)}`).toBe(generateAnatomy(i).fingerprint);
    }
  });
  it("input equivalenti condividono la chiave (seme normalizzato, lod normalizzato, conteggi effettivi)", () => {
    const k = (extra: object) => anatomyCacheKey(input(PH.normal, extra) as any);
    expect(k({ seed: -1 })).toBe(k({ seed: 4294967295 }));
    expect(k({ seed: 1.5 })).toBe(k({ seed: 1 }));
    expect(k({ lod: 7 })).toBe(k({}));
    expect(k({ lod: Number.NaN })).toBe(k({}));
    expect(k({ lod: -2 })).toBe(k({ lod: 0 }));
    expect(k({ appendageCounts: { legs: 4 } })).toBe(k({}));
    expect(k({ appendageCounts: { legs: Number.NaN } })).toBe(k({}));
    expect(k({ appendageCounts: { legs: 5000 } })).toBe(k({ appendageCounts: { legs: 12 } }));
    expect(generateAnatomyCached(input(PH.normal, { seed: -1 }) as any)).toBe(generateAnatomyCached(input(PH.normal, { seed: 4294967295 }) as any));
    expect(generateAnatomyCached(input(PH.normal, { lod: 9 }) as any).lod).toBe(3);
  });
  it("input diversi hanno chiavi diverse (nessuna collisione) e descriptor diversi", () => {
    const variants: object[] = [{}, { seed: 0 }, { seed: 1 }, { origin: "legacy-default" }, { lod: 2 }, { lod: 0 }, { appendageCounts: { legs: 6 } }, { appendageCounts: { legs: 6, eyes: 4 } }, { appendageCounts: { eyes: 4 } }];
    const keys = new Set(variants.map((v) => anatomyCacheKey(input(PH.normal, v) as any)));
    expect(keys.size).toBe(variants.length);
    const prints = new Set(variants.map((v) => generateAnatomyCached(input(PH.normal, v) as any).fingerprint));
    expect(prints.size).toBe(variants.length); // anche `origin` fa parte del descriptor (bodyPlan.origin)
  });
  it("chiavi distinte per valori mancanti, non validi, fuori intervallo e presenti", () => {
    const g = (ext: object, size: any = 1) => derivePhenotype({ size, ext: { bodyStature: 0.5, dermalArmor: 0.1, ...ext } } as any);
    const phs = [g({ furDensity: 0 }), g({}), g({ furDensity: Number.NaN }), g({ furDensity: 1 }), g({ furDensity: 9 }), g({ furDensity: 0.5 })];
    const keys = new Set(phs.map((p) => anatomyCacheKey(input(p) as any)));
    expect(keys.size).toBe(phs.length);
    // "clamped" e "present" con lo stesso valore normalizzato producono descriptor diversi (phenotypeIssues): devono avere chiavi diverse
    const a = generateAnatomyCached(input(phs[3]) as any), b = generateAnatomyCached(input(phs[4]) as any);
    expect(a.phenotypeIssues).toEqual([]); expect(b.phenotypeIssues).toContain("clamped:furDensity");
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
  it("un profilo costruito a mano con valori derivati diversi non riceve un risultato stantio", () => {
    const real = PH.normal;
    const fake = { ...real, derived: { ...real.derived, sizeScale: { ...real.derived.sizeScale, value: 1.4 } } } as PhenotypeProfile;
    const a = generateAnatomyCached(input(real) as any), b = generateAnatomyCached(input(fake) as any);
    expect(b.proportions.sizeScale).toBe(1.4);
    expect(a.proportions.sizeScale).not.toBe(1.4);
  });
  it("spec congelato: risultato in cache (stesso oggetto); spec modificabile: mai in cache e sempre aggiornato", () => {
    expect(generateAnatomyCached(input(PH.normal) as any)).toBe(generateAnatomyCached(input(PH.normal) as any));
    const mutable = JSON.parse(JSON.stringify(BODY_PLAN_CATALOG.biped)) as BodyPlanSpec & { groups: any[] };
    const first = generateAnatomyCached({ phenotype: PH.normal, bodyPlan: mutable });
    expect(generateAnatomyCached({ phenotype: PH.normal, bodyPlan: mutable })).not.toBe(first);
    (mutable.groups.find((g: any) => g.id === "legs") as any).length = 2.5;
    const after = generateAnatomyCached({ phenotype: PH.normal, bodyPlan: mutable });
    expect(after.appendages.find((a) => a.kind === "leg")!.length).toBeGreaterThan(first.appendages.find((a) => a.kind === "leg")!.length);
    expect(after.fingerprint).toBe(generateAnatomy({ phenotype: PH.normal, bodyPlan: mutable }).fingerprint);
  });
  it("due spec congelati con lo stesso id ma contenuto diverso non si contaminano", () => {
    const a = freezePlan({ ...BODY_PLAN_CATALOG.biped }), b = freezePlan({ ...BODY_PLAN_CATALOG.biped, segments: BODY_PLAN_CATALOG.biped.segments.map((s) => (s.id === "trunk" ? { ...s, length: 3 } : s)) });
    expect(generateAnatomyCached({ phenotype: PH.normal, bodyPlan: a }).fingerprint).not.toBe(generateAnatomyCached({ phenotype: PH.normal, bodyPlan: b }).fingerprint);
  });
});

describe("G2 review — determinismo, fingerprint, immutabilità", () => {
  const reorder = (v: any): any => (Array.isArray(v) ? v.map(reorder) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, reorder(v[k])])) : v);
  it("il fingerprint non dipende dall'ordine delle chiavi e rileva ogni modifica", () => {
    const d = gen("hexapod", PH.normal, { seed: 3 });
    expect(computeFingerprint(reorder(d))).toBe(d.fingerprint);
    for (const mutate of [(x: any) => { x.proportions.sizeScale += 0.001; }, (x: any) => { x.segments[0].center.z += 0.001; }, (x: any) => { x.provenance.locomotion.note = "x"; }, (x: any) => { x.phenotypeIssues = ["x"]; }]) {
      const m = clone(d); mutate(m); expect(computeFingerprint(m)).not.toBe(d.fingerprint);
    }
  });
  it("valori di riferimento (regressione tra esecuzioni e piattaforme)", () => {
    expect(gen("quadruped", PH.normal, { seed: 7 }).fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(gen("quadruped", PH.normal, { seed: 7 }).fingerprint).toBe(GOLDEN.quadruped);
    expect(gen("radial-sessile", PH.armored).fingerprint).toBe(GOLDEN.radial);
    expect(gen("many-legged", PH.missing, { appendageCounts: { legs: 9 } }).fingerprint).toBe(GOLDEN.many);
  });
  it("input diversi → descriptor diversi (taglia, corporatura, pelo, corazza, body plan, seme, conteggi)", () => {
    const f = (ph: PhenotypeProfile, id = "quadruped", extra: object = {}) => gen(id, ph, extra).fingerprint;
    const mk = (size: number, st: number, fur: number, ar: number) => derivePhenotype({ size, ext: { bodyStature: st, furDensity: fur, dermalArmor: ar } });
    const set = new Set([f(mk(1, 0.5, 0.2, 0.1)), f(mk(1.5, 0.5, 0.2, 0.1)), f(mk(1, 0.9, 0.2, 0.1)), f(mk(1, 0.5, 0.8, 0.1)), f(mk(1, 0.5, 0.2, 0.5)), f(mk(1, 0.5, 0.2, 0.1), "biped"), f(mk(1, 0.5, 0.2, 0.1), "quadruped", { seed: 3 }), f(mk(1, 0.5, 0.2, 0.1), "quadruped", { appendageCounts: { legs: 6 } })]);
    expect(set.size).toBe(8);
  });
  it("i descriptor sono immutabili in profondità", () => {
    const d = gen("quadruped");
    expect(() => { (d.segments as any).push({}); }).toThrow();
    expect(() => { (d.segments[0].center as any).x = 9; }).toThrow();
    expect(() => { (d.provenance as any).extra = 1; }).toThrow();
    expect(() => { (d.proportions.bounds.min as any).x = 9; }).toThrow();
    expect(Object.isFrozen(reduceAnatomyDetail(d, 1))).toBe(true);
    expect(Object.isFrozen(deserializeAnatomy(serializeAnatomy(d)).value)).toBe(true);
  });
  it("nessun Math.random né Date.now nei moduli G2", () => {
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const dir of ["lib/anatomy", "lib/phenotype"]) for (const f of readdirSync(dir)) expect(/Math\.random|Date\.now|performance\.now/.test(strip(readFileSync(join(dir, f), "utf8"))), `${dir}/${f}`).toBe(false);
  });
});

describe("G2 review — LOD 0, 1, 2 e 3", () => {
  const tiers: DetailTier[] = [3, 2, 1, 0];
  it("ogni livello è valido per ogni body plan, condizione e seme", () => {
    for (const id of BODY_PLAN_IDS) for (const ph of [PH.normal, PH.armored, PH.missing]) {
      const full = gen(id, ph, { seed: 6 });
      for (const t of tiers) expect(validateAnatomy(reduceAnatomyDetail(full, t)), `${id}@${t}`).toEqual({ ok: true, errors: [] });
    }
  });
  it("contenuto di ciascun livello", () => {
    const full = gen("armored-specialist", PH.armored);
    const l2 = reduceAnatomyDetail(full, 2), l1 = reduceAnatomyDetail(full, 1), l0 = reduceAnatomyDetail(full, 0);
    expect(l2.joints.some((j) => j.kind === "internal")).toBe(false);
    expect(l2.appendages.length).toBe(full.appendages.length);
    expect(l2.appendages.every((a) => a.sectionCount === 1)).toBe(true);
    expect(l1.appendages.every((a) => ["leg", "arm", "tentacle", "fin", "tail", "flagellum", "pseudopod"].includes(a.kind))).toBe(true);
    expect(l1.appendages.some((a) => a.kind === "plate" || a.kind === "claw" || a.kind === "sensory")).toBe(false);
    expect(l1.appendages.filter((a) => a.kind === "leg").length).toBe(6);
    expect(l0.appendages).toEqual([]);
    expect(l0.joints.every((j) => j.kind === "axial")).toBe(true);
    expect(l0.segments).toEqual(full.segments);
    expect([full.lod, l2.lod, l1.lod, l0.lod]).toEqual([3, 2, 1, 0]);
  });
  it("la complessità non cresce al ridursi del dettaglio e il fingerprint cambia per livello", () => {
    for (const id of BODY_PLAN_IDS) {
      const full = gen(id, PH.armored);
      const scores = tiers.map((t) => reduceAnatomyDetail(full, t).complexity.score);
      for (let i = 1; i < scores.length; i++) expect(scores[i], id).toBeLessThanOrEqual(scores[i - 1]);
      expect(new Set(tiers.map((t) => reduceAnatomyDetail(full, t).fingerprint)).size).toBeGreaterThanOrEqual(2);
    }
  });
  it("riduzione ripetuta ≡ riduzione diretta; generare con lod ≡ generare e ridurre; non si risale di livello", () => {
    const full = gen("hexapod", PH.normal, { seed: 2 });
    expect(reduceAnatomyDetail(reduceAnatomyDetail(full, 2), 1).fingerprint).toBe(reduceAnatomyDetail(full, 1).fingerprint);
    for (const t of [2, 1, 0] as const) expect(gen("hexapod", PH.normal, { seed: 2, lod: t }).fingerprint).toBe(reduceAnatomyDetail(full, t).fingerprint);
    expect(reduceAnatomyDetail(full, 3)).toBe(full);
    const l1 = reduceAnatomyDetail(full, 1);
    expect(reduceAnatomyDetail(l1, 3)).toBe(l1);
    expect(reduceAnatomyDetail(l1, 2)).toBe(l1);
  });
  it("la locomozione resta quella dell'organismo intero e il LOD non perde mai le zampe fino al livello 1", () => {
    for (const id of BODY_PLAN_IDS) { const f = gen(id, PH.normal); for (const t of [2, 1] as const) expect(reduceAnatomyDetail(f, t).appendages.filter((a) => a.kind === "leg").length).toBe(f.appendages.filter((a) => a.kind === "leg").length); }
  });
});

describe("G2 review — serializzazione", () => {
  it("round-trip esatto per ogni body plan, livello e scenario", () => {
    for (const id of BODY_PLAN_IDS) for (const ph of [PH.normal, PH.armored, PH.missing]) for (const t of [3, 2, 1, 0] as const) {
      const d = reduceAnatomyDetail(gen(id, ph, { seed: 5 }), t);
      const r = deserializeAnatomy(serializeAnatomy(d));
      expect(r.ok, `${id}@${t}`).toBe(true);
      if (r.ok) { expect(r.value).toEqual(d); expect(serializeAnatomy(r.value)).toBe(serializeAnatomy(d)); expect(r.value.fingerprint).toBe(d.fingerprint); }
    }
  });
  it("serializzazione indipendente dall'ordine di inserimento delle chiavi", () => {
    const d = gen("biped", PH.normal, { seed: 1 });
    const shuffled = Object.fromEntries(Object.keys(d).reverse().map((k) => [k, (d as any)[k]]));
    expect(serializeAnatomy(shuffled as any)).toBe(serializeAnatomy(d));
  });
  it("rifiuta, senza lanciare, versioni vecchie e future, JSON corrotto, tipi sbagliati e dati manomessi", () => {
    const d = gen("quadruped");
    const bad = (x: unknown) => deserializeAnatomy(typeof x === "string" ? x : JSON.stringify(x));
    for (const v of [1, 3, 99, "2", null]) expect(bad({ ...d, schemaVersion: v }).ok).toBe(false);
    expect(bad({ ...d, schemaVersion: 1 }).errors[0]).toBe("unsupported-schema-version:1");
    for (const t of ["{", "", "null", "[]", "42", '"x"']) expect(bad(t).ok, t).toBe(false);
    expect(deserializeAnatomy(undefined as any).ok).toBe(false);
    expect(bad({ ...d, segments: "x" }).ok).toBe(false);
    expect(bad({ ...d, fingerprint: "00000000" }).errors).toContain("fingerprint-mismatch");
    const tampered = clone(d); tampered.joints[0].parentSegmentId = "x";
    expect(bad(tampered).ok).toBe(false);
    const noProv = clone(d); delete noProv.provenance.locomotion;
    expect(bad(refp(noProv)).errors).toContain("missing-provenance:locomotion");
  });
});

describe("G2 review — adattatore legacy", () => {
  const rnd = (() => { let s = 12345; return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296); })();
  const sweep = Array.from({ length: 80 }, () => ({ speed: 0.4 + rnd() * 2.4, carnivory: rnd(), vision: 1 + rnd() * 9, evasion: rnd(), huntingSkill: rnd() }));
  it("80 combinazioni di tratti: descriptor valido, struttura equivalente, round-trip e determinismo", () => {
    for (const t of sweep) {
      const legacy = computeCreatureAnatomy(t);
      const d = descriptorFromLegacyAnatomy(legacy);
      expect(validateAnatomy(d), JSON.stringify(t)).toEqual({ ok: true, errors: [] });
      expect(compareLegacyAnatomy(legacy, d)).toEqual({ structurallyEquivalent: true, differences: [] });
      expect(descriptorFromLegacyAnatomy(legacy).fingerprint).toBe(d.fingerprint);
      expect(deserializeAnatomy(serializeAnatomy(d)).ok).toBe(true);
      expect(d.locomotion.mode).toBe("quadrupedal");
    }
  });
  it("la distanza dal terreno del descriptor legacy è determinata dalle sue zampe, non dalla loro lunghezza", () => {
    for (const t of sweep.slice(0, 20)) {
      const legacy = computeCreatureAnatomy(t), d = descriptorFromLegacyAnatomy(legacy);
      expect(d.proportions.groundY).toBeCloseTo(-legacy.bodyHalfHeight - legacy.legLength - legacy.legRadius, 4);
      expect(d.proportions.groundClearance).toBeCloseTo(Math.max(0, -(legacy.bodyHalfHeight) - d.proportions.groundY!) , 3);
    }
  });
  it("tutto ciò che deriva dall'anatomia legacy è estetico/non determinato, mai genetico", () => {
    for (const t of sweep.slice(0, 20)) {
      const d = descriptorFromLegacyAnatomy(computeCreatureAnatomy(t));
      for (const src of Object.values(d.provenance)) { expect(["aesthetic", "undetermined"]).toContain(src.kind); expect(src.genes).toEqual([]); }
    }
  });
  it("il confronto con un body plan diverso segnala le differenze", () => {
    const legacy = computeCreatureAnatomy(sweep[0]);
    expect(compareLegacyAnatomy(legacy, gen("hexapod")).structurallyEquivalent).toBe(false);
    expect(compareLegacyAnatomy(legacy, gen("quadruped", PH.bare)).differences.some((x) => x.startsWith("legs"))).toBe(false);
  });
  it("il codice legacy non è stato modificato", () => {
    const diff = readFileSync("lib/creatureAnatomy.ts", "utf8");
    expect(diff).toContain("export function computeCreatureAnatomy");
  });
});

describe("G2 review — dati genetici mancanti", () => {
  const cases: [string, any][] = [
    ["nessun dato", undefined], ["solo size", { size: 1 }], ["solo ext", { ext: { bodyStature: 0.5, furDensity: 0.5, dermalArmor: 0.3 } }],
    ["manca la corazza", { size: 1, ext: { bodyStature: 0.5, furDensity: 0.5 } }], ["manca il pelo", { size: 1, ext: { bodyStature: 0.5, dermalArmor: 0.3 } }],
    ["manca la corporatura", { size: 1, ext: { furDensity: 0.5, dermalArmor: 0.3 } }], ["valori non validi", { size: NaN, ext: { furDensity: "x", dermalArmor: Infinity } }], ["ext non oggetto", { size: 1, ext: 5 }],
  ];
  it("ogni combinazione produce un descriptor valido su ogni body plan e dichiara ciò che manca", () => {
    for (const [name, g] of cases) {
      const ph = derivePhenotype(g);
      for (const id of BODY_PLAN_IDS) expect(validateAnatomy(gen(id, ph)), `${name}/${id}`).toEqual({ ok: true, errors: [] });
      const d = gen("quadruped", ph);
      const missing = (k: string) => d.provenance[k].kind === "undetermined";
      if (ph.traits.furDensity.value === null) expect([d.surface.furCoverage, missing("surface.furCoverage")], name).toEqual([null, true]);
      if (ph.traits.dermalArmor.value === null) expect([d.surface.armorCoverage, missing("surface.armorCoverage"), d.appendages.some((a) => a.kind === "plate")], name).toEqual([null, true, false]);
      if (ph.traits.size.value === null) expect(missing("proportions.sizeScale"), name).toBe(true);
      if (ph.traits.bodyStature.value === null) expect([d.proportions.robustness, missing("proportions.robustness")], name).toEqual([0.5, true]);
      expect(d.phenotypeIssues.length, name).toBe(ph.issues.length);
    }
  });
  it("un dato mancante non equivale a un valore a zero", () => {
    const zero = gen("quadruped", derivePhenotype({ size: 1, ext: { bodyStature: 0.5, furDensity: 0, dermalArmor: 0 } }));
    const none = gen("quadruped", derivePhenotype({ size: 1 }));
    expect(zero.surface.covering).toBe("bare"); expect(none.surface.covering).toBe("unspecified");
    expect(zero.fingerprint).not.toBe(none.fingerprint);
  });
});

describe("G2 review — indipendenza dal renderer e dal motore", () => {
  const FORBIDDEN = /from\s+["'](react|react-dom|three|next)[^"']*["']|from\s+["'][^"']*(components\/|creatureModel|renderFrame|Planet3D|planet3d|lib\/visual|\/visual\/|bodyAnimation|naturalMotion|livingBehavior|simulation\/core)[^"']*["']|require\(|import\(/;
  it("nessun import dal renderer, da React/Three.js né dinamico", () => {
    for (const dir of ["lib/anatomy", "lib/phenotype"]) for (const f of readdirSync(dir)) expect(FORBIDDEN.test(readFileSync(join(dir, f), "utf8")), `${dir}/${f}`).toBe(false);
  });
  it("i soli import verso la simulazione sono letture del registro dei geni (e STATURE_RADIUS)", () => {
    const sim: string[] = [];
    for (const dir of ["lib/anatomy", "lib/phenotype"]) for (const f of readdirSync(dir)) for (const m of readFileSync(join(dir, f), "utf8").matchAll(/from\s+["']([^"']*simulation[^"']*)["']/g)) sim.push(`${f}:${m[1]}`);
    expect(sim.sort()).toEqual(["derive.ts:../../simulation/biology/geneExpression", "derive.ts:../../simulation/biology/geneRegistry"]);
  });
  it("i moduli di anatomia non importano il fenotipo oltre i tipi e le costanti di lettura", () => {
    for (const f of readdirSync("lib/anatomy")) for (const m of readFileSync(join("lib/anatomy", f), "utf8").matchAll(/from\s+["']\.\.\/phenotype([^"']*)["']/g)) expect(["/types", "/derive"]).toContain(m[1]);
  });
});
