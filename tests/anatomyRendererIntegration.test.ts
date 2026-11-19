import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { updateCreatureInstances, type SceneRefs } from "../components/simulation/Planet3DView";
import { descriptorFromLegacyTraits, serializeAnatomy } from "../lib/anatomy";
import {
  GENERIC_RENDER_SLOTS, isUsableAnatomyRenderPlan, planFromAnatomyDescriptor,
  type AnatomyRenderPlan, type CreatureAnatomyRenderSource, type CreatureRenderPartKey,
} from "../lib/visual/anatomyRenderPlan";
import { TRAIT_RANGES } from "../simulation/biology/genome";
import type { RenderFrame } from "../types";

const CAP = 200;
const mid = (k: keyof typeof TRAIT_RANGES) => (TRAIT_RANGES[k].min + TRAIT_RANGES[k].max) / 2;
const min = (k: keyof typeof TRAIT_RANGES) => TRAIT_RANGES[k].min;
const traits = {
  speed: mid("speed"),
  carnivory: min("carnivory"),
  vision: mid("vision"),
  evasion: min("evasion"),
  huntingSkill: mid("huntingSkill"),
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function mesh(capacity: number, colored = false): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 4, 3), new THREE.MeshBasicMaterial(), capacity);
  if (colored) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  m.count = 0;
  return m;
}

function makeRefs(withGeneric = false): SceneRefs {
  const refs = {
    bodyMesh: mesh(CAP),
    headMesh: mesh(CAP),
    eyeMesh: mesh(CAP * 2),
    tailMesh: mesh(CAP),
    jawMesh: mesh(CAP),
    spikeMesh: mesh(CAP * 3),
    legMesh: mesh(CAP * 4),
    earMesh: mesh(CAP * 2),
    shadowMesh: mesh(CAP),
    creatureTrack: new Map(),
    instanceOrganismId: new Uint32Array(CAP),
    heightmap: null,
    capacity: CAP,
    maxCreatures: CAP,
    detail: 3,
    creatureRenderStats: { drawn: 0, mapped: 0, legacy: 0, fallback: 0, unsupported: 0, fallbackReasons: [] },
  } as unknown as SceneRefs;
  if (withGeneric) {
    refs.genericMeshes = {};
    refs.genericSlotsPerCreature = {};
    for (const key of Object.keys(GENERIC_RENDER_SLOTS) as CreatureRenderPartKey[]) {
      const slots = GENERIC_RENDER_SLOTS[key];
      refs.genericSlotsPerCreature[key] = slots;
      refs.genericMeshes[key] = mesh(CAP * slots, key !== "eye");
      refs.genericMeshes[key]!.visible = false;
    }
  }
  return refs;
}

function frame(ids: readonly number[] = [42]): RenderFrame {
  const n = ids.length;
  return {
    planetWidth: 512,
    planetHeight: 512,
    tick: 7,
    organismsX: new Float32Array(ids.map((_, i) => 80 + i * 2)),
    organismsY: new Float32Array(ids.map((_, i) => 80)),
    organismsSpecies: new Uint16Array(ids.map((_, i) => i % 3)),
    organismsSize: new Float32Array(ids.map(() => 1)),
    organismsSpeed: new Float32Array(ids.map(() => traits.speed)),
    organismsCarnivory: new Float32Array(ids.map(() => traits.carnivory)),
    organismsVision: new Float32Array(ids.map(() => traits.vision)),
    organismsEvasion: new Float32Array(ids.map(() => traits.evasion)),
    organismsHuntingSkill: new Float32Array(ids.map(() => traits.huntingSkill)),
    organismsId: new Uint32Array(ids),
  } as unknown as RenderFrame;
}

function sourceFor(plan: AnatomyRenderPlan | null, calls?: [number, number][]): CreatureAnatomyRenderSource {
  return Object.freeze({
    id: "test-g2-source",
    planFor(organismId: number, tick: number): AnatomyRenderPlan | null {
      calls?.push([organismId, tick]);
      return plan;
    },
  });
}

const MESH_KEYS = ["bodyMesh", "headMesh", "eyeMesh", "tailMesh", "jawMesh", "spikeMesh", "legMesh", "earMesh", "shadowMesh"] as const;
function matrices(refs: SceneRefs): number[][] {
  return MESH_KEYS.map((key) => Array.from((refs[key].instanceMatrix.array as Float32Array).slice(0, refs[key].instanceMatrix.count)));
}
function colors(refs: SceneRefs): number[][] {
  return MESH_KEYS.map((key) => {
    const attr = refs[key].instanceColor;
    return attr ? Array.from((attr.array as Float32Array).slice(0, attr.count)) : [];
  });
}
function scaleX(mesh: THREE.InstancedMesh, index = 0): number {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(index, m);
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  m.decompose(p, q, s);
  return s.x;
}
function det(mesh: THREE.InstancedMesh, index: number): number {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(index, m);
  return m.determinant();
}
function deepFreeze<T,>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      if (child && typeof child === "object" && !Object.isFrozen(child)) deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

describe("G-REV-02 — integrazione G2 nel renderer 3D", () => {
  it("consuma la geometria del piano G2 invece del corpo legacy", () => {
    const descriptor = clone(descriptorFromLegacyTraits(traits, { seed: 42 })) as any;
    descriptor.segments[0].halfExtents.x = 0.37;
    const plan = planFromAnatomyDescriptor(descriptor, 0.1);
    expect(isUsableAnatomyRenderPlan(plan)).toBe(true);
    expect(plan.mode).toBe("parts");
    expect(plan.geometry?.bodyHalfWidth).toBeCloseTo(0.37, 3);

    const f = frame();
    const legacy = makeRefs();
    const g2 = makeRefs();
    updateCreatureInstances(legacy, f);
    updateCreatureInstances(g2, f, null, null, 16, null, sourceFor(plan));

    expect(scaleX(g2.bodyMesh)).toBeLessThan(scaleX(legacy.bodyMesh) * 0.6);
    expect(g2.creatureRenderStats).toMatchObject({ drawn: 1, mapped: 1, legacy: 0, fallback: 0 });
    // La traccia visiva resta nel suo tipo legacy (qui resta vuota: il piano G2
    // non viene mai copiato nella cache dell'anatomia G1, né nella simulazione).
    expect(g2.creatureTrack.get(42)?.anatomy ?? null).toBeNull();
  });

  it("senza sorgente il percorso legacy è bit-identico (matrici e colori)", () => {
    const f = frame();
    const a = makeRefs();
    const b = makeRefs();
    updateCreatureInstances(a, f);
    updateCreatureInstances(b, f);
    expect(matrices(b)).toEqual(matrices(a));
    expect(colors(b)).toEqual(colors(a));
    expect(b.creatureRenderStats).toMatchObject({ drawn: 1, mapped: 0, legacy: 1, fallback: 0 });
  });

  it("un piano unsupported dichiara il motivo e ricade sulla geometria legacy", () => {
    const descriptor = clone(descriptorFromLegacyTraits(traits, { seed: 42 })) as any;
    descriptor.appendages = descriptor.appendages.filter((a: any) => a.kind !== "leg" || a.id !== "legs-0");
    const plan = planFromAnatomyDescriptor(descriptor, 0);
    expect(plan.support.supported).toBe(false);
    expect(plan.fallbackReason).toBeTruthy();
    expect(isUsableAnatomyRenderPlan(plan)).toBe(false);

    const f = frame();
    const legacy = makeRefs();
    const fallback = makeRefs();
    updateCreatureInstances(legacy, f);
    updateCreatureInstances(fallback, f, null, null, 16, null, sourceFor(plan));

    expect(matrices(fallback)).toEqual(matrices(legacy));
    expect(fallback.creatureRenderStats?.fallback).toBe(1);
    expect(fallback.creatureRenderStats?.unsupported).toBe(1);
    expect(fallback.creatureRenderStats?.fallbackReasons.join(";")).toContain("renderer-has-4-leg-slots");
  });

  it("un piano non finito non entra nel loop e lascia invariato il fallback", () => {
    const descriptor = descriptorFromLegacyTraits(traits, { seed: 42 });
    const usable = planFromAnatomyDescriptor(descriptor, 0);
    const invalid = Object.freeze({
      ...usable,
      geometry: Object.freeze({ ...usable.geometry!, headRadius: Number.NaN }),
      fallbackReason: "nan-injected",
    }) as AnatomyRenderPlan;
    expect(isUsableAnatomyRenderPlan(invalid)).toBe(false);

    const f = frame();
    const legacy = makeRefs();
    const fallback = makeRefs();
    updateCreatureInstances(legacy, f);
    updateCreatureInstances(fallback, f, null, null, 16, null, sourceFor(invalid));

    expect(matrices(fallback)).toEqual(matrices(legacy));
    expect(fallback.creatureRenderStats?.fallback).toBe(1);
    expect(fallback.creatureRenderStats?.legacy).toBe(1);
    expect(fallback.creatureRenderStats?.fallbackReasons).toContain("nan-injected");
  });

  it("scrive i pool generici con slots limitati e mantiene il mapping di selezione", () => {
    const plan = planFromAnatomyDescriptor(descriptorFromLegacyTraits(traits, { seed: 42 }), 0);
    expect(plan.parts && plan.parts.length).toBeGreaterThan(0);
    const refs = makeRefs(true);
    refs.renderSource = sourceFor(plan);
    const f = frame([42, 43]);
    updateCreatureInstances(refs, f);

    expect(refs.bodyMesh.count).toBe(2);
    // Layout denso G3: `count` copre solo le parti reali, non la capacità
    // riservata del pool. Il tetto GENERIC_RENDER_SLOTS resta la capacità iniziale.
    const perKey = (key: "segment" | "appendage" | "eye") =>
      (plan.parts ?? []).filter((part) => part.key === key && part.visible).length * 2;
    expect(refs.genericMeshes?.segment?.count).toBe(perKey("segment"));
    expect(refs.genericMeshes?.appendage?.count).toBe(perKey("appendage"));
    expect(refs.genericMeshes?.eye?.count).toBe(perKey("eye"));
    expect(refs.genericMeshes?.segment?.visible).toBe(true);
    expect(refs.genericMeshes?.segment!.instanceMatrix.count).toBeGreaterThanOrEqual(GENERIC_RENDER_SLOTS.segment * 2);

    // La seconda creatura inizia subito dopo le parti reali della prima.
    const perCreatureSegments = plan.requiredSlots.segment;
    expect(perCreatureSegments).toBeGreaterThan(0);
    expect(Math.abs(det(refs.genericMeshes!.segment!, perCreatureSegments))).toBeGreaterThan(0);
    expect(refs.instanceOrganismId[0]).toBe(42);
    expect(refs.instanceOrganismId[1]).toBe(43);

    // Rimuovendo la sorgente i pool generici spariscono senza toccare i mesh legacy.
    refs.renderSource = null;
    updateCreatureInstances(refs, f);
    expect(refs.genericMeshes?.segment?.count).toBe(0);
    expect(refs.genericMeshes?.appendage?.count).toBe(0);
    expect(refs.genericMeshes?.eye?.count).toBe(0);
    expect(refs.bodyMesh.count).toBe(2);
  });

  it("non muta descriptor, piano, sorgente, frame o array tipizzati", () => {
    const descriptor = deepFreeze(descriptorFromLegacyTraits(traits, { seed: 42 }));
    const plan = deepFreeze(planFromAnatomyDescriptor(descriptor, 0));
    const f = frame();
    const calls: [number, number][] = [];
    const source = sourceFor(plan, calls);
    const beforeDescriptor = serializeAnatomy(descriptor);
    const beforeX = Array.from(f.organismsX);
    const beforeIds = Array.from(f.organismsId);
    const refs = makeRefs(true);

    expect(() => updateCreatureInstances(refs, f, null, null, 16, null, source)).not.toThrow();
    expect(calls).toEqual([[42, 7]]);
    expect(serializeAnatomy(descriptor)).toBe(beforeDescriptor);
    expect(Array.from(f.organismsX)).toEqual(beforeX);
    expect(Array.from(f.organismsId)).toEqual(beforeIds);
    expect(Object.isFrozen(plan)).toBe(true);
  });
});
