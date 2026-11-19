import { describe, it, expect } from "vitest";
import {
  buildCreatureVisualDescriptor,
  dietClassFromCarnivory,
  gaitFromSpeedNorm,
  type BuildVisualDescriptorInput,
} from "../lib/visual/creatureVisualDescriptor";
import { QUALITY_PROFILES } from "../lib/qualityProfile";
import { TRAIT_RANGES } from "../simulation/biology/genome";
import { speciesHue } from "../lib/speciesColor";
import type { RenderFrame } from "../types";

/**
 * G1 — CreatureVisualDescriptor: pure mapping tests.
 *
 * These tests only assert the read-only visual contract: deterministic output,
 * range clamping, LOD tiers and that the source frame is never mutated. No
 * biological rule is exercised or duplicated here.
 */

function makeFrame(overrides: Partial<Record<string, number>> = {}): RenderFrame {
  const o = {
    x: 256,
    y: 256,
    species: 3,
    size: 1.4,
    speed: TRAIT_RANGES.speed.min,
    carnivory: TRAIT_RANGES.carnivory.min,
    vision: TRAIT_RANGES.vision.min,
    evasion: TRAIT_RANGES.evasion.min,
    huntingSkill: TRAIT_RANGES.huntingSkill.min,
    ...overrides,
  };
  return {
    planetWidth: 512,
    planetHeight: 512,
    organismsX: new Float32Array([o.x]),
    organismsY: new Float32Array([o.y]),
    organismsSpecies: new Uint16Array([o.species]),
    organismsSize: new Float32Array([o.size]),
    organismsSpeed: new Float32Array([o.speed]),
    organismsCarnivory: new Float32Array([o.carnivory]),
    organismsVision: new Float32Array([o.vision]),
    organismsEvasion: new Float32Array([o.evasion]),
    organismsHuntingSkill: new Float32Array([o.huntingSkill]),
    organismsId: new Uint32Array([12345]),
  } as unknown as RenderFrame;
}

function build(overrides: Partial<Record<string, number>> = {}, input: Partial<BuildVisualDescriptorInput> = {}) {
  return buildCreatureVisualDescriptor({
    index: 0,
    frame: makeFrame(overrides),
    quality: QUALITY_PROFILES.alto,
    ...input,
  });
}

describe("dietClassFromCarnivory", () => {
  it("classifies low, mid and high carnivory", () => {
    expect(dietClassFromCarnivory(0)).toBe("herbivore");
    expect(dietClassFromCarnivory(0.3)).toBe("omnivore");
    expect(dietClassFromCarnivory(TRAIT_RANGES.carnivory.max)).toBe("carnivore");
  });

  it("is robust to out-of-range and non-finite values", () => {
    expect(dietClassFromCarnivory(-5)).toBe("herbivore");
    expect(dietClassFromCarnivory(Infinity)).toBe("carnivore");
  });
});

describe("gaitFromSpeedNorm", () => {
  it("maps normalized speed to a monotone gait ladder", () => {
    expect(gaitFromSpeedNorm(0)).toBe("idle");
    expect(gaitFromSpeedNorm(0.1)).toBe("walk");
    expect(gaitFromSpeedNorm(0.5)).toBe("trot");
    expect(gaitFromSpeedNorm(1.2)).toBe("run");
  });
});

describe("buildCreatureVisualDescriptor", () => {
  it("is deterministic for the same organism (stable look across frames)", () => {
    expect(build()).toEqual(build());
  });

  it("never mutates the source frame arrays", () => {
    const frame = makeFrame({ carnivory: 0.5, evasion: 0.4 });
    const before = {
      x: Array.from(frame.organismsX),
      y: Array.from(frame.organismsY),
      species: Array.from(frame.organismsSpecies),
      id: Array.from(frame.organismsId),
    };
    buildCreatureVisualDescriptor({ index: 0, frame, quality: QUALITY_PROFILES.alto });
    expect(Array.from(frame.organismsX)).toEqual(before.x);
    expect(Array.from(frame.organismsY)).toEqual(before.y);
    expect(Array.from(frame.organismsSpecies)).toEqual(before.species);
    expect(Array.from(frame.organismsId)).toEqual(before.id);
  });

  it("derives the base hue from the shared species palette", () => {
    const d = build({ species: 3 });
    expect(d.surface.baseHue).toBeCloseTo(speciesHue(3), 5);
    expect(Math.abs(d.surface.hueShift)).toBeLessThanOrEqual(7);
    expect(d.speciesId).toBe(3);
    expect(d.organismId).toBe(12345);
  });

  it("keeps normalized surface/morphology values inside their documented ranges", () => {
    const d = build({
      speed: TRAIT_RANGES.speed.max,
      carnivory: TRAIT_RANGES.carnivory.max,
      vision: TRAIT_RANGES.vision.max,
      evasion: TRAIT_RANGES.evasion.max,
      huntingSkill: TRAIT_RANGES.huntingSkill.max,
    });
    expect(d.morphology.ornamentation).toBeGreaterThanOrEqual(0);
    expect(d.morphology.ornamentation).toBeLessThanOrEqual(1);
    expect(d.surface.roughness).toBeGreaterThanOrEqual(0);
    expect(d.surface.roughness).toBeLessThanOrEqual(1);
    expect(d.surface.sheen).toBeGreaterThanOrEqual(0);
    expect(d.surface.sheen).toBeLessThanOrEqual(1);
    expect(d.motion.speedNorm).toBeGreaterThanOrEqual(0);
    expect(d.cues.locomotion).toBeGreaterThanOrEqual(0);
    expect(d.cues.locomotion).toBeLessThanOrEqual(1);
    expect(d.dietClass).toBe("carnivore");
  });

  it("never invents an alert cue (no real signal exists in the frame)", () => {
    expect(build().cues.alert).toBe(0);
  });

  it("reports resting only for a still creature, never while eating/moving", () => {
    const still = build({}, { visual: { visSpeed: 0, stillMs: 9000 } });
    expect(still.cues.resting).toBe(1);

    const moving = build({}, { visual: { visSpeed: 2, stillMs: 9000 } });
    expect(moving.cues.resting).toBe(0);

    const feeding = build({}, { visual: { visSpeed: 0, stillMs: 9000, energyGain: 0.5 } });
    expect(feeding.cues.feeding).toBe(1);
    expect(feeding.cues.resting).toBe(0);
  });

  it("gives a nearer/selected creature at least as much detail as a far/plain one", () => {
    const near = build({}, { visual: { cameraDistance: 1 }, selected: false });
    const far = build({}, { visual: { cameraDistance: 100000 }, selected: false });
    const farSelected = build({}, { visual: { cameraDistance: 100000 }, selected: true });

    expect(near.lod.geometryTier).toBeGreaterThanOrEqual(far.lod.geometryTier);
    expect(farSelected.lod.geometryTier).toBeGreaterThanOrEqual(far.lod.geometryTier);
    expect(near.lod.renderParts.head).toBe(true);
  });

  it("reduces detail on the lightest quality profiles", () => {
    const heavy = build({}, { quality: QUALITY_PROFILES.alto, visual: { cameraDistance: 1 } });
    const light = build({}, { quality: QUALITY_PROFILES.basso, visual: { cameraDistance: 1 } });
    expect(light.lod.geometryTier).toBeLessThanOrEqual(heavy.lod.geometryTier);
    expect(light.lod.materialTier).toBe(0);
    expect(light.lod.renderParts.limbs).toBe(false);
  });

  it("uses the interpolated render position when the renderer provides one", () => {
    const d = build({ x: 100, y: 100 }, { visual: { x: 120.5, y: 99.25 } });
    expect(d.gridPosition.x).toBeCloseTo(120.5, 5);
    expect(d.gridPosition.y).toBeCloseTo(99.25, 5);
  });
});
