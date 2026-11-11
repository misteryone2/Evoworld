import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { RenderFrame } from "../types";
import { updateCreatureInstances, type SceneRefs } from "../components/simulation/Planet3DView";
import {
  createBodyPose,
  computeBodyPose,
  gaitWeights,
  advancePhase,
  normalizedSpeed,
  GAIT_OFFSETS,
  LEG_FRONT_LEFT,
  LEG_FRONT_RIGHT,
  LEG_REAR_LEFT,
  LEG_REAR_RIGHT,
  NORMAL_SPEED_BODIES_PER_S,
  TWO_PI,
  type LimbAnatomy,
} from "../lib/bodyAnimation";

const SCALE = 0.12;
const medium: LimbAnatomy = { legLength: 0.75, bodyHalfLength: 1.27, tailLength: 1.05 };
const slowHeavy: LimbAnatomy = { legLength: 0.55, bodyHalfLength: 1, tailLength: 0.5 };
const fastLean: LimbAnatomy = { legLength: 0.95, bodyHalfLength: 1.55, tailLength: 1.6 };
/** Velocità in unità/s per una velocità normalizzata `vn`. */
const speedFor = (vn: number) => vn * SCALE * NORMAL_SPEED_BODIES_PER_S;
const pose = (phase: number, vn: number, turnRate = 0, anatomy = medium) => {
  const p = createBodyPose();
  computeBodyPose(p, phase, { visSpeed: speedFor(vn), turnRate }, SCALE, anatomy);
  return p;
};

describe("v1.10.3 — andature", () => {
  it("i pesi di passo, trotto e galoppo sono non negativi, sommano 1 e variano con continuità", () => {
    const w = { walk: 0, trot: 0, gallop: 0 };
    let prev = { walk: 1, trot: 0, gallop: 0 };
    for (let vn = 0; vn <= 1.5; vn += 0.005) {
      gaitWeights(vn, w);
      expect(w.walk).toBeGreaterThanOrEqual(0);
      expect(w.trot).toBeGreaterThanOrEqual(-1e-12);
      expect(w.gallop).toBeGreaterThanOrEqual(0);
      expect(w.walk + w.trot + w.gallop).toBeCloseTo(1, 9);
      expect(Math.abs(w.walk - prev.walk)).toBeLessThan(0.06);
      expect(Math.abs(w.gallop - prev.gallop)).toBeLessThan(0.06);
      prev = { ...w };
    }
    gaitWeights(0.1, w);
    expect(w.walk).toBeCloseTo(1, 9);
    gaitWeights(0.7, w);
    expect(w.trot).toBeCloseTo(1, 9);
    gaitWeights(1.5, w);
    expect(w.gallop).toBeCloseTo(1, 9);
  });

  it("a passo le quattro zampe hanno sfasamenti diversi; al trotto le diagonali vanno insieme; al galoppo le anteriori quasi insieme", () => {
    const phase = 0.3;
    const walk = pose(phase, 0.1).legSwing;
    const values = [0, 1, 2, 3].map((n) => walk[n]);
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) expect(Math.abs(values[a] - values[b])).toBeGreaterThan(1e-4);
    const trot = pose(phase, 0.7).legSwing;
    expect(trot[LEG_FRONT_LEFT]).toBeCloseTo(trot[LEG_REAR_RIGHT], 9);
    expect(trot[LEG_FRONT_RIGHT]).toBeCloseTo(trot[LEG_REAR_LEFT], 9);
    expect(trot[LEG_FRONT_LEFT]).toBeCloseTo(-trot[LEG_FRONT_RIGHT], 6); // diagonali in opposizione
    const gallop = pose(phase, 1.5).legSwing;
    expect(Math.abs(gallop[LEG_FRONT_LEFT] - gallop[LEG_FRONT_RIGHT])).toBeLessThan(Math.abs(gallop[LEG_FRONT_LEFT] - gallop[LEG_REAR_LEFT]) + 1e-9);
    expect(GAIT_OFFSETS.gallop[LEG_FRONT_RIGHT] - GAIT_OFFSETS.gallop[LEG_FRONT_LEFT]).toBeLessThan(0.15);
  });

  it("il passo non ha salti: velocità e fase variano poco → l'oscillazione varia poco", () => {
    let prevSwing = pose(0, 0).legSwing.slice();
    for (let vn = 0.001; vn <= 1.5; vn += 0.01) {
      const now = pose(1.1, vn).legSwing.slice();
      for (let n = 0; n < 4; n++) expect(Math.abs(now[n] - prevSwing[n])).toBeLessThan(0.1);
      prevSwing = now;
    }
    let prev = pose(0, 0.7).legSwing.slice();
    for (let phase = 0.02; phase <= TWO_PI; phase += 0.02) {
      const now = pose(phase, 0.7).legSwing.slice();
      for (let n = 0; n < 4; n++) expect(Math.abs(now[n] - prev[n])).toBeLessThan(0.05);
      prev = now;
    }
  });
});

describe("v1.10.3 — da fermo", () => {
  it("ferma, le zampe sono ferme e la posa è tutta a zero", () => {
    const p = pose(2.2, 0);
    for (let n = 0; n < 4; n++) expect(p.legSwing[n]).toBe(0);
    expect(p.stride).toBe(0);
    expect([p.bobY, p.swayX, p.surgeZ, p.headPitch, p.headYaw, p.tailYaw, p.tailPitch]).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("la fase del passo non avanza da ferma", () => {
    expect(advancePhase(1.234, 0, 16, SCALE)).toBeCloseTo(1.234, 12);
    expect(advancePhase(1.234, 0, 5000, SCALE)).toBeCloseTo(1.234, 12);
  });

  it("l'ampiezza sale con la velocità fino a un massimo, senza passi nel nulla", () => {
    let prev = -1;
    for (let vn = 0; vn <= 1.5; vn += 0.02) {
      const p = pose(Math.PI / 2, vn, 0, { ...medium }); // fase a metà: seno = 1 per i trotti
      const a = Math.max(...Array.from(p.legSwing).map(Math.abs));
      expect(a).toBeGreaterThanOrEqual(0);
      expect(p.stride).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = p.stride;
    }
    expect(pose(0, 0.01).stride).toBeLessThan(pose(0, 0.2).stride);
    expect(pose(0, 0.25).stride).toBeCloseTo(1, 9);
    expect(pose(0, 1.2).stride).toBeCloseTo(1, 9);
  });
});

describe("v1.10.3 — passo sincronizzato con la velocità", () => {
  it("la cadenza è proporzionale alla velocità: il doppio di velocità, il doppio di fase nello stesso tempo", () => {
    const a = advancePhase(0, 0.2, 100, SCALE);
    const b = advancePhase(0, 0.4, 100, SCALE);
    expect(b).toBeCloseTo(2 * a, 9);
  });
  it("a parità di velocità, il passo di una creatura più grossa è più lungo (cadenza più bassa)", () => {
    expect(advancePhase(0, 0.3, 100, 0.12)).toBeGreaterThan(advancePhase(0, 0.3, 100, 0.24));
  });
  it("un ciclo completo ogni 3,2 lunghezze di scala (come prima della v1.10.3)", () => {
    const halfCycle = advancePhase(0, 1.6 * SCALE, 1000, SCALE); // 1,6 scale in 1 s
    expect(halfCycle).toBeCloseTo(Math.PI, 9);
    expect(advancePhase(0, 3.2 * SCALE, 1000, SCALE)).toBeCloseTo(0, 6); // 3,2 scale = 2π, riavvolto a 0
    expect(advancePhase(0, 3.2 * SCALE, 500, SCALE)).toBeCloseTo(Math.PI, 9); // metà strada, metà ciclo
  });
  it("resta in [0, 2π) e dt negativo non muove", () => {
    let phase = 0;
    for (let k = 0; k < 500; k++) {
      phase = advancePhase(phase, 0.9, 16, SCALE);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(TWO_PI);
    }
    expect(advancePhase(1, 0.9, -50, SCALE)).toBe(1);
  });
  it("normalizedSpeed: 0 da fermo, limitata in alto", () => {
    expect(normalizedSpeed(0, SCALE)).toBe(0);
    expect(normalizedSpeed(100, SCALE)).toBeLessThanOrEqual(1.5);
  });
});

describe("v1.10.3 — coerenza con la morfologia", () => {
  it("creature diverse si muovono in modo diverso (zampe, coda), restando entro limiti ragionevoli", () => {
    const a = pose(1, 0.7, 0, slowHeavy);
    const b = pose(1, 0.7, 0, fastLean);
    expect(Array.from(a.legSwing)).not.toEqual(Array.from(b.legSwing));
    expect(a.tailYaw).not.toBeCloseTo(b.tailYaw, 6);
    for (const an of [slowHeavy, medium, fastLean]) {
      for (let vn = 0; vn <= 1.5; vn += 0.1) {
        for (let phase = 0; phase < TWO_PI; phase += 0.5) {
          const p = pose(phase, vn, 3, an);
          for (let n = 0; n < 4; n++) expect(Math.abs(p.legSwing[n])).toBeLessThanOrEqual(0.8 + 1e-9);
          expect(Math.abs(p.bobY)).toBeLessThanOrEqual(0.05);
          expect(Math.abs(p.swayX)).toBeLessThanOrEqual(0.04);
          expect(Math.abs(p.surgeZ)).toBeLessThanOrEqual(0.035);
          expect(Math.abs(p.headPitch)).toBeLessThanOrEqual(0.09);
          expect(Math.abs(p.headYaw)).toBeLessThanOrEqual(0.4 + 1e-9);
          expect(Math.abs(p.tailYaw)).toBeLessThanOrEqual(0.7);
        }
      }
    }
  });

  it("una coda lunga oscilla meno (in angolo) di una corta", () => {
    const short = pose(Math.PI / 2, 0.7, 0, { ...medium, tailLength: 0.5 });
    const long = pose(Math.PI / 2, 0.7, 0, { ...medium, tailLength: 1.6 });
    expect(Math.abs(short.tailYaw)).toBeGreaterThan(Math.abs(long.tailYaw));
  });
});

describe("v1.10.3 — testa e coda in curva", () => {
  const Y = new THREE.Vector3(0, 1, 0);
  it("la testa si volge verso la curva e la coda fa da contrappeso dalla parte opposta", () => {
    // turnRate > 0 = svolta a sinistra (verificato con la proiezione reale nei test della v1.10.2); a sinistra = −X locale
    const p = pose(0, 0.7, 3);
    const headFwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(Y, p.headYaw);
    expect(headFwd.x).toBeLessThan(0); // testa a sinistra
    const q = pose(0, 0.7, -3);
    expect(new THREE.Vector3(0, 0, 1).applyAxisAngle(Y, q.headYaw).x).toBeGreaterThan(0); // testa a destra
    // la parte "di curva" della coda (indipendente dall'oscillazione): con fase che azzera il seno, resta solo il contrappeso
    const tail = pose(Math.PI, 0.7, 3).tailYaw; // sin(2π·cycle+π) = 0 con cycle=0.5
    const tailTip = new THREE.Vector3(0, 0, -1).applyAxisAngle(Y, tail);
    expect(tailTip.x).toBeGreaterThan(0); // la punta della coda va a destra
  });
  it("dritta, la testa non gira", () => {
    expect(pose(1.3, 0.7, 0).headYaw).toBeCloseTo(0, 12);
  });
  it("fermi ma in rotazione, la posa si anima ancora un poco e non esplode", () => {
    const p = pose(0, 0, 4);
    expect(Number.isFinite(p.headYaw)).toBe(true);
    for (let n = 0; n < 4; n++) expect(p.legSwing[n]).toBeCloseTo(0, 12); // ma le zampe non camminano
  });
});

describe("v1.10.3 — nelle creature disegnate", () => {
  const CAP = 8;
  const mesh = (n: number) => new THREE.InstancedMesh(new THREE.SphereGeometry(1, 4, 3), new THREE.MeshBasicMaterial(), n);
  const refsFor = (detail = 3) =>
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
      detail,
    }) as unknown as SceneRefs;
  const frameAt = (x: number, y: number): RenderFrame =>
    ({
      planetWidth: 512,
      planetHeight: 512,
      organismsX: new Float32Array([x]),
      organismsY: new Float32Array([y]),
      organismsSpecies: new Uint16Array(1),
      organismsSize: new Float32Array([1]),
      organismsSpeed: new Float32Array([1]),
      organismsCarnivory: new Float32Array(1),
      organismsVision: new Float32Array([1]),
      organismsEvasion: new Float32Array(1),
      organismsHuntingSkill: new Float32Array([1]),
      organismsId: new Uint32Array([1]),
    }) as unknown as RenderFrame;
  const legMatrices = (refs: SceneRefs) => {
    const out: number[][] = [];
    for (let n = 0; n < 4; n++) {
      const m = new THREE.Matrix4();
      refs.legMesh.getMatrixAt(n, m);
      out.push(Array.from(m.elements));
    }
    return out;
  };
  const headRelative = (refs: SceneRefs) => {
    const hb = new THREE.Matrix4();
    const bb = new THREE.Matrix4();
    refs.headMesh.getMatrixAt(0, hb);
    refs.bodyMesh.getMatrixAt(0, bb);
    const inv = bb.clone().invert();
    return new THREE.Vector3().setFromMatrixPosition(hb.premultiply(inv));
  };
  const differs = (a: number[][], b: number[][]) => a.some((m, k) => m.some((v, j) => Math.abs(v - b[k][j]) > 1e-9));

  it("camminando le zampe si muovono; ferma (assestata) restano ferme", () => {
    const refs = refsFor();
    const pos = { x: 200, y: 256 };
    let previous = legMatrices(refs);
    let moved = 0;
    for (let k = 0; k < 40; k++) {
      pos.x += 0.4;
      updateCreatureInstances(refs, frameAt(pos.x, pos.y), null, null, 16);
      const now = legMatrices(refs);
      if (differs(now, previous)) moved++;
      previous = now;
    }
    expect(moved).toBeGreaterThan(30);
    // si ferma: la velocità visiva decade; dopo un po' le zampe non si muovono più
    for (let k = 0; k < 120; k++) updateCreatureInstances(refs, frameAt(pos.x, pos.y), null, null, 16);
    const rest1 = legMatrices(refs);
    updateCreatureInstances(refs, frameAt(pos.x, pos.y), null, null, 16);
    const rest2 = legMatrices(refs);
    expect(differs(rest1, rest2)).toBe(false);
  });

  it("la testa si muove rispetto al corpo camminando e sta ferma da ferma", () => {
    const refs = refsFor();
    const pos = { x: 200, y: 256 };
    const offsets: THREE.Vector3[] = [];
    for (let k = 0; k < 40; k++) {
      pos.x += 0.4;
      updateCreatureInstances(refs, frameAt(pos.x, pos.y), null, null, 16);
      offsets.push(headRelative(refs));
    }
    const spread = Math.max(...offsets.slice(10).map((o) => o.distanceTo(offsets[10])));
    expect(spread).toBeGreaterThan(1e-4);
    for (let k = 0; k < 120; k++) updateCreatureInstances(refs, frameAt(pos.x, pos.y), null, null, 16);
    // v1.10.4 — da ferma non cammina più, ma non è un oggetto fermo (respira, a tratti si guarda attorno): movimenti piccoli e lenti
    let previous = headRelative(refs);
    for (let k = 0; k < 60; k++) {
      updateCreatureInstances(refs, frameAt(pos.x, pos.y), null, null, 16);
      const now = headRelative(refs);
      expect(now.distanceTo(previous)).toBeLessThan(0.01); // niente scatti
      previous = now;
    }
  });

  it("i profili leggeri (dettaglio 1, senza zampe) funzionano e animano corpo e testa", () => {
    const refs = refsFor(1);
    const pos = { x: 200, y: 256 };
    for (let k = 0; k < 30; k++) {
      pos.x += 0.4;
      updateCreatureInstances(refs, frameAt(pos.x, pos.y), null, null, 16);
    }
    expect(refs.bodyMesh.count).toBe(1);
    expect(refs.headMesh.count).toBe(1);
  });

  it("non modifica i dati del frame e lo stato resta nel tracciato visivo", () => {
    const refs = refsFor();
    const f = frameAt(100, 100);
    const x = Array.from(f.organismsX);
    const y = Array.from(f.organismsY);
    for (let k = 0; k < 5; k++) updateCreatureInstances(refs, f, null, null, 16);
    expect(Array.from(f.organismsX)).toEqual(x);
    expect(Array.from(f.organismsY)).toEqual(y);
    expect(refs.creatureTrack.get(1)!.motion).toBeDefined();
  });
});
