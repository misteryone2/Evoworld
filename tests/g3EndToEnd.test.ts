import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { updateCreatureInstances, type SceneRefs } from "../components/simulation/Planet3DView";
import { BODY_PLAN_CATALOG, speculativeBodyPlanId } from "../lib/anatomy/bodyPlan";
import { generateAnatomyCached } from "../lib/anatomy/generate";
import { derivePhenotype } from "../lib/phenotype/derive";
import {
  GENERIC_RENDER_SLOTS, RENDER_POOL_LIMITS, partsPlanFromAnatomyDescriptor,
  type AnatomyRenderPlan, type CreatureAnatomyRenderSource, type CreatureRenderPartKey,
} from "../lib/visual/anatomyRenderPlan";
import { createRuntimeAnatomyRenderSource } from "../lib/visual/runtimeAnatomyRenderSource";
import { TRAIT_RANGES } from "../simulation/biology/genome";
import type { RenderFrame } from "../types";

const CAP = 40;
const ID = 42;
const KEYS = Object.keys(GENERIC_RENDER_SLOTS) as CreatureRenderPartKey[];
const mid = (key: keyof typeof TRAIT_RANGES) => (TRAIT_RANGES[key].min + TRAIT_RANGES[key].max) / 2;

function speciesFor(bodyPlanId: string): number {
  const found = Array.from({ length: 512 }, (_, speciesId) => speciesId)
    .find((speciesId) => speculativeBodyPlanId(speciesId) === bodyPlanId) ?? -1;
  expect(found).toBeGreaterThanOrEqual(0);
  return found;
}

function mesh(capacity: number, colored = true): THREE.InstancedMesh {
  const result = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 4, 3), new THREE.MeshBasicMaterial(), Math.max(1, capacity));
  if (colored) result.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity) * 3), 3);
  result.count = 0;
  return result;
}

function makeRefs(): SceneRefs {
  const refs = {
    bodyMesh: mesh(CAP), headMesh: mesh(CAP), eyeMesh: mesh(CAP * 2), tailMesh: mesh(CAP),
    jawMesh: mesh(CAP), spikeMesh: mesh(CAP * 3), legMesh: mesh(CAP * 4), earMesh: mesh(CAP * 2),
    shadowMesh: mesh(CAP), creatureTrack: new Map(), instanceOrganismId: new Uint32Array(CAP),
    heightmap: null, capacity: CAP, maxCreatures: CAP, detail: 3,
    creatureRenderStats: { drawn: 0, mapped: 0, legacy: 0, fallback: 0, unsupported: 0, fallbackReasons: [] },
    genericMeshes: {}, genericSlotsPerCreature: {},
  } as unknown as SceneRefs;
  for (const key of KEYS) {
    refs.genericMeshes![key] = mesh(CAP * GENERIC_RENDER_SLOTS[key], key !== "eye");
    refs.genericMeshes![key]!.visible = false;
    refs.genericSlotsPerCreature![key] = GENERIC_RENDER_SLOTS[key];
  }
  return refs;
}

function frameFor(speciesId: number, options: { id?: number; stature?: number; fur?: number; armor?: number; presence?: number; withMorphology?: boolean } = {}): RenderFrame {
  const id = options.id ?? ID;
  const withMorphology = options.withMorphology !== false;
  const presence = options.presence ?? 7;
  return {
    tick: 11, year: 1, planetWidth: 256, planetHeight: 256,
    organismsX: new Float32Array([128]), organismsY: new Float32Array([128]),
    organismsSpecies: new Uint16Array([speciesId]), organismsSize: new Float32Array([1.1]),
    organismsSpeed: new Float32Array([mid("speed")]), organismsCarnivory: new Float32Array([0.5]),
    organismsVision: new Float32Array([mid("vision")]), organismsEvasion: new Float32Array([mid("evasion")]),
    organismsHuntingSkill: new Float32Array([mid("huntingSkill")]), organismsId: new Uint32Array([id]),
    ...(withMorphology ? {
      organismsBodyStature: new Float32Array([options.stature ?? 0.55]),
      organismsFurDensity: new Float32Array([options.fur ?? 0.6]),
      organismsDermalArmor: new Float32Array([options.armor ?? 0.45]),
      organismsMorphologyPresence: new Uint8Array([presence]),
    } : {}),
  } as unknown as RenderFrame;
}

function expectedDescriptor(frame: RenderFrame, speciesId: number) {
  const presence = frame.organismsMorphologyPresence![0];
  const ext: Record<string, number> = {};
  if (presence & 1) ext.bodyStature = frame.organismsBodyStature![0];
  if (presence & 2) ext.furDensity = frame.organismsFurDensity![0];
  if (presence & 4) ext.dermalArmor = frame.organismsDermalArmor![0];
  return generateAnatomyCached({
    phenotype: derivePhenotype({ size: frame.organismsSize[0], ext }),
    bodyPlan: BODY_PLAN_CATALOG[speculativeBodyPlanId(speciesId)],
    seed: frame.organismsId[0],
    origin: "seeded-speculative",
  });
}

function sourceFor(plan: AnatomyRenderPlan | null, reason: string | null = null): CreatureAnatomyRenderSource {
  return { id: "test", planFor: () => plan, fallbackReason: () => reason };
}

function det(mesh: THREE.InstancedMesh, index: number): number {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return matrix.determinant();
}

const CASES: readonly [string, string][] = [
  ["bipede", "biped"],
  ["quadrupede", "quadruped"],
  ["multi-segmento", "many-legged"],
  ["appendici differenti (armored)", "armored-specialist"],
  ["simmetria bilaterale", "hexapod"],
  ["simmetria radiale", "radial-sessile"],
  ["simmetria radiale multi-braccio", "speculative-multi-arm"],
  ["asimmetria", "simple-asymmetric"],
  ["parti convenzionali mancanti", "simple-sphere"],
  ["corpo segmentato senza zampe", "segmented-worm"],
  ["appendici a ventaglio", "supported-multicellular"],
];

describe("G3 — integrazione end-to-end anatomia generata → renderer", () => {
  for (const [label, bodyPlanId] of CASES) {
    it(`${label}: il descriptor generato è consumato dal renderer senza perdere parti`, () => {
      const speciesId = speciesFor(bodyPlanId);
      const frame = frameFor(speciesId);
      const descriptor = expectedDescriptor(frame, speciesId);
      const source = createRuntimeAnatomyRenderSource();
      source.syncFrame(frame);
      const plan = source.planFor(ID, frame.tick);
      expect(plan).not.toBeNull();
      expect(plan!.support.supported).toBe(true);
      expect(plan!.geometry!.sourceFingerprint).toBe(descriptor.fingerprint);
      expect(plan!.mode).toBe("parts");

      const expectedSegments = descriptor.segments.length;
      const expectedAppendages = descriptor.appendages.length;
      expect(plan!.requiredSlots.segment).toBe(expectedSegments);
      expect(plan!.requiredSlots.appendage + plan!.requiredSlots.eye).toBe(expectedAppendages);
      expect(plan!.parts!.length).toBe(expectedSegments + expectedAppendages);
      for (const key of KEYS) expect(plan!.requiredSlots[key]).toBeLessThanOrEqual(RENDER_POOL_LIMITS[key]);

      const refs = makeRefs();
      updateCreatureInstances(refs, frame, null, null, 16, null, source);
      expect(refs.creatureRenderStats).toMatchObject({ drawn: 1, mapped: 1, fallback: 0, droppedParts: 0 });
      expect(refs.bodyMesh.count).toBe(1);
      for (const key of KEYS) {
        const meshRef = refs.genericMeshes![key]!;
        const slots = refs.creatureRenderStats!.poolCapacity![key]!;
        expect(slots).toBeGreaterThanOrEqual(plan!.requiredSlots[key]);
        expect(meshRef.count).toBe(slots);
      }
      expect(Math.abs(det(refs.genericMeshes!.segment!, 0))).toBeGreaterThan(0);

      // Il piano non è un quadrupede di default: è quello generato dal sistema.
      expect(descriptor.bodyPlan.id).toBe(bodyPlanId);
      expect(descriptor.bodyPlan.origin).toBe("seeded-speculative");
      expect(descriptor.provenance.bodyPlan.kind).toBe("undetermined");
    });
  }

  it("crescente i pool oltre 12 appendici senza perdere il multisegmento", () => {
    const speciesId = speciesFor("many-legged");
    const frame = frameFor(speciesId);
    const refs = makeRefs();
    const source = createRuntimeAnatomyRenderSource();
    source.syncFrame(frame);
    const plan = source.planFor(ID, frame.tick)!;
    expect(plan.requiredSlots.appendage).toBeGreaterThan(GENERIC_RENDER_SLOTS.appendage);
    expect(plan.requiredSlots.segment).toBeGreaterThan(GENERIC_RENDER_SLOTS.segment);

    updateCreatureInstances(refs, frame, null, null, 16, null, source);
    expect(refs.creatureRenderStats!.droppedParts).toBe(0);
    expect(refs.creatureRenderStats!.poolGrowth!.join(";")).toContain("appendage:");
    expect(refs.genericMeshes!.appendage!.instanceMatrix.count).toBeGreaterThan(CAP * GENERIC_RENDER_SLOTS.appendage);
    expect(refs.genericMeshes!.segment!.instanceMatrix.count).toBeGreaterThan(CAP * GENERIC_RENDER_SLOTS.segment);
  });

  it("riutilizza i piani immutati, rigenera quelli mutati e ripulisce gli id assenti", () => {
    const speciesId = speciesFor("biped");
    const source = createRuntimeAnatomyRenderSource();
    const first = frameFor(speciesId);
    source.syncFrame(first);
    expect(source.stats().generated).toBe(1);

    source.syncFrame(frameFor(speciesId));
    expect(source.stats().reused).toBe(1);
    expect(source.stats().generated).toBe(0);

    const changed = frameFor(speciesId, { stature: 0.9 });
    source.syncFrame(changed);
    expect(source.stats().generated).toBe(1);
    expect(source.stats().reused).toBe(0);

    source.syncFrame(frameFor(speciesId, { id: 99 }));
    expect(source.stats().pruned).toBe(1);
    expect(source.planFor(ID, first.tick)).toBeNull();
  });

  it("dati MOR assenti o corrotti ricadono su legacy con motivo dichiarato", () => {
    const speciesId = speciesFor("biped");
    const refs = makeRefs();
    const absent = createRuntimeAnatomyRenderSource();
    absent.syncFrame(frameFor(speciesId, { withMorphology: false }));
    updateCreatureInstances(refs, frameFor(speciesId, { withMorphology: false }), null, null, 16, null, absent);
    expect(refs.creatureRenderStats).toMatchObject({ drawn: 1, mapped: 0, legacy: 1, fallback: 1 });
    expect(refs.creatureRenderStats!.fallbackReasons).toContain("no-g2-morphology");

    const invalidFrame = frameFor(speciesId, { stature: Number.NaN });
    const invalid = createRuntimeAnatomyRenderSource();
    invalid.syncFrame(invalidFrame);
    const invalidRefs = makeRefs();
    updateCreatureInstances(invalidRefs, invalidFrame, null, null, 16, null, invalid);
    expect(invalidRefs.creatureRenderStats).toMatchObject({ mapped: 0, legacy: 1, fallback: 1 });
    expect(invalidRefs.creatureRenderStats!.fallbackReasons).toContain("invalid-morphology-data");
  });

  it("un descriptor anatomico non valido non entra nel loop e segnala il motivo", () => {
    const speciesId = speciesFor("quadruped");
    const descriptor = expectedDescriptor(frameFor(speciesId), speciesId);
    const corrupt = JSON.parse(JSON.stringify(descriptor)) as typeof descriptor;
    (corrupt.segments[0].center as { x: number }).x = Number.NaN;
    const plan = partsPlanFromAnatomyDescriptor(corrupt);
    expect(plan.support.supported).toBe(false);
    expect(plan.fallbackReason).toContain("non-finite-segment-data");

    const refs = makeRefs();
    const legacy = makeRefs();
    const frame = frameFor(speciesId);
    updateCreatureInstances(refs, frame, null, null, 16, null, sourceFor(plan, plan.fallbackReason));
    updateCreatureInstances(legacy, frame);
    expect(refs.creatureRenderStats).toMatchObject({ mapped: 0, legacy: 1, fallback: 1, unsupported: 1 });
    expect(refs.creatureRenderStats!.fallbackReasons.join(";")).toContain("non-finite-segment-data");
    expect(refs.bodyMesh.count).toBe(legacy.bodyMesh.count);
  });

  it("fuori capacità effettiva il fallback è dichiarato, non una perdita silenziosa", () => {
    const speciesId = speciesFor("quadruped");
    const descriptor = expectedDescriptor(frameFor(speciesId), speciesId);
    const oversized = JSON.parse(JSON.stringify(descriptor)) as typeof descriptor;
    const sourceAppendage = oversized.appendages[0];
    const extra = Array.from({ length: RENDER_POOL_LIMITS.appendage + 8 }, (_, i) => ({
      ...sourceAppendage, id: `overflow-${i}`, groupId: `overflow-${i}`,
    }));
    (oversized as { appendages: typeof oversized.appendages }).appendages = [...oversized.appendages, ...extra];
    const plan = partsPlanFromAnatomyDescriptor(oversized);
    expect(plan.support.supported).toBe(false);
    expect(plan.fallbackReason).toContain("pool-capacity-exceeded:appendage");

    const refs = makeRefs();
    updateCreatureInstances(refs, frameFor(speciesId), null, null, 16, null, sourceFor(plan, plan.fallbackReason));
    expect(refs.creatureRenderStats).toMatchObject({ mapped: 0, legacy: 1, fallback: 1 });
    expect(refs.creatureRenderStats!.fallbackReasons.join(";")).toContain("pool-capacity-exceeded:appendage");
  });
});
