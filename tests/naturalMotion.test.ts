import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { RenderFrame } from "../types";
import { updateCreatureInstances, type SceneRefs } from "../components/simulation/Planet3DView";
import { projectToSphere } from "../lib/sphereProjection";
import {
  normalizeAngle,
  shortestAngleDelta,
  stepAngle,
  stepSpeed,
  stepVisualMotion,
  createVisualMotion,
  TURN_MAX_RATE,
  MAX_ROLL,
  MAX_PITCH,
  SPEED_EPSILON,
  GRID_YAW_INCREASING_IS_LEFT,
} from "../lib/naturalMotion";

describe("v1.10.2 — angoli", () => {
  it("normalizeAngle porta in (−π, π]", () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(normalizeAngle(2 * Math.PI + 0.3)).toBeCloseTo(0.3, 12);
    expect(normalizeAngle(-2 * Math.PI - 0.3)).toBeCloseTo(-0.3, 12);
    expect(normalizeAngle(NaN)).toBe(0);
  });

  it("la rotazione più corta attraversa ±π senza fare il giro lungo", () => {
    expect(shortestAngleDelta(3.0, -3.0)).toBeCloseTo(2 * Math.PI - 6, 9); // +0.283, non −6
    expect(shortestAngleDelta(-3.0, 3.0)).toBeCloseTo(6 - 2 * Math.PI, 9); // −0.283
    expect(shortestAngleDelta(0.1, 0.4)).toBeCloseTo(0.3, 12);
    expect(Math.abs(shortestAngleDelta(0, Math.PI))).toBeCloseTo(Math.PI, 9);
  });
});

describe("v1.10.2 — rotazione graduale", () => {
  it("non salta alla direzione nuova: ci arriva passo dopo passo, senza superarla", () => {
    let a = 0;
    const target = 1.5;
    let prev = a;
    let steps = 0;
    while (Math.abs(shortestAngleDelta(a, target)) > 0.01 && steps < 500) {
      a = stepAngle(a, target, 16, 1);
      expect(a).toBeGreaterThan(prev); // sempre in avanti
      expect(a).toBeLessThanOrEqual(target + 1e-9); // mai oltre
      prev = a;
      steps++;
    }
    expect(steps).toBeGreaterThan(5); // non istantanea
    expect(steps).toBeLessThan(120); // non lentissima (< 2 s)
  });

  it("la velocità angolare non supera il tetto, nemmeno per un'inversione di marcia", () => {
    let a = 0;
    for (let k = 0; k < 40; k++) {
      const next = stepAngle(a, Math.PI * 0.99, 16, 1);
      expect(Math.abs(shortestAngleDelta(a, next)) / 0.016).toBeLessThanOrEqual(TURN_MAX_RATE + 1e-6);
      a = next;
    }
  });

  it("attraversa ±π dalla parte giusta", () => {
    let a = 3.0;
    for (let k = 0; k < 6; k++) {
      const next = stepAngle(a, -3.0, 16, 1);
      expect(Math.abs(shortestAngleDelta(a, next))).toBeLessThan(0.3); // mai un salto di quasi 2π
      a = next;
    }
  });

  it("è indipendente dal frame rate: stesso tempo, stesso angolo (entro un margine piccolo)", () => {
    const run = (stepMs: number) => {
      let a = 0;
      for (let t = 0; t < 120; t += stepMs) a = stepAngle(a, 0.8, stepMs, 1);
      return a;
    };
    expect(Math.abs(run(8) - run(24))).toBeLessThan(0.02);
    expect(Math.abs(run(6) - run(12))).toBeLessThan(0.02);
  });

  it("le creature più grosse girano più lentamente", () => {
    const small = stepAngle(0, 1.5, 100, 0.5);
    const big = stepAngle(0, 1.5, 100, 3);
    expect(small).toBeGreaterThan(big);
  });

  it("con dt nullo o negativo non cambia nulla; dopo una pausa lunga non salta oltre il limite", () => {
    expect(stepAngle(0.2, 1, 0, 1)).toBe(0.2);
    expect(stepAngle(0.2, 1, -10, 1)).toBe(0.2);
    const afterSuspension = stepAngle(0, 3, 60_000, 1); // come 250 ms
    expect(afterSuspension).toBeLessThan(TURN_MAX_RATE * 0.25 + 1e-9);
  });
});

describe("v1.10.2 — velocità visualizzata", () => {
  it("da fermo a movimento: sale gradualmente verso la velocità reale, senza superarla", () => {
    let v = 0;
    const history: number[] = [];
    for (let k = 0; k < 60; k++) {
      v = stepSpeed(v, 2, 16);
      history.push(v);
    }
    expect(history[0]).toBeGreaterThan(0);
    expect(history[0]).toBeLessThan(0.5); // il primo passo non salta alla velocità piena
    for (let k = 1; k < history.length; k++) expect(history[k]).toBeGreaterThanOrEqual(history[k - 1]);
    expect(history[history.length - 1]).toBeLessThanOrEqual(2);
    expect(history[history.length - 1]).toBeGreaterThan(1.95);
  });

  it("da movimento a fermo: scende gradualmente fino a zero e non va mai sotto", () => {
    let v = 2;
    let prev = v;
    for (let k = 0; k < 120; k++) {
      v = stepSpeed(v, 0, 16);
      expect(v).toBeLessThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(0);
      prev = v;
    }
    expect(v).toBe(0);
  });

  it("frena un po' più in fretta di quanto accelera", () => {
    const up = stepSpeed(0, 1, 50);
    const down = 1 - stepSpeed(1, 0, 50);
    expect(down).toBeGreaterThan(up);
  });
});

describe("v1.10.2 — stato visivo", () => {
  const FWD = (m: ReturnType<typeof createVisualMotion>, dx: number, dy: number, dt = 16, travelled = 0.01) => stepVisualMotion(m, dx, dy, travelled, dt, 1, 0.12);

  it("la prima direzione si prende subito (come prima della v1.10.2)", () => {
    const m = createVisualMotion();
    FWD(m, 0.2, 0);
    expect(m.hasYaw).toBe(true);
    expect(m.yaw).toBeCloseTo(0, 12);
  });

  it("da ferma mantiene l'orientamento e non ruota", () => {
    const m = createVisualMotion();
    FWD(m, 0, 0.2);
    const yaw = m.yaw;
    for (let k = 0; k < 30; k++) FWD(m, 0, 0, 16, 0);
    expect(m.yaw).toBe(yaw);
    expect(m.turnRate).toBe(0);
    expect(m.roll).toBe(0);
  });

  it("la velocità visualizzata va a zero dopo l'arresto e il corpo si raddrizza", () => {
    const m = createVisualMotion();
    for (let k = 0; k < 40; k++) FWD(m, 0.2, 0, 16, 0.02);
    expect(m.visSpeed).toBeGreaterThan(0.1);
    for (let k = 0; k < 120; k++) FWD(m, 0, 0, 16, 0);
    expect(m.visSpeed).toBe(0);
    expect(Math.abs(m.pitch)).toBeLessThan(1e-3);
    expect(Math.abs(m.roll)).toBeLessThan(1e-3);
  });

  it("in curva si inclina verso l'interno, con un limite; dritta, non si inclina", () => {
    const left = createVisualMotion();
    for (let k = 0; k < 30; k++) FWD(left, 1, 0, 16, 0.03); // verso est
    expect(left.roll).toBe(0);
    for (let k = 0; k < 40; k++) FWD(left, 0, 1, 16, 0.03); // verso sud: angolo che cresce
    const rolledLeft = left.roll;
    const right = createVisualMotion();
    for (let k = 0; k < 30; k++) FWD(right, 1, 0, 16, 0.03);
    for (let k = 0; k < 40; k++) FWD(right, 0, -1, 16, 0.03); // verso nord: angolo che cala
    const rolledRight = right.roll;
    expect(Math.abs(rolledLeft)).toBeGreaterThan(0);
    expect(rolledLeft * rolledRight).toBeLessThan(0); // versi opposti
    expect(Math.abs(rolledLeft)).toBeLessThanOrEqual(MAX_ROLL + 1e-9);
    expect(Math.abs(rolledRight)).toBeLessThanOrEqual(MAX_ROLL + 1e-9);
  });

  it("accelerando il muso si alza, frenando si abbassa; sempre entro il limite", () => {
    const m = createVisualMotion();
    FWD(m, 1, 0, 16, 0);
    let minPitch = 0;
    for (let k = 0; k < 10; k++) {
      FWD(m, 1, 0, 16, 0.04);
      minPitch = Math.min(minPitch, m.pitch);
    }
    expect(minPitch).toBeLessThan(0); // muso su
    let maxPitch = 0;
    for (let k = 0; k < 20; k++) {
      FWD(m, 0, 0, 16, 0);
      maxPitch = Math.max(maxPitch, m.pitch);
    }
    expect(maxPitch).toBeGreaterThan(0); // muso giù
    expect(minPitch).toBeGreaterThanOrEqual(-MAX_PITCH - 1e-9);
    expect(maxPitch).toBeLessThanOrEqual(MAX_PITCH + 1e-9);
  });

  it("dopo una sospensione (dt enorme) non esplode", () => {
    const m = createVisualMotion();
    FWD(m, 1, 0, 16, 0.02);
    stepVisualMotion(m, 0, 1, 50, 60_000, 1, 0.12);
    expect(Number.isFinite(m.yaw) && Number.isFinite(m.visSpeed) && Number.isFinite(m.roll) && Number.isFinite(m.pitch)).toBe(true);
    expect(Math.abs(m.roll)).toBeLessThanOrEqual(MAX_ROLL + 1e-9);
  });

  it("dt nullo non cambia lo stato", () => {
    const m = createVisualMotion();
    FWD(m, 1, 0);
    const copy = { ...m };
    stepVisualMotion(m, 0, 1, 0.1, 0, 1, 0.12);
    expect(m).toEqual(copy);
  });
});

describe("v1.10.2 — convenzione sinistra/destra verificata con la proiezione reale", () => {
  it("guardando a est, il sud è a sinistra nella vista 3D (quindi un angolo che cresce è una svolta a sinistra)", () => {
    for (const [x, y] of [[100, 256], [300, 100], [450, 400]]) {
      const p = projectToSphere(x, y, 512, 512, 5);
      const e = projectToSphere(x + 0.5, y, 512, 512, 5);
      const s = projectToSphere(x, y + 0.5, 512, 512, 5);
      const n = new THREE.Vector3(p.normalX, p.normalY, p.normalZ);
      const te = new THREE.Vector3(e.x - p.x, e.y - p.y, e.z - p.z);
      te.addScaledVector(n, -te.dot(n)).normalize();
      const ts = new THREE.Vector3(s.x - p.x, s.y - p.y, s.z - p.z);
      ts.addScaledVector(n, -ts.dot(n)).normalize();
      const right = new THREE.Vector3().crossVectors(n, te);
      expect(ts.dot(right) < 0).toBe(GRID_YAW_INCREASING_IS_LEFT);
    }
  });
});

describe("v1.10.2 — nelle creature disegnate", () => {
  const CAP = 8;
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
      detail: 1,
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
  const axis = (refs: SceneRefs, local: [number, number, number]) => {
    const m = new THREE.Matrix4();
    refs.bodyMesh.getMatrixAt(0, m);
    return new THREE.Vector3(...local).transformDirection(m);
  };
  /** Cammina `n` passi da (x, y) in direzione (dx, dy), un aggiornamento da 16 ms ciascuno. */
  function walk(refs: SceneRefs, from: { x: number; y: number }, dx: number, dy: number, n: number, step = 0.16) {
    const forwards: THREE.Vector3[] = [];
    for (let k = 0; k < n; k++) {
      from.x += dx * step;
      from.y += dy * step;
      updateCreatureInstances(refs, frameAt(from.x, from.y), null, null, 16);
      forwards.push(axis(refs, [0, 0, 1]));
    }
    return forwards;
  }

  it("un angolo di 90° si fa in più aggiornamenti, ognuno entro il tetto di rotazione", () => {
    const refs = refsFor();
    const pos = { x: 200, y: 256 };
    walk(refs, pos, 1, 0, 20); // verso est
    const east = axis(refs, [0, 0, 1]);
    const turn = walk(refs, pos, 0, 1, 40); // poi verso sud
    let prev = east;
    let steps = 0;
    for (const f of turn) {
      expect(prev.angleTo(f)).toBeLessThanOrEqual(TURN_MAX_RATE * 0.016 + 0.02);
      if (prev.angleTo(f) > 1e-4) steps++;
      prev = f;
    }
    expect(steps).toBeGreaterThan(8); // gradualmente, non in uno o due passi
    // alla fine è girata verso il sud (la direzione in cui si muove)
    const south = (() => {
      const refs2 = refsFor();
      const p2 = { x: 200, y: 256 };
      return walk(refs2, p2, 0, 1, 3)[2];
    })();
    expect(prev.angleTo(south)).toBeLessThan(0.1);
  });

  it("ferma, non ruota", () => {
    const refs = refsFor();
    const pos = { x: 200, y: 256 };
    walk(refs, pos, 1, 0, 10);
    const before = axis(refs, [0, 0, 1]);
    for (let k = 0; k < 30; k++) updateCreatureInstances(refs, frameAt(pos.x, pos.y), null, null, 16);
    expect(axis(refs, [0, 0, 1]).angleTo(before)).toBeLessThan(0.15); // al massimo si raddrizza dall'inclinazione
  });

  it("in curva a sinistra il corpo si inclina verso sinistra; a destra, verso destra", () => {
    const tilt = (turnDy: number) => {
      const refs = refsFor();
      const pos = { x: 200, y: 256 };
      walk(refs, pos, 1, 0, 25, 0.5); // verso est, a buon passo
      walk(refs, pos, 0, turnDy, 6, 0.5);
      const p = projectToSphere(pos.x, pos.y, 512, 512, 5);
      const e = projectToSphere(pos.x + 0.5, pos.y, 512, 512, 5);
      const n = new THREE.Vector3(p.normalX, p.normalY, p.normalZ);
      const t = new THREE.Vector3(e.x - p.x, e.y - p.y, e.z - p.z);
      t.addScaledVector(n, -t.dot(n)).normalize();
      const right = new THREE.Vector3().crossVectors(n, t);
      return axis(refs, [0, 1, 0]).dot(right);
    };
    expect(tilt(1)).toBeLessThan(-1e-3); // sud = sinistra: l'alto del corpo tende a sinistra
    expect(tilt(-1)).toBeGreaterThan(1e-3);
  });

  it("non cambia nessun dato del frame", () => {
    const refs = refsFor();
    const f = frameAt(100, 100);
    const x = Array.from(f.organismsX);
    walk(refs, { x: 100, y: 100 }, 1, 0, 5);
    updateCreatureInstances(refs, f, null, null, 16);
    expect(Array.from(f.organismsX)).toEqual(x);
  });

  it("la velocità visiva è nel tracciato, ed è zero per chi non si muove", () => {
    const refs = refsFor();
    updateCreatureInstances(refs, frameAt(100, 100), null, null, 16);
    updateCreatureInstances(refs, frameAt(100, 100), null, null, 16);
    expect(refs.creatureTrack.get(1)!.motion.visSpeed).toBe(0);
    walk(refs, { x: 100, y: 100 }, 1, 0, 15);
    expect(refs.creatureTrack.get(1)!.motion.visSpeed).toBeGreaterThan(0);
    void SPEED_EPSILON;
  });
});
