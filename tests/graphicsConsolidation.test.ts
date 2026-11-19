import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeCreatureAnatomy } from "../lib/creatureAnatomy";
import { derivePhenotype } from "../lib/phenotype";
import { TRAIT_RANGES } from "../simulation/biology/genome";
import { QUALITY_PROFILES } from "../lib/qualityProfile";
import {
  BODY_PLAN_CATALOG, BODY_PLAN_IDS,
  deserializeAnatomy, descriptorFromLegacyTraits, generateAnatomy, reduceAnatomyDetail, serializeAnatomy,
  type AnatomyDescriptor,
} from "../lib/anatomy";
import {
  buildCreatureVisualDescriptor, organismHueShift, projectAnatomyToVisual,
} from "../lib/visual";
import type { RenderFrame } from "../types";

const traits = {
  speed: 1.4, carnivory: 0.6, vision: 5, evasion: 0.3, huntingSkill: 0.5,
};
const mid = (k: keyof typeof TRAIT_RANGES) => (TRAIT_RANGES[k].min + TRAIT_RANGES[k].max) / 2;
const phenotype = derivePhenotype({ size: 1.1, ext: { bodyStature: 0.7, furDensity: 0.6, dermalArmor: 0.3 } });

function frame(organismId: number): RenderFrame {
  return {
    planetWidth: 512,
    planetHeight: 512,
    organismsX: new Float32Array([100]),
    organismsY: new Float32Array([200]),
    organismsSpecies: new Uint16Array([7]),
    organismsSize: new Float32Array([1.1]),
    organismsSpeed: new Float32Array([mid("speed")]),
    organismsCarnivory: new Float32Array([mid("carnivory")]),
    organismsVision: new Float32Array([mid("vision")]),
    organismsEvasion: new Float32Array([mid("evasion")]),
    organismsHuntingSkill: new Float32Array([mid("huntingSkill")]),
    organismsId: new Uint32Array([organismId]),
  } as unknown as RenderFrame;
}

describe("G-consolidamento — ponte AnatomyDescriptor ↔ vocabolario visivo G1", () => {
  it("è puro, deterministico e non muta il descriptor", () => {
    const d = descriptorFromLegacyTraits(traits, { seed: 123 });
    const before = serializeAnatomy(d);
    const a = projectAnatomyToVisual(d);
    const b = projectAnatomyToVisual(d);
    expect(a).toEqual(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.morphology)).toBe(true);
    expect(Object.isFrozen(a.renderSupport.reasons)).toBe(true);
    expect(serializeAnatomy(d)).toBe(before);
  });

  it("l'adattatore legacy mantiene le misure reali del renderer G1", () => {
    for (const t of [traits, { speed: 0.2, carnivory: 0.05, vision: 1, evasion: 0.9, huntingSkill: 0.1 }]) {
      const legacy = computeCreatureAnatomy(t);
      const d = descriptorFromLegacyTraits(t);
      const projected = projectAnatomyToVisual(d).morphology;
      const torso = d.segments.find((s) => s.role === "trunk");
      expect(torso?.halfExtents.z).toBeCloseTo(legacy.bodyHalfLength, 5);
      expect(torso?.halfExtents.x).toBeCloseTo(legacy.bodyHalfWidth, 5);
      expect(torso?.halfExtents.y).toBeCloseTo(legacy.bodyHalfHeight, 5);
      expect(projected.bodyLength).toBe(d.proportions.bodyLength);
      expect(projected.headScale).toBeCloseTo(legacy.headRadius, 5);
      expect(projected.limbLength).toBeCloseTo(legacy.legLength, 5);
      expect(projected.tailLength).toBeCloseTo(legacy.tailLength, 5);
      expect(projected.ornamentation).toBeCloseTo(Math.min(1, legacy.spikes.length / 8), 5);
    }
  });

  it("non confonde ground clearance e lunghezza massima delle zampe", () => {
    for (const t of [traits, { speed: 0.2, carnivory: 0.05, vision: 1, evasion: 0.9, huntingSkill: 0.1 }]) {
      const projected = projectAnatomyToVisual(descriptorFromLegacyTraits(t));
      expect(projected.groundClearance).not.toBeNull();
      expect(projected.groundClearanceStatus).toBe("determined");
      expect(projected.groundClearance).not.toBeCloseTo(projected.maxLimbLength, 3);
    }
    const unsupported = projectAnatomyToVisual(generateAnatomy({ phenotype, bodyPlan: BODY_PLAN_CATALOG["radial-sessile"] }));
    expect(unsupported.groundClearance).toBeNull();
    expect(unsupported.groundClearanceStatus).toBe("undetermined");
  });

  it("G1 e ponte G2 usano la stessa variazione cromatica per individuo", () => {
    const id = 123;
    const g1 = buildCreatureVisualDescriptor({ index: 0, frame: frame(id), quality: QUALITY_PROFILES.alto });
    const bridged = projectAnatomyToVisual(descriptorFromLegacyTraits(traits, { seed: id }));
    expect(bridged.surface.hueShift).toBe(organismHueShift(id));
    expect(g1.surface.hueShift).toBe(bridged.surface.hueShift);
  });

  it("dichiara il supporto del renderer invece di presumere equivalenza", () => {
    const legacy = projectAnatomyToVisual(descriptorFromLegacyTraits(traits));
    expect(legacy.renderSupport.supported).toBe(true);
    expect(legacy.renderSupport.exactGeometry).toBe(true);
    expect(legacy.renderSupport.reasons).toEqual([]);

    for (const id of BODY_PLAN_IDS) {
      const projected = projectAnatomyToVisual(generateAnatomy({ phenotype, bodyPlan: BODY_PLAN_CATALOG[id], seed: 7 }));
      expect(Number.isFinite(projected.morphology.bodyLength)).toBe(true);
      expect(Number.isFinite(projected.surface.roughness)).toBe(true);
      if (id === "radial-sessile" || id === "many-legged" || id === "simple-sphere") {
        expect(projected.renderSupport.supported).toBe(false);
        expect(projected.renderSupport.reasons.length).toBeGreaterThan(0);
      }
    }
  });

  it("i LOD G2 restano proiettabili e non inventano ground clearance", () => {
    const base = generateAnatomy({ phenotype, bodyPlan: BODY_PLAN_CATALOG.quadruped, seed: 11 });
    for (const lod of [0, 1, 2, 3] as const) {
      const reduced: AnatomyDescriptor = reduceAnatomyDetail(base, lod);
      const projected = projectAnatomyToVisual(reduced);
      expect(projected.morphology.bodyLength).toBeGreaterThan(0);
      expect(projected.morphology.limbLength).toBeGreaterThanOrEqual(0);
      expect(projected.groundClearance === null || projected.groundClearanceStatus === "determined").toBe(true);
      expect(projected.morphology.bodyLength).toBeLessThanOrEqual(projectAnatomyToVisual(base).morphology.bodyLength + 1e-9);
    }
  });

  it("il round-trip di serializzazione preserva la proiezione", () => {
    const d = descriptorFromLegacyTraits(traits, { seed: 99 });
    const parsed = deserializeAnatomy(serializeAnatomy(d));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(projectAnatomyToVisual(parsed.value)).toEqual(projectAnatomyToVisual(d));
  });

  it("il ponte non introduce dipendenze da renderer, simulazione o Three.js", () => {
    const src = readFileSync("lib/visual/anatomyVisualBridge.ts", "utf8");
    expect(src).not.toMatch(/from\s+["']three["']/);
    expect(src).not.toMatch(/from\s+["']\.\.\/\.\.\/components\//);
    expect(src).not.toMatch(/from\s+["']\.\.\/\.\.\/simulation\//);
    expect(src).not.toMatch(/from\s+["']\.\.\/anatomy\/(generate|assemble|bodyPlan|lod|validate)["']/);
  });
});
