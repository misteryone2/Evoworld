import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { RenderFrame } from "../types";
import { updateCreatureInstances, type SceneRefs } from "../components/simulation/Planet3DView";
import { createBodyPose, computeBodyPose, NORMAL_SPEED_BODIES_PER_S } from "../lib/bodyAnimation";
import { createLivingState, stepLiving, applyLivingPose } from "../lib/livingBehavior";
import { createLodDetail, createLodWeights, lodDetail, lodWeights, FULL_DETAIL, LOD_HIGH_FULL, LOD_HIGH_NONE, LOD_LOW_START, LOD_LOW_FULL } from "../lib/animationLod";
import { World } from "../simulation/core/world";

const SCALE = 0.12;
const anatomy = { legLength: 0.75, bodyHalfLength: 1.27, tailLength: 1.05 };
const detailAt = (r: number) => lodDetail(lodWeights(r, createLodWeights()), createLodDetail());

describe("v1.10.5 — pesi del LOD", () => {
  it("sommano 1, non sono negativi e coprono tutte le distanze (anche valori strani)", () => {
    const w = createLodWeights();
    for (let r = 0; r <= 400; r += 0.5) {
      lodWeights(r, w);
      expect(w.high).toBeGreaterThanOrEqual(0);
      expect(w.medium).toBeGreaterThanOrEqual(-1e-12);
      expect(w.low).toBeGreaterThanOrEqual(0);
      expect(w.high + w.medium + w.low).toBeCloseTo(1, 12);
    }
    for (const bad of [-5, NaN, Infinity]) {
      lodWeights(bad, w);
      expect(w.high + w.medium + w.low).toBeCloseTo(1, 12);
    }
  });

  it("vicino è ALTO, lontano è BASSO, in mezzo MEDIO; i confini sono quelli dichiarati", () => {
    const w = createLodWeights();
    lodWeights(LOD_HIGH_FULL - 1, w);
    expect(w.high).toBe(1);
    lodWeights((LOD_HIGH_NONE + LOD_LOW_START) / 2, w);
    expect(w.medium).toBeCloseTo(1, 12);
    lodWeights(LOD_LOW_FULL + 1, w);
    expect(w.low).toBe(1);
  });

  it("il passaggio tra i livelli è graduale: nessun peso salta più di un poco tra due distanze vicine", () => {
    const a = createLodWeights();
    const b = createLodWeights();
    let maxStep = 0;
    for (let r = 0; r < 300; r += 0.1) {
      lodWeights(r, a);
      lodWeights(r + 0.1, b);
      maxStep = Math.max(maxStep, Math.abs(a.high - b.high), Math.abs(a.medium - b.medium), Math.abs(a.low - b.low));
    }
    expect(maxStep).toBeLessThan(0.03);
  });

  it("i fattori di dettaglio sono continui, tra 0 e 1, e a BASSO testa, coda e sguardo valgono esattamente 0", () => {
    const keys = ["legs", "body", "head", "tail", "living", "breath"] as const;
    let prev = detailAt(0);
    let maxStep = 0;
    for (let r = 0.1; r < 300; r += 0.1) {
      const d = detailAt(r);
      for (const k of keys) {
        expect(d[k]).toBeGreaterThanOrEqual(0);
        expect(d[k]).toBeLessThanOrEqual(1 + 1e-12);
        maxStep = Math.max(maxStep, Math.abs(d[k] - prev[k]));
      }
      prev = { ...d };
    }
    expect(maxStep).toBeLessThan(0.03);
    const far = detailAt(LOD_LOW_FULL + 10);
    expect(far.head).toBe(0);
    expect(far.tail).toBe(0);
    expect(far.living).toBe(0);
    expect(far.legs).toBeGreaterThan(0); // ma le zampe e il respiro restano: nessuna creatura è statica
    expect(far.breath).toBeGreaterThan(0);
    expect(detailAt(0).legs).toBe(1);
  });
});

describe("v1.10.5 — la posa con il LOD", () => {
  const poseWith = (r: number, vn = 0.7, turnRate = 1.5) => {
    const p = createBodyPose();
    computeBodyPose(p, 1.1, { visSpeed: vn * SCALE * NORMAL_SPEED_BODIES_PER_S, turnRate }, SCALE, anatomy, detailAt(r));
    return p;
  };

  it("vicino è identico alla posa senza LOD", () => {
    const a = createBodyPose();
    const b = createBodyPose();
    computeBodyPose(a, 1.1, { visSpeed: 0.3, turnRate: 1 }, SCALE, anatomy);
    computeBodyPose(b, 1.1, { visSpeed: 0.3, turnRate: 1 }, SCALE, anatomy, detailAt(5));
    expect({ ...a, legSwing: Array.from(a.legSwing) }).toEqual({ ...b, legSwing: Array.from(b.legSwing) });
    expect(detailAt(5)).toEqual(FULL_DETAIL);
  });

  it("lontano: nessun cenno di testa né coda, ma le zampe camminano ancora (ridotte) e il corpo rimbalza un po'", () => {
    const near = poseWith(5);
    const far = poseWith(LOD_LOW_FULL + 20);
    expect(far.headPitch).toBe(0);
    expect(far.headYaw).toBe(0);
    expect(far.tailYaw).toBe(0);
    expect(far.tailPitch).toBe(0);
    expect(far.swayX).toBe(0);
    expect(far.surgeZ).toBe(0);
    const maxLeg = (p: ReturnType<typeof createBodyPose>) => Math.max(...Array.from(p.legSwing).map(Math.abs));
    expect(maxLeg(far)).toBeGreaterThan(0.05);
    expect(maxLeg(far)).toBeLessThan(maxLeg(near));
    expect(Math.abs(far.bobY)).toBeGreaterThan(0);
    expect(Math.abs(far.bobY)).toBeLessThan(Math.abs(near.bobY) + 1e-12);
  });

  it("senza salti: a fase e velocità fisse, la posa varia poco al variare della distanza", () => {
    let prev = poseWith(0);
    for (let r = 0.2; r < 300; r += 0.2) {
      const p = poseWith(r);
      for (let n = 0; n < 4; n++) expect(Math.abs(p.legSwing[n] - prev.legSwing[n])).toBeLessThan(0.02);
      expect(Math.abs(p.headPitch - prev.headPitch)).toBeLessThan(0.01);
      expect(Math.abs(p.headYaw - prev.headYaw)).toBeLessThan(0.02);
      expect(Math.abs(p.tailYaw - prev.tailYaw)).toBeLessThan(0.02);
      expect(Math.abs(p.bobY - prev.bobY)).toBeLessThan(0.005);
      expect(Math.abs(p.swayX - prev.swayX)).toBeLessThan(0.005);
      prev = p;
    }
  });

  it("da ferma, lontano: respira ancora (variazioni minime) ma non si guarda attorno", () => {
    const s = createLivingState(5);
    for (let t = 0; t < 3000; t += 16) stepLiving(s, 16, 0, 0);
    let minB = Infinity;
    let maxB = -Infinity;
    let maxYaw = 0;
    for (let t = 0; t < 8000; t += 16) {
      stepLiving(s, 16, 0, 0);
      const p = createBodyPose();
      computeBodyPose(p, 0, { visSpeed: 0, turnRate: 0 }, SCALE, anatomy, detailAt(LOD_LOW_FULL + 20));
      applyLivingPose(p, s, detailAt(LOD_LOW_FULL + 20));
      minB = Math.min(minB, p.breath);
      maxB = Math.max(maxB, p.breath);
      maxYaw = Math.max(maxYaw, Math.abs(p.headYaw));
    }
    expect(maxB - minB).toBeGreaterThan(0.01);
    expect(maxYaw).toBe(0);
  });
});

describe("v1.10.5 — nelle creature disegnate", () => {
  const CAP = 16;
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
      maxCreatures: CAP,
      detail: 3,
    }) as unknown as SceneRefs;
  const frameAt = (x: number, y: number, size = 1): RenderFrame =>
    ({
      planetWidth: 512,
      planetHeight: 512,
      organismsX: new Float32Array([x]),
      organismsY: new Float32Array([y]),
      organismsSpecies: new Uint16Array(1),
      organismsSize: new Float32Array([size]),
      organismsSpeed: new Float32Array([1]),
      organismsCarnivory: new Float32Array(1),
      organismsVision: new Float32Array([1]),
      organismsEvasion: new Float32Array([0.5]),
      organismsHuntingSkill: new Float32Array([1]),
      organismsId: new Uint32Array([1]),
    }) as unknown as RenderFrame;
  const matrices = (mesh_: THREE.InstancedMesh, count: number) => {
    const out: number[] = [];
    const m = new THREE.Matrix4();
    for (let k = 0; k < count; k++) {
      mesh_.getMatrixAt(k, m);
      out.push(...m.elements);
    }
    return out;
  };
  /** Camera a una distanza data da (200, 256) sulla superficie. */
  const cameraFar = new THREE.Vector3(0, 0, 40);

  it("senza camera il dettaglio è sempre massimo (come prima); con una camera vicina, lo stesso", () => {
    const a = refsFor();
    const b = refsFor();
    const c = refsFor();
    let x = 200;
    const near = new THREE.Vector3(-4.2, 0, 2.5); // vicino alla creatura a (200,256)? la distanza si calcola nel test sotto
    void near;
    for (let k = 0; k < 40; k++) {
      x += 0.3;
      updateCreatureInstances(a, frameAt(x, 256), null, null, 16);
      updateCreatureInstances(b, frameAt(x, 256), null, null, 16, null);
      updateCreatureInstances(c, frameAt(x, 256), null, null, 16, new THREE.Vector3(0, 0, 0)); // il centro del pianeta: ~5 unità = 40 scale -> medio
    }
    expect(matrices(a.headMesh, 1)).toEqual(matrices(b.headMesh, 1));
    expect(matrices(a.legMesh, 4)).toEqual(matrices(b.legMesh, 4));
  });

  it("lontano, la creatura si muove e ruota ancora (posizione e rotazione continue); nessuna è statica", () => {
    const refs = refsFor();
    let x = 200;
    let prev = matrices(refs.bodyMesh, 1);
    let changed = 0;
    for (let k = 0; k < 40; k++) {
      x += 0.3;
      updateCreatureInstances(refs, frameAt(x, 256), null, null, 16, cameraFar);
      const now = matrices(refs.bodyMesh, 1);
      if (now.some((v, j) => Math.abs(v - prev[j]) > 1e-9)) changed++;
      prev = now;
    }
    expect(changed).toBe(40);
    const legsBefore = matrices(refs.legMesh, 4);
    x += 0.3;
    updateCreatureInstances(refs, frameAt(x, 256), null, null, 16, cameraFar);
    expect(matrices(refs.legMesh, 4).some((v, j) => Math.abs(v - legsBefore[j]) > 1e-9)).toBe(true); // le zampe vanno ancora
  });

  it("lontano, la testa non fa cenni rispetto al corpo; vicino sì", () => {
    const rel = (refs: SceneRefs) => {
      const h = new THREE.Matrix4();
      const b = new THREE.Matrix4();
      refs.headMesh.getMatrixAt(0, h);
      refs.bodyMesh.getMatrixAt(0, b);
      return new THREE.Vector3().setFromMatrixPosition(h.premultiply(b.clone().invert()));
    };
    const spreadOf = (camera: THREE.Vector3 | null) => {
      const refs = refsFor();
      let x = 200;
      const seen: THREE.Vector3[] = [];
      for (let k = 0; k < 60; k++) {
        x += 0.35;
        updateCreatureInstances(refs, frameAt(x, 256), null, null, 16, camera);
        if (k > 20) seen.push(rel(refs));
      }
      return Math.max(...seen.map((v) => v.distanceTo(seen[0])));
    };
    const farSpread = spreadOf(cameraFar);
    const nearSpread = spreadOf(null);
    expect(nearSpread).toBeGreaterThan(1e-4);
    expect(farSpread).toBeLessThan(nearSpread * 0.2);
  });

  it("una creatura più grossa resta in dettaglio a distanze maggiori (la distanza è in scale)", () => {
    // stessa distanza dalla camera: a taglia piccola la distanza in scale è maggiore -> meno dettaglio
    const d = 4; // unità
    const small = detailAt(d / (0.3 * SCALE));
    const big = detailAt(d / (3 * SCALE));
    expect(big.head).toBeGreaterThan(small.head);
  });

  it("dopo una sospensione della scheda (dt enorme) tutte le matrici restano finite, a qualunque distanza", () => {
    for (const cam of [null, cameraFar]) {
      const refs = refsFor();
      updateCreatureInstances(refs, frameAt(200, 256), null, null, 16, cam);
      updateCreatureInstances(refs, frameAt(230, 256), null, null, 90_000, cam);
      for (const m of [refs.bodyMesh, refs.headMesh, refs.legMesh, refs.tailMesh]) {
        for (const v of matrices(m, 1)) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe("v1.10.5 — regressione: simulazione e salvataggi", () => {
  it("lo stato di animazione non finisce nei salvataggi", () => {
    const w = new World({ width: 128, height: 128, seed: 12 }, 60);
    for (let t = 0; t < 20; t++) w.step();
    const json = JSON.stringify(w.toSnapshot());
    for (const key of ["organismsEnergy", "organismsEnergyGain", "creatureTrack", "hasYaw", "turnRate", "visSpeed", "breathPhase", "stillMs", "eatHoldMs", "legSwing", "lodWeights"]) {
      expect(json.includes(key)).toBe(false);
    }
  });

  it("un salvataggio caricato prosegue esattamente come il mondo originale", () => {
    const a = new World({ width: 128, height: 128, seed: 21 }, 70);
    for (let t = 0; t < 15; t++) a.step();
    const b = World.fromSnapshot(JSON.parse(JSON.stringify(a.toSnapshot())));
    for (let t = 0; t < 25; t++) {
      a.step();
      b.step();
    }
    expect(b.organisms.length).toBe(a.organisms.length);
    expect(b.organisms.map((o) => [o.id, o.position.x, o.position.y, o.energy])).toEqual(a.organisms.map((o) => [o.id, o.position.x, o.position.y, o.energy]));
  });
});
