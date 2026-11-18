import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeCreatureAnatomy } from "../lib/creatureAnatomy";
import { derivePhenotype } from "../lib/phenotype";
import {
  BODY_PLAN_CATALOG, BODY_PLAN_IDS, MAX_APPENDAGES, REQUIRED_PROVENANCE_KEYS, anatomyFromPhenotype, compareLegacyAnatomy, deserializeAnatomy,
  descriptorFromLegacyAnatomy, descriptorFromLegacyTraits, generateAnatomy, generateAnatomyCached, reduceAnatomyDetail, serializeAnatomy,
  speculativeBodyPlanId, validateAnatomy, validateBodyPlanSpec, type AnatomyDescriptor,
} from "../lib/anatomy";

const noArmor = derivePhenotype({ size: 1, ext: { bodyStature: 0.5, furDensity: 0.2, dermalArmor: 0 } });
const genome = { size: 1.1, ext: { bodyStature: 0.7, furDensity: 0.6, dermalArmor: 0.3 } };
const ph = derivePhenotype(genome);
const gen = (id: string, extra: Partial<Parameters<typeof generateAnatomy>[0]> = {}) => generateAnatomy({ phenotype: ph, bodyPlan: BODY_PLAN_CATALOG[id], ...extra });
const clone = (d: AnatomyDescriptor) => JSON.parse(JSON.stringify(d));

describe("G2 anatomia — determinismo", () => {
  it("stesso input → stesso descriptor, stesso fingerprint, stessa serializzazione", () => {
    for (const id of BODY_PLAN_IDS) {
      const a = gen(id, { seed: 42 }), b = gen(id, { seed: 42 });
      expect(a.fingerprint).toBe(b.fingerprint);
      expect(serializeAnatomy(a)).toBe(serializeAnatomy(b));
    }
  });
  it("il seme cambia solo la variazione estetica, non la struttura né la provenienza biologica", () => {
    const a = gen("quadruped", { seed: 1 }), b = gen("quadruped", { seed: 2 });
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(a.complexity).toEqual(b.complexity);
    expect(a.appendages.map((x) => x.kind)).toEqual(b.appendages.map((x) => x.kind));
    expect(a.surface).toEqual(b.surface);
    expect(gen("quadruped").aesthetic.seed).toBeNull();
  });
  it("la cache restituisce lo stesso oggetto immutabile e coincide con la generazione diretta", () => {
    const input = { phenotype: ph, bodyPlan: BODY_PLAN_CATALOG.hexapod, seed: 7 };
    const c1 = generateAnatomyCached(input), c2 = generateAnatomyCached({ ...input });
    expect(c1).toBe(c2);
    expect(c1.fingerprint).toBe(generateAnatomy(input).fingerprint);
    expect(Object.isFrozen(c1)).toBe(true);
    expect(Object.isFrozen(c1.segments[0].center)).toBe(true);
  });
});

describe("G2 anatomia — body plan e validità", () => {
  it("tutti gli spec del catalogo sono coerenti e producono descriptor validi", () => {
    expect(BODY_PLAN_IDS.length).toBeGreaterThanOrEqual(12);
    for (const id of BODY_PLAN_IDS) {
      expect(validateBodyPlanSpec(BODY_PLAN_CATALOG[id])).toEqual([]);
      for (const seed of [undefined, 3, 99]) expect(validateAnatomy(gen(id, { seed })), `${id}/${String(seed)}`).toEqual({ ok: true, errors: [] });
    }
  });
  it("rappresenta le famiglie A–D e strutture molto diverse con gli stessi componenti", () => {
    const fams = new Set(BODY_PLAN_IDS.map((id) => gen(id).bodyPlan.family));
    expect([...fams].sort()).toEqual(["complex", "multicellular", "simple", "specialized"]);
    const legs = (id: string) => gen(id).appendages.filter((a) => a.kind === "leg").length;
    expect([legs("biped"), legs("quadruped"), legs("hexapod"), legs("many-legged"), legs("limbless-serpentine"), legs("simple-sphere")]).toEqual([2, 4, 6, 16, 0, 0]);
    expect([gen("biped").locomotion.mode, gen("quadruped").locomotion.mode, gen("hexapod").locomotion.mode, gen("many-legged").locomotion.mode, gen("limbless-serpentine").locomotion.mode]).toEqual(["bipedal", "quadrupedal", "hexapodal", "multipedal", "undulatory"]);
    expect(generateAnatomy({ phenotype: noArmor, bodyPlan: BODY_PLAN_CATALOG["simple-sphere"] }).symmetry).toEqual({ type: "spherical", order: 0 });
    expect(gen("simple-sphere").symmetry.type).toBe("radial"); // con placche dorsali la sfera non è più isotropa
    expect(generateAnatomy({ phenotype: noArmor, bodyPlan: BODY_PLAN_CATALOG["radial-sessile"] }).symmetry).toEqual({ type: "radial", order: 5 });
    expect(gen("simple-asymmetric").symmetry.type).toBe("none");
    expect(gen("armored-specialist").complexity.level).toBeGreaterThanOrEqual(gen("simple-sphere").complexity.level);
  });
  it("supporta un numero variabile di appendici, con limiti", () => {
    for (const n of [0, 1, 2, 3, 7, 16, 40]) {
      const d = gen("many-legged", { appendageCounts: { legs: n } });
      const expected = Math.max(2, Math.min(40, n));
      expect(d.appendages.filter((a) => a.kind === "leg").length).toBe(expected);
      expect(validateAnatomy(d).errors).toEqual([]);
    }
    expect(gen("many-legged", { appendageCounts: { legs: 100000 } }).appendages.filter((a) => a.kind === "leg").length).toBe(40);
    expect(generateAnatomy({ phenotype: noArmor, bodyPlan: BODY_PLAN_CATALOG["radial-sessile"], appendageCounts: { arms: 8 } }).symmetry.order).toBe(8);
    expect(gen("quadruped", { appendageCounts: { legs: Number.NaN } }).appendages.filter((a) => a.kind === "leg").length).toBe(4);
    const many = generateAnatomy({ phenotype: derivePhenotype({ size: 1, ext: { dermalArmor: 0.6 } }), bodyPlan: BODY_PLAN_CATALOG["many-legged"], appendageCounts: { legs: 40, antennae: 4 } });
    expect(many.appendages.length).toBeLessThanOrEqual(MAX_APPENDAGES);
    expect(validateAnatomy(many).ok).toBe(true);
  });
  it("le appendici dispari restano valide e le coppie bilaterali sono speculari", () => {
    const d = gen("quadruped", { appendageCounts: { legs: 5 } });
    expect(d.appendages.filter((a) => a.kind === "leg").length).toBe(5);
    expect(validateAnatomy(d).ok).toBe(true);
    const sym = gen("biped", { seed: 5 });
    for (const a of sym.appendages.filter((x) => x.side === "left")) {
      const m = sym.appendages.find((b) => b.side === "right" && b.groupId === a.groupId && Math.abs(b.position.x + a.position.x) < 1e-9 && b.position.z === a.position.z);
      expect(m && m.length === a.length && m.radius === a.radius).toBe(true);
    }
  });
});

describe("G2 anatomia — coerenza dei riferimenti", () => {
  const base = gen("hexapod");
  it("rileva riferimenti spezzati tra segmenti, appendici e articolazioni", () => {
    const cases: [string, (d: any) => void][] = [
      ["unknown-parent", (d) => { d.segments[0].parentId = "nope"; }],
      ["appendage-unknown-segment", (d) => { d.appendages[0].segmentId = "nope"; }],
      ["root-bad-reference", (d) => { d.joints.find((j: any) => j.kind === "root").appendageId = "nope"; }],
      ["duplicate-segment", (d) => { d.segments[1].id = d.segments[0].id; }],
      ["axial-bad-reference", (d) => { d.joints.find((j: any) => j.kind === "axial").parentSegmentId = "nope"; }],
      ["appendage-internal-joints", (d) => { d.joints = d.joints.filter((j: any) => j.kind !== "internal"); }],
      ["bad-dimensions", (d) => { d.appendages[0].length = -1; }],
      ["too-many-appendages", (d) => { d.appendages = Array.from({ length: MAX_APPENDAGES + 1 }, () => d.appendages[0]); }],
    ];
    for (const [expected, mutate] of cases) {
      const d = clone(base);
      mutate(d);
      expect(validateAnatomy(d).errors.some((e) => e.startsWith(expected)), expected).toBe(true);
    }
  });
  it("rileva simmetrie rotte, conteggi incoerenti e fingerprint alterato", () => {
    const a = clone(gen("quadruped")); a.appendages.find((x: any) => x.side === "left").length += 0.5;
    expect(validateAnatomy(a).errors.some((e) => e.startsWith("asymmetric-pair"))).toBe(true);
    const b = clone(base); b.complexity.appendageCount += 1;
    expect(validateAnatomy(b).errors).toContain("complexity-mismatch");
    const c = clone(base); c.proportions.sizeScale = 9;
    expect(validateAnatomy(c).errors).toContain("fingerprint-mismatch");
    expect(validateAnatomy(null).ok).toBe(false);
    expect(validateAnatomy({ schemaVersion: 99 }).errors[0]).toMatch(/unsupported/);
  });
});

describe("G2 anatomia — serializzazione", () => {
  it("round-trip esatto per ogni body plan", () => {
    for (const id of BODY_PLAN_IDS) {
      const d = gen(id, { seed: 11 });
      const r = deserializeAnatomy(serializeAnatomy(d));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual(d);
    }
  });
  it("rifiuta JSON corrotto, versioni sconosciute e dati manomessi senza lanciare", () => {
    const d = gen("quadruped");
    expect(deserializeAnatomy("{").errors).toEqual(["invalid-json"]);
    expect(deserializeAnatomy(JSON.stringify({ ...d, schemaVersion: 99 })).ok).toBe(false);
    expect(deserializeAnatomy(serializeAnatomy(d).replace('"mid"', '"left"')).ok).toBe(false);
    expect(deserializeAnatomy(123 as unknown as string).ok).toBe(false);
  });
});

describe("G2 anatomia — dettaglio adattivo (LOD)", () => {
  it("ogni livello è valido e non cresce al ridursi del dettaglio", () => {
    for (const id of BODY_PLAN_IDS) {
      const full = gen(id);
      let prev = full.complexity.score;
      for (const tier of [3, 2, 1, 0] as const) {
        const r = reduceAnatomyDetail(full, tier);
        expect(validateAnatomy(r), `${id}@${tier}`).toEqual({ ok: true, errors: [] });
        expect(r.complexity.score).toBeLessThanOrEqual(prev);
        prev = r.complexity.score;
        expect(r.locomotion.mode).toBe(full.locomotion.mode);
      }
      expect(reduceAnatomyDetail(full, 3)).toBe(full);
      expect(gen(id, { lod: 1 }).lod).toBe(id === "simple-sphere" ? 1 : 1);
    }
  });
});

describe("G2 anatomia — nessuna dipendenza dal renderer", () => {
  it("i moduli lib/anatomy e lib/phenotype non importano React, Three.js né renderer", () => {
    const forbidden = /from\s+["'](react|react-dom|three|next)[^"']*["']|from\s+["'][^"']*(components\/|creatureModel|renderFrame|Planet3D|planet3d|lib\/visual|\/visual\/|bodyAnimation|naturalMotion)[^"']*["']/;
    for (const dir of ["lib/anatomy", "lib/phenotype"]) {
      for (const f of readdirSync(dir)) {
        const src = readFileSync(join(dir, f), "utf8");
        expect(forbidden.test(src), `${dir}/${f}`).toBe(false);
      }
    }
  });
});

describe("G2 anatomia — compatibilità con i dati precedenti", () => {
  const traits = [
    { speed: 1.0, carnivory: 0.0, vision: 3, evasion: 0.1, huntingSkill: 0.1 },
    { speed: 2.2, carnivory: 0.9, vision: 8, evasion: 0.8, huntingSkill: 0.8 },
    { speed: 1.5, carnivory: 0.4, vision: 5, evasion: 0.5, huntingSkill: 0.4 },
  ];
  it("converte l'anatomia legacy in un descriptor valido e strutturalmente equivalente", () => {
    for (const t of traits) {
      const legacy = computeCreatureAnatomy(t);
      const d = descriptorFromLegacyAnatomy(legacy);
      expect(validateAnatomy(d)).toEqual({ ok: true, errors: [] });
      expect(compareLegacyAnatomy(legacy, d)).toEqual({ structurallyEquivalent: true, differences: [] });
      expect(descriptorFromLegacyTraits(t).fingerprint).toBe(d.fingerprint);
      expect(deserializeAnatomy(serializeAnatomy(d)).ok).toBe(true);
    }
  });
  it("le euristiche legacy risultano estetiche: nessun dato genetico dichiarato", () => {
    const d = descriptorFromLegacyAnatomy(computeCreatureAnatomy(traits[1]));
    for (const k of REQUIRED_PROVENANCE_KEYS) expect(["aesthetic", "undetermined"]).toContain(d.provenance[k].kind);
    expect(d.surface).toEqual({ covering: "unspecified", furCoverage: null, armorCoverage: null });
  });
  it("il confronto segnala le differenze invece di nasconderle", () => {
    const legacy = computeCreatureAnatomy(traits[1]);
    const cmp = compareLegacyAnatomy(legacy, gen("biped"));
    expect(cmp.structurallyEquivalent).toBe(false);
    expect(cmp.differences.some((x) => x.startsWith("legs"))).toBe(true);
    // il body plan di default per le creature esistenti è un quadrupede strutturalmente confrontabile
    expect(anatomyFromPhenotype(ph).bodyPlan.origin).toBe("legacy-default");
    expect(anatomyFromPhenotype(ph).locomotion.mode).toBe("quadrupedal");
  });
  it("il codice legacy resta invariato nei suoi contratti", () => {
    const a = computeCreatureAnatomy(traits[0]);
    expect(a.legLength).toBeGreaterThan(0);
    expect(a.spikes.length).toBeLessThanOrEqual(3);
  });
});

describe("G2 anatomia — nessuna caratteristica genetica inventata", () => {
  const withGenome = (g: { size?: number; ext?: Record<string, number> }) => generateAnatomy({ phenotype: derivePhenotype(g), bodyPlan: BODY_PLAN_CATALOG.quadruped, seed: 3 });
  const ref = withGenome(genome);
  it("velocità, carnivoria, vista, evasione, caccia e altri geni non cambiano l'anatomia", () => {
    const g = { ...genome, speed: 2.5, carnivory: 1, vision: 9, evasion: 0.9, huntingSkill: 1, ext: { ...genome.ext, endurance: 1, burstPower: 1, peripheralAcuity: 1, energyReserve: 1 } };
    expect(withGenome(g).fingerprint).toBe(ref.fingerprint);
    expect(ref.appendages.some((a) => a.kind === "jaw" || a.kind === "claw")).toBe(false);
    expect(ref.appendages.filter((a) => a.kind === "leg").length).toBe(4);
  });
  it("i geni morfologici modificano solo ciò che dichiarano di codificare", () => {
    const stat = withGenome({ ...genome, ext: { ...genome.ext, bodyStature: 0.1 } });
    expect(stat.proportions.robustness).not.toBe(ref.proportions.robustness);
    expect(stat.appendages.length).toBe(ref.appendages.length);
    const bare = withGenome({ ...genome, ext: { ...genome.ext, dermalArmor: 0 } });
    expect(bare.appendages.filter((a) => a.kind === "plate").length).toBe(0);
    expect(ref.appendages.filter((a) => a.kind === "plate").length).toBeGreaterThan(0);
    expect(withGenome({ ...genome, size: 2.4 }).proportions.sizeScale).toBeGreaterThan(ref.proportions.sizeScale);
  });
  it("ogni provenienza genetica cita solo geni morfologici del registro; struttura e locomozione sono 'undetermined'", () => {
    for (const id of BODY_PLAN_IDS) {
      const d = gen(id, { seed: 5 });
      for (const k of REQUIRED_PROVENANCE_KEYS) expect(d.provenance[k], `${id}:${k}`).toBeDefined();
      for (const k of ["bodyPlan", "symmetry", "segmentation", "appendages", "locomotion"]) expect(d.provenance[k].kind).toBe("undetermined");
      expect(d.provenance.aesthetic.kind).toBe("aesthetic");
    }
    expect(ref.provenance["surface.furCoverage"]).toMatchObject({ kind: "gene-direct", genes: ["MOR-01"] });
    expect(ref.provenance["proportions.robustness"]).toMatchObject({ kind: "gene-direct", genes: ["MOR-03"] });
    expect(ref.provenance.armorPlates).toMatchObject({ kind: "gene-derived", genes: ["MOR-02"] });
  });
  it("il validatore rifiuta una provenienza che cita geni non morfologici", () => {
    const d = clone(ref);
    d.provenance.locomotion = { kind: "gene-derived", genes: ["speed"], certainty: "derived" };
    expect(validateAnatomy(d).errors).toContain("provenance-non-morphological-gene:locomotion:speed");
  });
  it("con dati genetici mancanti genera comunque un descriptor valido e dichiara i limiti", () => {
    const d = generateAnatomy({ phenotype: derivePhenotype(undefined), bodyPlan: BODY_PLAN_CATALOG.quadruped });
    expect(validateAnatomy(d).ok).toBe(true);
    expect(d.surface).toEqual({ covering: "unspecified", furCoverage: null, armorCoverage: null });
    expect(d.phenotypeIssues.length).toBe(4);
    for (const k of ["surface.furCoverage", "surface.armorCoverage", "proportions.sizeScale", "proportions.robustness"]) expect(d.provenance[k].kind).toBe("undetermined");
  });
  it("l'opzione speculativa dipende solo dal seme ed è marcata come tale", () => {
    expect(speculativeBodyPlanId(10)).toBe(speculativeBodyPlanId(10));
    const a = anatomyFromPhenotype(ph, { seed: 10, speculativeBodyPlan: true });
    expect(a.bodyPlan.origin).toBe("seeded-speculative");
    expect(a.provenance.bodyPlan.kind).toBe("undetermined");
    const noSeed = anatomyFromPhenotype(ph, { speculativeBodyPlan: true });
    expect(noSeed.bodyPlan.origin).toBe("legacy-default");
    const ids = new Set(Array.from({ length: 200 }, (_, i) => speculativeBodyPlanId(i)));
    expect(ids.size).toBeGreaterThan(6);
  });
});
