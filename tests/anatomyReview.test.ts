import { describe, expect, it } from "vitest";
import {
  BODY_PLAN_CATALOG, checkAnatomyEnvelope, computeFingerprint, deserializeAnatomy,
  generateAnatomy, inspectAnatomy, serializeAnatomy, validateAnatomy,
  type AnatomyDescriptor,
} from "../lib/anatomy";
import { derivePhenotype } from "../lib/phenotype";

const phenotype = derivePhenotype({ size: 1.1, ext: { bodyStature: 0.7, furDensity: 0.6, dermalArmor: 0.3 } });
const gen = (id: string, extra: Partial<Parameters<typeof generateAnatomy>[0]> = {}) =>
  generateAnatomy({ phenotype, bodyPlan: BODY_PLAN_CATALOG[id], ...extra });
const clone = <T>(d: T): T => JSON.parse(JSON.stringify(d)) as T;
const refingerprint = (d: any): any => { d.fingerprint = computeFingerprint(d); return d; };

/** Esegue `fn` e restituisce il risultato, fallendo il test se lancia anche una sola eccezione. */
function noThrow<T>(fn: () => T): T {
  let out!: T;
  expect(() => { out = fn(); }).not.toThrow();
  return out;
}

describe("G-REV-01 — validazione e deserializzazione non throw", () => {
  const corruptions: [string, (d: any) => void][] = [
    ["null", (d) => { d.segments[1] = null; }],
    ["appendice null", (d) => { d.appendages[0] = null; }],
    ["articolazione null", (d) => { d.joints[0] = null; }],
    ["collezione con tipo errato", (d) => { d.joints = "non-un-array"; }],
    ["proporzioni mancanti", (d) => { delete d.proportions; }],
    ["anomalie dichiarate con tipo errato", (d) => { d.declaredAnomalies = "rotte"; }],
    ["coordinate NaN", (d) => { d.appendages[0].position.x = Number.NaN; }],
    ["coordinate infinite", (d) => { d.segments[0].center.y = Number.POSITIVE_INFINITY; }],
    ["dimensioni non numeriche", (d) => { d.appendages[0].length = "lungo"; }],
    ["sezioni non intere", (d) => { d.appendages[0].sectionCount = "due"; }],
    ["articolazione senza id", (d) => { delete d.joints[0].id; }],
    ["versione di schema incompleta", (d) => { d.schemaVersion = 0; }],
  ];

  it.each(corruptions)("inspectAnatomy non lancia: %s", (_name, mutate) => {
    const d = clone(gen("quadruped")) as any;
    mutate(d);
    const report = noThrow(() => inspectAnatomy(d));
    expect(report.ok).toBe(false);
    expect(report.status).toBe("INVALID");
    expect(report.errors.length).toBeGreaterThan(0);
  });

  it.each(corruptions)("deserializeAnatomy non lancia: %s", (_name, mutate) => {
    const d = clone(gen("quadruped")) as any;
    mutate(d);
    const result = noThrow(() => deserializeAnatomy(JSON.stringify(d)));
    expect(result.ok).toBe(false);
    expect(result.value).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("input primitivi, null e JSON non valido non lanciano", () => {
    for (const bad of [null, undefined, 42, "testo", [], { schemaVersion: 1 }, "{\"schemaVersion\":1,"]) {
      expect(noThrow(() => inspectAnatomy(bad)).ok).toBe(false);
      const r = noThrow(() => deserializeAnatomy(bad as string));
      expect(r.ok).toBe(false);
      expect(r.value).toBeNull();
    }
  });

  it("il gate strutturale blocca geometria non finita senza anticipare errori semantici", () => {
    const base = gen("hexapod") as any;
    expect(noThrow(() => checkAnatomyEnvelope(base, true)).ok).toBe(true);
    const duplicate = clone(base);
    duplicate.appendages = Array.from({ length: duplicate.appendages.length + 1 }, () => duplicate.appendages[0]);
    const gate = noThrow(() => checkAnatomyEnvelope(duplicate, true));
    expect(gate.ok).toBe(true); // il duplicato è un errore semantico, non un crash
    expect(validateAnatomy(duplicate).errors.some((e) => e.startsWith("duplicate-appendage"))).toBe(true);
    const nan = clone(base);
    nan.appendages[0].direction.z = Number.NaN;
    expect(noThrow(() => checkAnatomyEnvelope(nan, true)).ok).toBe(false);
  });

  it("un descrittore sintatticamente valido ma semanticamente corrotto viene rifiutato", () => {
    const d = refingerprint(clone(gen("biped"))) as any;
    const left = d.appendages.find((a: any) => a.side === "left" && a.kind === "leg");
    left.length += 0.5;
    const text = serializeAnatomy(refingerprint(d) as AnatomyDescriptor);
    const result = noThrow(() => deserializeAnatomy(text));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith("asymmetric-pair"))).toBe(true);
  });

  it("il formato envelope ammette AABB obsolete e la migrazione resta non throw", () => {
    const legacy = clone(gen("quadruped")) as any;
    for (const k of ["bodyExtents", "anatomicalExtents", "totalHeight", "groundClearanceStatus", "groundClearanceReason", "maxLimbLength"]) delete legacy.proportions[k];
    delete legacy.declaredAnomalies;
    expect(noThrow(() => checkAnatomyEnvelope(legacy, false)).ok).toBe(true);
    const result = noThrow(() => deserializeAnatomy(JSON.stringify(legacy)));
    expect(result.ok).toBe(true);
    expect(inspectAnatomy(result.value!).status).toBe("VALID");
  });
});

describe("G-REV-03 — simmetria radiale verificata sulla geometria", () => {
  it("rileva appendici raggruppate nella stessa direzione nonostante angoli dichiarati regolari", () => {
    const d = refingerprint(clone(gen("radial-sessile"))) as any;
    const arms = d.appendages.filter((a: any) => a.groupId === "arms" && a.angle !== null);
    expect(arms.length).toBeGreaterThan(2);
    const host = d.segments.find((s: any) => s.id === arms[0].segmentId);
    for (const a of arms) {
      // geometria clustered verso angolo 0, metadati `angle` lasciati intatti
      a.position.x = host.center.x + host.halfExtents.x * 0.95;
      a.position.y = host.center.y;
      a.position.z = host.center.z;
    }
    const report = noThrow(() => inspectAnatomy(refingerprint(d)));
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.startsWith("radial-spacing-geometric"))).toBe(true);
    expect(report.errors.some((e) => e.startsWith("radial-position"))).toBe(true);
  });

  it("rileva direzioni radiali incoerenti con l'angolo dichiarato", () => {
    const d = refingerprint(clone(gen("radial-sessile"))) as any;
    const arms = d.appendages.filter((a: any) => a.groupId === "arms" && a.angle !== null);
    arms[1].direction = { x: 0, y: 1, z: 0 };
    const report = noThrow(() => inspectAnatomy(refingerprint(d)));
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.startsWith("radial-direction"))).toBe(true);
  });

  it(" una geometria radiale corretta resta VALID", () => {
    for (const seed of [1, 7, 42]) {
      const report = inspectAnatomy(gen("radial-sessile", { seed }));
      expect(report.errors.filter((e) => e.startsWith("radial-"))).toEqual([]);
      expect(report.status).toBe("VALID");
    }
  });
});

describe("G-REV-04 — anomalia dispari non esonera le altre coppie", () => {
  it("una coppia sfalsata manomessa resta un errore anche con un elemento spaiato dichiarato", () => {
    const d = refingerprint(clone(gen("quadruped", { appendageCounts: { legs: 5 } }))) as any;
    expect(d.declaredAnomalies.some((a: any) => a.code === "odd-appendage-count:legs")).toBe(true);
    const paired = d.appendages.find((a: any) => a.id === "legs-0");
    paired.length *= 1.4;
    const report = noThrow(() => inspectAnatomy(refingerprint(d)));
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.startsWith("asymmetric-pair:legs"))).toBe(true);
  });

  it("più di un elemento spaiato viene rilevato", () => {
    const d = refingerprint(clone(gen("quadruped", { appendageCounts: { legs: 5 } }))) as any;
    const second = d.appendages.find((a: any) => a.id === "legs-3");
    second.side = "right";
    const report = noThrow(() => inspectAnatomy(refingerprint(d)));
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.startsWith("odd-unpaired-count:legs"))).toBe(true);
  });

  it("il solo elemento spaiato può differire senza invalidare il gruppo", () => {
    const d = gen("quadruped", { appendageCounts: { legs: 5 } });
    const report = inspectAnatomy(d);
    expect(report.status).toBe("WARNING");
    expect(report.errors).toEqual([]);
    expect(report.warnings).toContain("odd-appendage-count:legs");
  });
});
