import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { updateCreatureInstances, type SceneRefs } from "../components/simulation/Planet3DView";
import { projectToSphere } from "../lib/sphereProjection";
import { TRAIT_RANGES } from "../simulation/biology/genome";
import type { RenderFrame } from "../types";

const CAP = 6000;
function mesh(capacity: number): THREE.InstancedMesh {
  return new THREE.InstancedMesh(new THREE.SphereGeometry(1, 4, 3), new THREE.MeshBasicMaterial(), capacity);
}
function makeRefs(detail: 1 | 2 | 3 = 3): SceneRefs {
  return {
    bodyMesh: mesh(CAP),
    headMesh: mesh(CAP),
    eyeMesh: mesh(CAP * 2),
    tailMesh: mesh(CAP),
    jawMesh: mesh(CAP),
    spikeMesh: mesh(CAP * 3),
    creatureTrack: new Map(),
    instanceOrganismId: new Uint32Array(CAP),
    heightmap: null,
    capacity: CAP,
    maxCreatures: 2500,
    detail,
  } as unknown as SceneRefs;
}
const mid = (k: keyof typeof TRAIT_RANGES) => (TRAIT_RANGES[k].min + TRAIT_RANGES[k].max) / 2;
const min = (k: keyof typeof TRAIT_RANGES) => TRAIT_RANGES[k].min;
const max = (k: keyof typeof TRAIT_RANGES) => TRAIT_RANGES[k].max;

function frame(x: number, y: number, o: { carnivory?: number; evasion?: number } = {}): RenderFrame {
  return {
    planetWidth: 512,
    planetHeight: 512,
    organismsX: new Float32Array([x]),
    organismsY: new Float32Array([y]),
    organismsSpecies: new Uint16Array([1]),
    organismsSize: new Float32Array([1]),
    organismsSpeed: new Float32Array([mid("speed")]),
    organismsCarnivory: new Float32Array([o.carnivory ?? min("carnivory")]),
    organismsVision: new Float32Array([mid("vision")]),
    organismsEvasion: new Float32Array([o.evasion ?? min("evasion")]),
    organismsHuntingSkill: new Float32Array([mid("huntingSkill")]),
    organismsId: new Uint32Array([42]),
  } as unknown as RenderFrame;
}
const pos = (m: THREE.InstancedMesh, i: number) => {
  const mat = new THREE.Matrix4();
  m.getMatrixAt(i, mat);
  return new THREE.Vector3().setFromMatrixPosition(mat);
};
const det = (m: THREE.InstancedMesh, i: number) => {
  const mat = new THREE.Matrix4();
  m.getMatrixAt(i, mat);
  return mat.determinant();
};

describe("v1.5.0 — 3D creature instances", () => {
  it("writes one body, head, tail, two eyes and three spike slots per creature", () => {
    const refs = makeRefs();
    updateCreatureInstances(refs, frame(256, 256));
    expect(refs.bodyMesh.count).toBe(1);
    expect(refs.headMesh.count).toBe(1);
    expect(refs.tailMesh.count).toBe(1);
    expect(refs.jawMesh.count).toBe(1);
    expect(refs.eyeMesh.count).toBe(2);
    expect(refs.spikeMesh.count).toBe(3);
    expect(refs.instanceOrganismId[0]).toBe(42);
  });

  it("a creature that moved east has its head ahead of its body toward the east, and the tail behind", () => {
    const refs = makeRefs();
    updateCreatureInstances(refs, frame(256, 256));
    updateCreatureInstances(refs, frame(258, 256));
    const body = pos(refs.bodyMesh, 0);
    const head = pos(refs.headMesh, 0);
    const tail = pos(refs.tailMesh, 0);

    const here = projectToSphere(258, 256, 512, 512, 5.02);
    const ahead = projectToSphere(259, 256, 512, 512, 5.02);
    const east = new THREE.Vector3(ahead.x - here.x, ahead.y - here.y, ahead.z - here.z).normalize();

    const toHead = head.clone().sub(body);
    const toTail = tail.clone().sub(body);
    expect(toHead.clone().normalize().dot(east)).toBeGreaterThan(0.9);
    expect(toTail.clone().normalize().dot(east)).toBeLessThan(-0.9);
  });

  it("stands upright: the head is above the torso along the surface normal", () => {
    const refs = makeRefs();
    updateCreatureInstances(refs, frame(100, 200));
    updateCreatureInstances(refs, frame(101, 200));
    const body = pos(refs.bodyMesh, 0);
    const head = pos(refs.headMesh, 0);
    const normal = body.clone().normalize();
    // the head sits slightly higher than the body center, and the body rests on the planet surface
    expect(head.clone().sub(body).dot(normal)).toBeGreaterThan(0);
    expect(body.length()).toBeGreaterThan(5);
  });

  it("a creature that stands still keeps facing the same way", () => {
    const refs = makeRefs();
    updateCreatureInstances(refs, frame(256, 256));
    updateCreatureInstances(refs, frame(258, 256));
    const before = pos(refs.headMesh, 0).clone().sub(pos(refs.bodyMesh, 0)).normalize();
    updateCreatureInstances(refs, frame(258, 256));
    const after = pos(refs.headMesh, 0).clone().sub(pos(refs.bodyMesh, 0)).normalize();
    expect(before.dot(after)).toBeGreaterThan(0.999);
  });

  it("a herbivore has no visible jaw and no visible spikes; a predator has a jaw; an evasive one has spikes", () => {
    const plain = makeRefs();
    updateCreatureInstances(plain, frame(256, 256));
    expect(det(plain.jawMesh, 0)).toBe(0);
    expect(det(plain.spikeMesh, 0)).toBe(0);

    const predator = makeRefs();
    updateCreatureInstances(predator, frame(256, 256, { carnivory: max("carnivory") }));
    expect(Math.abs(det(predator.jawMesh, 0))).toBeGreaterThan(0);

    const spiky = makeRefs();
    updateCreatureInstances(spiky, frame(256, 256, { evasion: max("evasion") }));
    expect(Math.abs(det(spiky.spikeMesh, 0))).toBeGreaterThan(0);
  });

  it("v1.6.0 — a light profile (detail 1) draws only torso and head: no eyes, tail, jaw or spikes", () => {
    const refs = makeRefs(1);
    updateCreatureInstances(refs, frame(256, 256, { carnivory: max("carnivory"), evasion: max("evasion") }));
    expect(refs.bodyMesh.count).toBe(1);
    expect(refs.headMesh.count).toBe(1);
    expect(refs.eyeMesh.count).toBe(0);
    expect(refs.tailMesh.count).toBe(0);
    expect(refs.jawMesh.count).toBe(0);
    expect(refs.spikeMesh.count).toBe(0);
  });

  it("v1.6.0 — a balanced profile (detail 2) adds eyes, tail and jaw but not spikes", () => {
    const refs = makeRefs(2);
    updateCreatureInstances(refs, frame(256, 256, { carnivory: max("carnivory"), evasion: max("evasion") }));
    expect(refs.eyeMesh.count).toBe(2);
    expect(refs.tailMesh.count).toBe(1);
    expect(refs.jawMesh.count).toBe(1);
    expect(refs.spikeMesh.count).toBe(0);
  });

  it("v1.6.0 — never writes more instances than the buffer capacity, however many creatures there are", () => {
    const refs = makeRefs(3);
    refs.capacity = 5;
    refs.maxCreatures = 5;
    const n = 100;
    const big = {
      planetWidth: 512,
      planetHeight: 512,
      organismsX: Float32Array.from({ length: n }, (_, i) => i * 4),
      organismsY: Float32Array.from({ length: n }, (_, i) => i * 3),
      organismsSpecies: new Uint16Array(n).fill(1),
      organismsSize: new Float32Array(n).fill(1),
      organismsSpeed: new Float32Array(n).fill(mid("speed")),
      organismsCarnivory: new Float32Array(n).fill(min("carnivory")),
      organismsVision: new Float32Array(n).fill(mid("vision")),
      organismsEvasion: new Float32Array(n).fill(min("evasion")),
      organismsHuntingSkill: new Float32Array(n).fill(mid("huntingSkill")),
      organismsId: Uint32Array.from({ length: n }, (_, i) => i + 1),
    } as unknown as RenderFrame;
    updateCreatureInstances(refs, big);
    expect(refs.bodyMesh.count).toBeGreaterThan(0);
    expect(refs.bodyMesh.count).toBeLessThanOrEqual(5);
  });

  it("forgets creatures that are no longer drawn", () => {
    const refs = makeRefs();
    updateCreatureInstances(refs, frame(256, 256));
    expect(refs.creatureTrack.has(42)).toBe(true);
    const empty = frame(256, 256);
    (empty as unknown as { organismsX: Float32Array }).organismsX = new Float32Array(0);
    updateCreatureInstances(refs, empty);
    expect(refs.creatureTrack.size).toBe(0);
  });
});
