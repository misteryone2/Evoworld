import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  updateCreatureInstances,
  configureInstancedMesh,
  addBellyGradient,
  placeFollowSun,
  type SceneRefs,
} from "../components/simulation/Planet3DView";
import { createLocalScene } from "../components/simulation/localScene";
import { QUALITY_PROFILES } from "../lib/qualityProfile";
import { computeCreatureAnatomy, EAR_VISIBLE_MAX_CARNIVORY } from "../lib/creatureAnatomy";
import { groundRadius } from "../lib/localGround";
import { TRAIT_RANGES } from "../simulation/biology/genome";
import { computeFollowPose } from "../lib/followCamera";
import { makeVf } from "./helpers_vf";
import type { RenderFrame } from "../types";

const CAP = 200;
const W = 512;
const H = 512;
const mid = (k: keyof typeof TRAIT_RANGES) => (TRAIT_RANGES[k].min + TRAIT_RANGES[k].max) / 2;
const lo = (k: keyof typeof TRAIT_RANGES) => TRAIT_RANGES[k].min;
const hi = (k: keyof typeof TRAIT_RANGES) => TRAIT_RANGES[k].max;
const mesh = (n: number) => new THREE.InstancedMesh(new THREE.SphereGeometry(1, 4, 3), new THREE.MeshBasicMaterial(), n);

function makeRefs(detail: 1 | 2 | 3, local: SceneRefs["local"] = null): SceneRefs {
  return {
    bodyMesh: mesh(CAP),
    headMesh: mesh(CAP),
    eyeMesh: mesh(CAP * 2),
    tailMesh: mesh(CAP),
    jawMesh: mesh(CAP),
    spikeMesh: mesh(CAP * 3),
    legMesh: mesh(CAP * 4),
    earMesh: mesh(CAP * 2),
    shadowMesh: mesh(CAP),
    local,
    creatureTrack: new Map(),
    instanceOrganismId: new Uint32Array(CAP),
    heightmap: null,
    capacity: CAP,
    maxCreatures: 100,
    detail,
  } as unknown as SceneRefs;
}

function frameAt(x: number, y: number, carnivory = lo("carnivory"), speed = mid("speed")): RenderFrame {
  return {
    planetWidth: W,
    planetHeight: H,
    organismsX: new Float32Array([x]),
    organismsY: new Float32Array([y]),
    organismsSpecies: new Uint16Array([1]),
    organismsSize: new Float32Array([1]),
    organismsSpeed: new Float32Array([speed]),
    organismsCarnivory: new Float32Array([carnivory]),
    organismsVision: new Float32Array([mid("vision")]),
    organismsEvasion: new Float32Array([lo("evasion")]),
    organismsHuntingSkill: new Float32Array([mid("huntingSkill")]),
    organismsId: new Uint32Array([7]),
  } as unknown as RenderFrame;
}
const matrixAt = (m: THREE.InstancedMesh, i: number) => {
  const mat = new THREE.Matrix4();
  m.getMatrixAt(i, mat);
  return mat;
};
const posAt = (m: THREE.InstancedMesh, i: number) => new THREE.Vector3().setFromMatrixPosition(matrixAt(m, i));

describe("v1.8.0 — culling: gli animali non spariscono in terza persona", () => {
  it("configureInstancedMesh spegne il frustum culling", () => {
    const m = mesh(10);
    expect(m.frustumCulled).toBe(true);
    configureInstancedMesh(m);
    expect(m.frustumCulled).toBe(false);
  });

  it("riproduce il difetto: con la sfera di ingombro calcolata a zero istanze, una camera in terza persona scarta la mesh", () => {
    const body = mesh(10);
    body.count = 0;
    // un'altra mesh che Three ha già "misurato" quando era vuota: stessa cosa accade al primo render
    const frustum = new THREE.Frustum();
    const creature = new THREE.Vector3(5, 0, 0).normalize().multiplyScalar(5.02);
    const normal = creature.clone().normalize();
    const forward = new THREE.Vector3(0, 0, 1);
    const pose = computeFollowPose({
      point: [creature.x, creature.y, creature.z],
      normal: [normal.x, normal.y, normal.z],
      forward: [forward.x, forward.y, forward.z],
      scale: 0.12,
      yaw: 0,
      pitch: 0,
    });
    const cam = new THREE.PerspectiveCamera(45, 1, 0.03, 100);
    cam.position.set(...pose.position);
    cam.up.set(...pose.up);
    cam.lookAt(new THREE.Vector3(...pose.target));
    cam.updateMatrixWorld();
    frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    // il centro del pianeta (dove sta la sfera vuota) è dietro/sotto la camera, fuori dal campo visivo
    expect(frustum.intersectsObject(body)).toBe(false);
    // anche se le istanze sono nel campo visivo
    body.count = 1;
    const m = new THREE.Matrix4().setPosition(creature);
    body.setMatrixAt(0, m);
    expect(frustum.containsPoint(creature)).toBe(true);
    expect(frustum.intersectsObject(body)).toBe(false);
  });
});

describe("v1.8.0 — fauna: zampe, ombra, orecchie, sfumatura", () => {
  it("dal dettaglio 2: quattro zampe e un'ombra per creatura; al dettaglio 1 niente", () => {
    const r2 = makeRefs(2);
    updateCreatureInstances(r2, frameAt(100, 200));
    expect(r2.legMesh.count).toBe(4);
    expect(r2.shadowMesh.count).toBe(1);
    const r1 = makeRefs(1);
    updateCreatureInstances(r1, frameAt(100, 200));
    expect(r1.legMesh.count).toBe(0);
    expect(r1.shadowMesh.count).toBe(0);
  });

  it("le zampe sono ai quattro angoli del corpo e i piedi toccano il suolo", () => {
    const r = makeRefs(3);
    updateCreatureInstances(r, frameAt(100, 200));
    const body = posAt(r.bodyMesh, 0);
    const legs = [0, 1, 2, 3].map((n) => posAt(r.legMesh, n));
    // quattro posizioni diverse
    const keys = new Set(legs.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`));
    expect(keys.size).toBe(4);
    // l'anca (estremo alto della zampa) sta sotto il centro del corpo
    for (const leg of legs) expect(leg.length()).toBeLessThan(body.length());
    // il piede (estremo basso) arriva circa al suolo: raggio base + 0.02 (appoggio) a riposo
    const anatomy = computeCreatureAnatomy({ speed: mid("speed"), carnivory: lo("carnivory"), vision: mid("vision"), evasion: lo("evasion"), huntingSkill: mid("huntingSkill") });
    const mat = matrixAt(r.legMesh, 0);
    const foot = new THREE.Vector3(0, -1, 0).applyMatrix4(mat); // base del cilindro unitario traslato: da y=0 a y=-1
    const ground = 5 + 0.02;
    expect(Math.abs(foot.length() - ground)).toBeLessThan(0.12 * anatomy.legLength * 0.2 + 0.01);
  });

  it("il corpo è più alto con le zampe che senza", () => {
    const r1 = makeRefs(1);
    const r2 = makeRefs(2);
    updateCreatureInstances(r1, frameAt(100, 200));
    updateCreatureInstances(r2, frameAt(100, 200));
    expect(posAt(r2.bodyMesh, 0).length()).toBeGreaterThan(posAt(r1.bodyMesh, 0).length());
  });

  it("la zampa oscilla quando la creatura cammina, e sta ferma quando è ferma", () => {
    const r = makeRefs(3);
    updateCreatureInstances(r, frameAt(100, 200));
    const rest = matrixAt(r.legMesh, 0).elements.slice();
    // ferma: stessa posizione, la matrice non cambia
    updateCreatureInstances(r, frameAt(100, 200));
    expect(matrixAt(r.legMesh, 0).elements).toEqual(rest.map((v) => expect.closeTo(v, 9)));
    // si muove: la matrice della zampa cambia (rotazione di oscillazione)
    const swings = new Set<string>();
    for (let k = 1; k <= 12; k++) {
      updateCreatureInstances(r, frameAt(100 + k * 0.4, 200));
      swings.add(matrixAt(r.legMesh, 0).elements.map((v) => v.toFixed(3)).join(","));
    }
    expect(swings.size).toBeGreaterThan(4);
  });

  it("in diagonale: zampa 0 e 3 oscillano in fase, 0 e 1 in controfase", () => {
    const r = makeRefs(3);
    updateCreatureInstances(r, frameAt(100, 200));
    updateCreatureInstances(r, frameAt(100.6, 200));
    // angolo di rotazione attorno a X di ciascuna zampa, dalla matrice locale rispetto al corpo
    const angle = (n: number) => {
      const q = new THREE.Quaternion();
      matrixAt(r.legMesh, n).decompose(new THREE.Vector3(), q, new THREE.Vector3());
      const body = new THREE.Quaternion();
      matrixAt(r.bodyMesh, 0).decompose(new THREE.Vector3(), body, new THREE.Vector3());
      const rel = body.clone().invert().multiply(q);
      return 2 * Math.atan2(rel.x, rel.w);
    };
    expect(angle(0)).toBeCloseTo(angle(3), 5);
    expect(angle(1)).toBeCloseTo(angle(2), 5);
    expect(angle(0)).toBeCloseTo(-angle(1), 5);
    expect(Math.abs(angle(0))).toBeGreaterThan(0.01);
  });

  it("gli erbivori hanno le orecchie, i predatori no (solo al dettaglio 3)", () => {
    const herb = makeRefs(3);
    updateCreatureInstances(herb, frameAt(100, 200, lo("carnivory")));
    expect(herb.earMesh.count).toBe(2);
    const det = (i: number) => matrixAt(herb.earMesh, i).determinant();
    expect(Math.abs(det(0))).toBeGreaterThan(1e-9);
    expect(Math.abs(det(1))).toBeGreaterThan(1e-9);
    const pred = makeRefs(3);
    updateCreatureInstances(pred, frameAt(100, 200, hi("carnivory")));
    expect(Math.abs(matrixAt(pred.earMesh, 0).determinant())).toBeLessThan(1e-12);
    const mid2 = makeRefs(2);
    updateCreatureInstances(mid2, frameAt(100, 200, lo("carnivory")));
    expect(mid2.earMesh.count).toBe(0);
  });

  it("l'anatomia: orecchie solo sotto la soglia di carnivoria, più grandi con più vista; zampe più lunghe per i veloci", () => {
    const herb = computeCreatureAnatomy({ speed: mid("speed"), carnivory: lo("carnivory"), vision: lo("vision"), evasion: lo("evasion"), huntingSkill: mid("huntingSkill") });
    const sharp = computeCreatureAnatomy({ speed: mid("speed"), carnivory: lo("carnivory"), vision: hi("vision"), evasion: lo("evasion"), huntingSkill: mid("huntingSkill") });
    expect(herb.earVisible).toBe(true);
    expect(sharp.earHeight).toBeGreaterThan(herb.earHeight);
    const pred = computeCreatureAnatomy({ speed: mid("speed"), carnivory: hi("carnivory"), vision: mid("vision"), evasion: lo("evasion"), huntingSkill: mid("huntingSkill") });
    expect(pred.earVisible).toBe(false);
    expect(EAR_VISIBLE_MAX_CARNIVORY).toBe(0.5);
    const slow = computeCreatureAnatomy({ speed: lo("speed"), carnivory: lo("carnivory"), vision: mid("vision"), evasion: lo("evasion"), huntingSkill: mid("huntingSkill") });
    const fast = computeCreatureAnatomy({ speed: hi("speed"), carnivory: lo("carnivory"), vision: mid("vision"), evasion: lo("evasion"), huntingSkill: mid("huntingSkill") });
    expect(fast.legLength).toBeGreaterThan(slow.legLength);
    expect(fast.legRadius).toBeLessThan(slow.legRadius);
  });

  it("la sfumatura ventre-dorso: ventre 1, dorso più scuro, mai sotto 0,7", () => {
    const g = addBellyGradient(new THREE.SphereGeometry(1, 8, 6));
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = g.attributes.color as THREE.BufferAttribute;
    let minShade = 1;
    let belly = 0;
    let back = 1;
    for (let i = 0; i < pos.count; i++) {
      const c = col.getX(i);
      minShade = Math.min(minShade, c);
      if (pos.getY(i) < -0.99) belly = c;
      if (pos.getY(i) > 0.99) back = c;
    }
    expect(belly).toBeCloseTo(1, 5);
    expect(back).toBeLessThan(belly);
    expect(minShade).toBeGreaterThan(0.7);
  });

  it("le nuove parti non hanno matrici degeneri (NaN) per nessun profilo di dettaglio", () => {
    for (const d of [1, 2, 3] as const) {
      const r = makeRefs(d);
      updateCreatureInstances(r, frameAt(100, 200));
      updateCreatureInstances(r, frameAt(101, 200.5));
      for (const m of [r.legMesh, r.earMesh, r.shadowMesh]) {
        for (let i = 0; i < m.count; i++) for (const e of matrixAt(m, i).elements) expect(Number.isFinite(e)).toBe(true);
      }
    }
  });
});

describe("v1.8.0 — l'animale poggia sul terreno locale", () => {
  it("dentro l'area locale il corpo sta sulla stessa superficie disegnata dalla mesh", () => {
    const local = createLocalScene(QUALITY_PROFILES.alto, 5);
    local.update(makeVf({ terrain: 1, elevation: 0.8, originX: 100, originY: 200, cells: 64 }), W, H, 132, 232);
    const withLocal = makeRefs(1, local);
    const without = makeRefs(1, null);
    updateCreatureInstances(withLocal, frameAt(132, 232));
    updateCreatureInstances(without, frameAt(132, 232));
    const anatomy = computeCreatureAnatomy({ speed: mid("speed"), carnivory: lo("carnivory"), vision: mid("vision"), evasion: lo("evasion"), huntingSkill: mid("huntingSkill") });
    const expected = groundRadius(local.ground!, 132, 232, 5) + 0.02 + anatomy.bodyHalfHeight * 0.8 * 0.12;
    expect(posAt(withLocal.bodyMesh, 0).length()).toBeCloseTo(expected, 4);
    // senza terreno locale (e senza heightmap) resta il raggio piatto
    expect(posAt(without.bodyMesh, 0).length()).toBeCloseTo(5 + 0.02 + anatomy.bodyHalfHeight * 0.8 * 0.12, 4);
  });

  it("fuori dall'area locale si usa il terreno globale come prima", () => {
    const local = createLocalScene(QUALITY_PROFILES.alto, 5);
    local.update(makeVf({ terrain: 1, elevation: 0.8, originX: 100, originY: 200, cells: 64 }), W, H, 132, 232);
    const a = makeRefs(1, local);
    const b = makeRefs(1, null);
    updateCreatureInstances(a, frameAt(400, 50));
    updateCreatureInstances(b, frameAt(400, 50));
    expect(posAt(a.bodyMesh, 0).length()).toBeCloseTo(posAt(b.bodyMesh, 0).length(), 9);
  });
});

describe("v1.8.0 — sole in terza persona", () => {
  it("sta sopra il bersaglio, lungo la verticale locale", () => {
    const sun = new THREE.DirectionalLight();
    const target = new THREE.Vector3(5, 0, 0);
    const up = new THREE.Vector3(1, 0, 0);
    const cam = new THREE.Vector3(5.3, 0, -0.8);
    placeFollowSun(sun, cam, target, up);
    expect(sun.position.x).toBeGreaterThan(target.x + 5); // molto sopra
    expect(Number.isFinite(sun.position.y)).toBe(true);
    // illumina dall'alto: la direzione verso l'origine (target della luce) ha componente principale -up
    const dir = sun.position.clone().negate().normalize();
    expect(dir.dot(up)).toBeLessThan(-0.7);
  });

  it("non esplode se camera e bersaglio coincidono", () => {
    const sun = new THREE.DirectionalLight();
    const p = new THREE.Vector3(5, 0, 0);
    placeFollowSun(sun, p, p.clone(), new THREE.Vector3(1, 0, 0));
    for (const v of [sun.position.x, sun.position.y, sun.position.z]) expect(Number.isFinite(v)).toBe(true);
  });
});
