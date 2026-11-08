import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  createFollowState,
  resetFollowState,
  applyFollowDrag,
  updateFollowCamera,
  updateCreatureInstances,
  type SceneRefs,
} from "../components/simulation/Planet3DView";
import { followDistance } from "../lib/followCamera";
import { projectToSphere } from "../lib/sphereProjection";
import type { RenderFrame } from "../types";

const W = 512;
const H = 512;

function frameOf(ids: number[], xs: number[], ys: number[], sizes?: number[]): RenderFrame {
  return {
    planetWidth: W,
    planetHeight: H,
    organismsId: new Uint32Array(ids),
    organismsX: new Float32Array(xs),
    organismsY: new Float32Array(ys),
    organismsSize: new Float32Array(sizes ?? ids.map(() => 1)),
  } as unknown as RenderFrame;
}
const makeRefs = () => ({ camera: new THREE.PerspectiveCamera(45, 1, 0.03, 100), heightmap: null });

describe("v1.7.0 — updateFollowCamera", () => {
  it("la prima chiamata mette la camera a distanza di inseguimento, 'su' = normale della superficie", () => {
    const refs = makeRefs();
    const state = createFollowState();
    const f = frameOf([1], [100], [200]);
    expect(updateFollowCamera(refs, f, 1, state, 1000, 16)).toBeNull();
    const p = projectToSphere(100, 200, W, H, 5.02);
    const creature = new THREE.Vector3(p.x, p.y, p.z);
    const scale = Math.max(0.05, 1 * 0.12);
    expect(refs.camera.position.distanceTo(creature)).toBeCloseTo(followDistance(scale), 5);
    const up = refs.camera.up;
    expect(up.x).toBeCloseTo(p.normalX, 6);
    expect(up.y).toBeCloseTo(p.normalY, 6);
    expect(up.z).toBeCloseTo(p.normalZ, 6);
    // la camera sta sopra la superficie
    expect(refs.camera.position.length()).toBeGreaterThan(5.02);
  });

  it("la camera si mette dietro: si trova dal lato da cui la creatura è arrivata", () => {
    const refs = makeRefs();
    const state = createFollowState();
    updateFollowCamera(refs, frameOf([1], [100], [200]), 1, state, 1000, 16);
    // la creatura si sposta verso est (x cresce): deve avere dietro la camera a ovest
    updateFollowCamera(refs, frameOf([1], [101], [200]), 1, state, 1100, 100);
    expect(state.heading?.hx).toBeGreaterThan(0.9);
    // prendiamo la posa desiderata con un grosso dt, così lo smorzamento è completo
    for (let t = 0; t < 40; t++) updateFollowCamera(refs, frameOf([1], [101], [200]), 1, state, 1200 + t * 100, 100);
    const here = projectToSphere(101, 200, W, H, 5.02);
    const east = projectToSphere(102, 200, W, H, 5.02);
    const creature = new THREE.Vector3(here.x, here.y, here.z);
    const forward = new THREE.Vector3(east.x - here.x, east.y - here.y, east.z - here.z).normalize();
    const toCamera = refs.camera.position.clone().sub(creature);
    expect(toCamera.dot(forward)).toBeLessThan(0);
  });

  it("lo smorzamento: un piccolo spostamento muove la camera solo in parte", () => {
    const refs = makeRefs();
    const state = createFollowState();
    updateFollowCamera(refs, frameOf([1], [100], [200]), 1, state, 1000, 16);
    const before = refs.camera.position.clone();
    updateFollowCamera(refs, frameOf([1], [104], [200]), 1, state, 1016, 16);
    const moved = refs.camera.position.distanceTo(before);
    expect(moved).toBeGreaterThan(0);
    const full = projectToSphere(104, 200, W, H, 5.02);
    const start = projectToSphere(100, 200, W, H, 5.02);
    const creatureShift = Math.hypot(full.x - start.x, full.y - start.y, full.z - start.z);
    expect(moved).toBeLessThan(creatureShift);
  });

  it("se l'animale sparisce, la camera resta ferma e dopo un po' propone il più vicino", () => {
    const refs = makeRefs();
    const state = createFollowState();
    updateFollowCamera(refs, frameOf([1, 2, 3], [100, 104, 300], [200, 200, 300]), 1, state, 1000, 16);
    const held = refs.camera.position.clone();
    const without = frameOf([2, 3], [104, 300], [200, 300]);
    expect(updateFollowCamera(refs, without, 1, state, 1100, 16)).toBeNull(); // appena sparito: aspetta
    expect(refs.camera.position.distanceTo(held)).toBeLessThan(1e-3);
    expect(updateFollowCamera(refs, without, 1, state, 2000, 16)).toBeNull(); // 900 ms: ancora presto
    expect(updateFollowCamera(refs, without, 1, state, 2700, 16)).toBe(2); // oltre 1500 ms: il più vicino a dove era
  });

  it("se non c'è nessun altro animale non propone nulla", () => {
    const refs = makeRefs();
    const state = createFollowState();
    updateFollowCamera(refs, frameOf([1], [100], [200]), 1, state, 1000, 16);
    const empty = frameOf([], [], []);
    updateFollowCamera(refs, empty, 1, state, 1100, 16);
    expect(updateFollowCamera(refs, empty, 1, state, 5000, 16)).toBeNull();
  });

  it("cambiando animale vicino la camera scorre, cambiando verso uno lontano salta senza attraversare il pianeta", () => {
    const refs = makeRefs();
    const state = createFollowState();
    const f = frameOf([1, 2], [100, 356], [256, 256]); // opposti sul pianeta
    updateFollowCamera(refs, f, 1, state, 1000, 16);
    updateFollowCamera(refs, f, 2, state, 1016, 16);
    const p = projectToSphere(356, 256, W, H, 5.02);
    const creature = new THREE.Vector3(p.x, p.y, p.z);
    expect(refs.camera.position.distanceTo(creature)).toBeLessThan(3);
  });

  it("la camera non entra mai sotto la superficie, nemmeno guardando dall'alto in basso", () => {
    const refs = makeRefs();
    const state = createFollowState();
    state.pitch = -0.3;
    state.hasPose = false;
    updateFollowCamera(refs, frameOf([1], [100], [200]), 1, state, 1000, 16);
    expect(refs.camera.position.length()).toBeGreaterThan(5.0);
  });

  it("applyFollowDrag: il yaw resta in (-π, π], il pitch nei limiti, e registra l'ultimo tocco", () => {
    const s = createFollowState();
    applyFollowDrag(s, 100000, 100000, 77);
    expect(Math.abs(s.yaw)).toBeLessThanOrEqual(Math.PI + 1e-9);
    expect(s.pitch).toBeLessThanOrEqual(1.0);
    expect(s.lastInteractAt).toBe(77);
    applyFollowDrag(s, 0, -100000, 80);
    expect(s.pitch).toBeGreaterThanOrEqual(-0.3);
  });

  it("dopo un po' senza tocchi yaw e pitch tornano a zero; mentre si trascina no", () => {
    const refs = makeRefs();
    const state = createFollowState();
    const f = frameOf([1], [100], [200]);
    updateFollowCamera(refs, f, 1, state, 0, 16);
    state.yaw = 1;
    state.pitch = 0.4;
    state.lastInteractAt = 0;
    state.dragging = true;
    updateFollowCamera(refs, f, 1, state, 10000, 100);
    expect(state.yaw).toBe(1);
    state.dragging = false;
    for (let t = 0; t < 60; t++) updateFollowCamera(refs, f, 1, state, 10000 + t * 100, 100);
    expect(state.yaw).toBe(0);
    expect(state.pitch).toBe(0);
  });

  it("resetFollowState azzera tutto tranne la camera già posizionata nei vettori", () => {
    const s = createFollowState();
    s.id = 4;
    s.hasPosition = true;
    s.hasPose = true;
    s.yaw = 1;
    s.missingSince = 5;
    resetFollowState(s);
    expect(s.id).toBeNull();
    expect(s.hasPosition).toBe(false);
    expect(s.hasPose).toBe(false);
    expect(s.yaw).toBe(0);
    expect(s.missingSince).toBeNull();
  });
});

describe("v1.7.0 — l'animale seguito viene sempre disegnato", () => {
  const CAP = 3200;
  const mesh = (n: number) => new THREE.InstancedMesh(new THREE.SphereGeometry(1, 4, 3), new THREE.MeshBasicMaterial(), n);
  const refsFor = () =>
    ({
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
      maxCreatures: 1000,
      detail: 1,
    }) as unknown as SceneRefs;

  function bigFrame(n: number): RenderFrame {
    const f = {
      planetWidth: W,
      planetHeight: H,
      organismsX: new Float32Array(n),
      organismsY: new Float32Array(n),
      organismsSpecies: new Uint16Array(n),
      organismsSize: new Float32Array(n).fill(1),
      organismsSpeed: new Float32Array(n).fill(1),
      organismsCarnivory: new Float32Array(n),
      organismsVision: new Float32Array(n).fill(1),
      organismsEvasion: new Float32Array(n),
      organismsHuntingSkill: new Float32Array(n).fill(1),
      organismsId: new Uint32Array(n),
    };
    for (let i = 0; i < n; i++) {
      f.organismsId[i] = i + 1;
      f.organismsX[i] = (i * 7) % W;
      f.organismsY[i] = (i * 13) % H;
    }
    return f as unknown as RenderFrame;
  }
  const drawnIds = (refs: SceneRefs) => Array.from(refs.instanceOrganismId.slice(0, refs.bodyMesh.count));

  it("senza animale obbligato, con molta popolazione, un animale fuori campionamento non c'è", () => {
    const refs = refsFor();
    const f = bigFrame(3000); // passo 3: si disegnano gli indici 0, 3, 6, ...
    updateCreatureInstances(refs, f);
    expect(drawnIds(refs)).not.toContain(2); // indice 1
  });

  it("con l'animale obbligato, viene disegnato in più, una volta sola", () => {
    const refs = refsFor();
    const f = bigFrame(3000);
    updateCreatureInstances(refs, f, 2); // id 2 = indice 1, non nel campione
    const ids = drawnIds(refs);
    expect(ids.filter((id) => id === 2)).toHaveLength(1);
    expect(ids.length).toBeGreaterThan(900);
  });

  it("se l'animale obbligato è già nel campione non viene duplicato", () => {
    const refs = refsFor();
    const f = bigFrame(3000);
    updateCreatureInstances(refs, f, 1); // id 1 = indice 0
    expect(drawnIds(refs).filter((id) => id === 1)).toHaveLength(1);
  });

  it("un id inesistente non cambia nulla", () => {
    const a = refsFor();
    const b = refsFor();
    const f = bigFrame(3000);
    updateCreatureInstances(a, f);
    updateCreatureInstances(b, f, 999999);
    expect(drawnIds(b)).toEqual(drawnIds(a));
  });
});
