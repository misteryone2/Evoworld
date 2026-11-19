import { describe, expect, it } from "vitest";
import { speculativeBodyPlanId } from "../lib/anatomy/bodyPlan";
import { createRuntimeAnatomyRenderSource } from "../lib/visual/runtimeAnatomyRenderSource";
import { TRAIT_RANGES } from "../simulation/biology/genome";
import type { RenderFrame } from "../types";

const ID = 7;
const mid = (key: keyof typeof TRAIT_RANGES) => (TRAIT_RANGES[key].min + TRAIT_RANGES[key].max) / 2;

function speciesFor(bodyPlanId: string): number {
  const found = Array.from({ length: 512 }, (_, speciesId) => speciesId)
    .find((speciesId) => speculativeBodyPlanId(speciesId) === bodyPlanId);
  expect(found).toBeGreaterThanOrEqual(0);
  return found!;
}

interface FrameOptions {
  id?: number;
  speciesId?: number;
  size?: number;
  carnivory?: number;
  stature?: number;
  fur?: number;
  armor?: number;
  presence?: number;
  withMorphology?: boolean;
  tick?: number;
}

function frameFor(options: FrameOptions = {}): RenderFrame {
  const withMorphology = options.withMorphology !== false;
  return {
    tick: options.tick ?? 5,
    year: 1,
    planetWidth: 256,
    planetHeight: 256,
    organismsX: new Float32Array([128]),
    organismsY: new Float32Array([128]),
    organismsSpecies: new Uint16Array([options.speciesId ?? speciesFor("biped")]),
    organismsSize: new Float32Array([options.size ?? 1.1]),
    organismsSpeed: new Float32Array([mid("speed")]),
    organismsCarnivory: new Float32Array([options.carnivory ?? 0.4]),
    organismsVision: new Float32Array([mid("vision")]),
    organismsEvasion: new Float32Array([mid("evasion")]),
    organismsHuntingSkill: new Float32Array([mid("huntingSkill")]),
    organismsId: new Uint32Array([options.id ?? ID]),
    ...(withMorphology ? {
      organismsBodyStature: new Float32Array([options.stature ?? 0.55]),
      organismsFurDensity: new Float32Array([options.fur ?? 0.6]),
      organismsDermalArmor: new Float32Array([options.armor ?? 0.45]),
      organismsMorphologyPresence: new Uint8Array([options.presence ?? 7]),
    } : {}),
  } as unknown as RenderFrame;
}

/** Esegue due sync con lo stesso contenuto e restituisce i piani ottenuti. */
function syncTwice(first: RenderFrame, second: RenderFrame) {
  const source = createRuntimeAnatomyRenderSource("cache-test");
  source.syncFrame(first);
  const before = source.planFor(first.organismsId[0], first.tick);
  source.syncFrame(second);
  const after = source.planFor(second.organismsId[0], second.tick);
  return { source, before, after };
}

describe("G3 — correttezza cache anatomica e sincronizzazione RenderFrame", () => {
  it("stesso input riutilizza il piano senza rigenerare l'anatomia", () => {
    const first = frameFor();
    const { source, before, after } = syncTwice(first, frameFor());
    expect(before).not.toBeNull();
    expect(after).toBe(before);
    expect(source.stats()).toMatchObject({ generated: 0, reused: 1, invalid: 0, unsupported: 0 });
  });

  it("variazione della carnivoria invalid la cache e aggiorna l'aggressività", () => {
    const source = createRuntimeAnatomyRenderSource();
    const first = frameFor({ carnivory: 0.1 });
    source.syncFrame(first);
    const before = source.planFor(ID, first.tick)!;
    expect(before.geometry!.aggression).toBeCloseTo(0.1, 5);

    const changed = frameFor({ carnivory: 0.85 });
    source.syncFrame(changed);
    const after = source.planFor(ID, changed.tick)!;
    expect(source.stats()).toMatchObject({ generated: 1, reused: 0 });
    expect(after).not.toBe(before);
    expect(after.geometry!.aggression).toBeCloseTo(0.85, 5);
  });

  it("variazione della taglia invalida e aggiorna sizeScale", () => {
    const source = createRuntimeAnatomyRenderSource();
    source.syncFrame(frameFor({ size: 0.9 }));
    const before = source.planFor(ID, 5)!;
    const changed = frameFor({ size: 2.4 });
    source.syncFrame(changed);
    const after = source.planFor(ID, 5)!;
    expect(after).not.toBe(before);
    expect(after.geometry!.sizeScale).toBeGreaterThan(before.geometry!.sizeScale);
    expect(source.stats().generated).toBe(1);
  });

  it("due taglie nello stesso bucket 1/4096 ma con bit Float32 diversi producono piani diversi", () => {
    const source = createRuntimeAnatomyRenderSource();
    source.syncFrame(frameFor({ size: 1 }));
    const before = source.planFor(ID, 5)!;
    source.syncFrame(frameFor({ size: 1.00001 }));
    const after = source.planFor(ID, 5)!;
    expect(after).not.toBe(before);
    expect(source.stats().generated).toBe(1);
  });

  it("variazione dei tre geni MOR invalida e cambia il fingerprint", () => {
    for (const options of [{ stature: 0.95 }, { fur: 0.2 }, { armor: 0.9 }]) {
      const source = createRuntimeAnatomyRenderSource();
      source.syncFrame(frameFor());
      const before = source.planFor(ID, 5)!;
      source.syncFrame(frameFor(options));
      const after = source.planFor(ID, 5)!;
      expect(after, JSON.stringify(options)).not.toBe(before);
      expect(after.geometry!.sourceFingerprint).not.toBe(before.geometry!.sourceFingerprint);
    }
  });

  it("variazione della specie invalida e cambia il body plan", () => {
    const source = createRuntimeAnatomyRenderSource();
    const first = frameFor({ speciesId: speciesFor("biped") });
    source.syncFrame(first);
    const before = source.planFor(ID, 5)!;
    const changed = frameFor({ speciesId: speciesFor("radial-sessile") });
    source.syncFrame(changed);
    const after = source.planFor(ID, 5)!;
    expect(after).not.toBe(before);
    expect(after.geometry!.sourceFingerprint).not.toBe(before.geometry!.sourceFingerprint);
    expect(source.stats().generated).toBe(1);
  });

  it("variazione dell'identità dell'organismo rimuove la voce vecchia", () => {
    const source = createRuntimeAnatomyRenderSource();
    const first = frameFor({ id: 11 });
    source.syncFrame(first);
    expect(source.planFor(11, 5)).not.toBeNull();
    source.syncFrame(frameFor({ id: 12 }));
    expect(source.planFor(11, 5)).toBeNull();
    expect(source.planFor(12, 5)).not.toBeNull();
    expect(source.stats().pruned).toBe(1);
  });

  it("mutazione in posto sugli stessi buffer viene rilevata anche nello stesso tick", () => {
    const frame = frameFor();
    const source = createRuntimeAnatomyRenderSource();
    source.syncFrame(frame);
    const before = source.planFor(ID, frame.tick)!;

    frame.organismsCarnivory[0] = 0.9;
    source.syncFrame(frame);
    const afterCarnivory = source.planFor(ID, frame.tick)!;
    expect(afterCarnivory).not.toBe(before);
    expect(afterCarnivory.geometry!.aggression).toBeCloseTo(0.9, 5);

    frame.organismsSize[0] = 2.2;
    source.syncFrame(frame);
    expect(source.planFor(ID, frame.tick)).not.toBe(afterCarnivory);
    expect(source.stats().generated).toBe(1);
  });

  it("buffer riutilizzati con la maschera MOR mutata non servono il piano vecchio", () => {
    const frame = frameFor({ presence: 7 });
    const source = createRuntimeAnatomyRenderSource();
    source.syncFrame(frame);
    const before = source.planFor(ID, frame.tick)!;
    frame.organismsMorphologyPresence![0] = 4;
    source.syncFrame({ ...frame });
    const after = source.planFor(ID, frame.tick)!;
    expect(after).not.toBe(before);
    expect(after.geometry!.sourceFingerprint).not.toBe(before.geometry!.sourceFingerprint);
  });

  it("parametri irrilevanti per il piano G2 non causano rigenerazione", () => {
    const source = createRuntimeAnatomyRenderSource();
    const first = frameFor();
    source.syncFrame(first);
    const before = source.planFor(ID, first.tick)!;

    const unrelated = frameFor({ tick: 999 });
    unrelated.organismsX = new Float32Array([200]);
    unrelated.organismsSpeed = new Float32Array([0.9]);
    unrelated.organismsVision = new Float32Array([0.8]);
    unrelated.organismsEvasion = new Float32Array([0.7]);
    unrelated.organismsHuntingSkill = new Float32Array([0.6]);
    source.syncFrame(unrelated);
    expect(source.planFor(ID, 999)).toBe(before);
    expect(source.stats()).toMatchObject({ generated: 0, reused: 1 });
  });

  it("dopo syncFrame(null) lo stesso frame torna a funzionare senza fallback", () => {
    const frame = frameFor();
    const source = createRuntimeAnatomyRenderSource();
    source.syncFrame(frame);
    expect(source.planFor(ID, 5)).not.toBeNull();

    source.syncFrame(null);
    expect(source.planFor(ID, 5)).toBeNull();
    expect(source.fallbackReason?.()).toBe("no-g2-morphology");

    source.syncFrame(frame);
    expect(source.planFor(ID, 5)).not.toBeNull();
    expect(source.fallbackReason?.()).toBeNull();
    expect(source.maxSlots?.()).not.toBeNull();
  });

  it("una size non finita dichiara fallback invece di produrre un piano", () => {
    const source = createRuntimeAnatomyRenderSource();
    source.syncFrame(frameFor({ size: Number.NaN }));
    expect(source.planFor(ID, 5)).toBeNull();
    expect(source.stats().invalid).toBe(1);
    expect(source.fallbackReason?.()).toContain("invalid-size-data");
  });

  it("dati MOR assenti restano un fallback dichiarato", () => {
    const source = createRuntimeAnatomyRenderSource();
    source.syncFrame(frameFor({ withMorphology: false }));
    expect(source.planFor(ID, 5)).toBeNull();
    expect(source.fallbackReason?.()).toBe("no-g2-morphology");
  });
});
