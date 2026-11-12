import { describe, it, expect } from "vitest";
import {
  computeFollowPose,
  followDistance,
  followElevation,
  clampCameraRadius,
  cameraClearance,
  dampingAlpha,
  easeAngleToZero,
  directionToGrid,
  MIN_FOLLOW_DISTANCE,
  MAX_FOLLOW_DISTANCE,
  BASE_ELEVATION,
  MIN_ELEVATION,
  MAX_ELEVATION,
} from "../lib/followCamera";
import { nextHeading, wrappedDelta, headingBlendForDt, HEADING_MIN_MOVEMENT } from "../lib/creatureHeading";
import { projectToSphere } from "../lib/sphereProjection";

/**
 * QA telecamera e ambiente (v1.10.6–v1.10.10) — file di test INDIPENDENTE.
 * Non tocca i test del piano "Natural Motion & Animation" (v1.10.5, di Claude).
 *
 * Copre le funzioni PURE che governano camera libera, movimento fluido, pan e
 * coordinate toroidali. Ciò che richiede WebGL (resa, compositing, nuvole) è
 * coperto dalla checklist manuale in docs/vibe-camera-environment-qa.md.
 */

const dist3 = (a: [number, number, number], b: [number, number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dot3 = (a: [number, number, number], b: [number, number, number]) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe("QA — distanza della camera dalla superficie (followCamera)", () => {
  it("scala la distanza con la grandezza dell'osservato", () => {
    expect(followDistance(0.1)).toBeCloseTo(0.7, 5);
  });

  it("non scende mai sotto la distanza minima", () => {
    expect(followDistance(0.01)).toBe(MIN_FOLLOW_DISTANCE);
    expect(followDistance(0)).toBe(MIN_FOLLOW_DISTANCE);
  });

  it("non supera mai la distanza massima (la vista libera usa proprio il cap 2.2)", () => {
    expect(followDistance(0.55)).toBe(MAX_FOLLOW_DISTANCE);
    expect(followDistance(5)).toBe(MAX_FOLLOW_DISTANCE);
  });

  it("è robusta a input non finiti", () => {
    expect(followDistance(Number.NaN)).toBe(MIN_FOLLOW_DISTANCE);
  });
});

describe("QA — inclinazione della camera", () => {
  it("usa l'inclinazione di base a pitch zero", () => {
    expect(followElevation(0)).toBe(BASE_ELEVATION);
  });

  it("resta negli intervalli che non entrano nel terreno né guardano dall'alto", () => {
    expect(followElevation(-10)).toBe(MIN_ELEVATION);
    expect(followElevation(10)).toBe(MAX_ELEVATION);
  });
});

describe("QA — posa della camera (computeFollowPose)", () => {
  // Scena di riferimento: punto sull'equatore "nord" del pianeta, normale uscente = +Y, marcia verso -Z.
  const point: [number, number, number] = [0, 10, 0];
  const normal: [number, number, number] = [0, 1, 0];
  const forward: [number, number, number] = [0, 0, -1];

  it("a yaw 0 la camera sta DIETRO il punto osservato, lungo -forward", () => {
    const pose = computeFollowPose({ point, normal, forward, scale: 0.55, yaw: 0, pitch: 0 });
    const offset: [number, number, number] = [
      pose.position[0] - point[0],
      pose.position[1] - point[1],
      pose.position[2] - point[2],
    ];
    expect(dot3(offset, forward)).toBeLessThan(0); // dietro
    expect(dist3(pose.position, point)).toBeCloseTo(followDistance(0.55), 5);
  });

  it("la camera sta sopra la superficie (mai sotto l'orizzonte del punto)", () => {
    const pose = computeFollowPose({ point, normal, forward, scale: 0.55, yaw: 0, pitch: 0 });
    expect(dot3([pose.position[0] - point[0], pose.position[1] - point[1], pose.position[2] - point[2]], normal)).toBeGreaterThan(0);
  });

  it("il punto guardato è sollevato dalla superficie lungo la normale (con la scala 0.55 della vista libera resta vicino al suolo)", () => {
    const pose = computeFollowPose({ point, normal, forward, scale: 0.55, yaw: 0, pitch: 0 });
    expect(dot3([pose.target[0] - point[0], pose.target[1] - point[1], pose.target[2] - point[2]], normal)).toBeCloseTo(0.55 * 1.1, 5);
  });

  it("l'asse 'up' della camera è la normale della superficie", () => {
    const pose = computeFollowPose({ point, normal, forward, scale: 0.55, yaw: 0, pitch: 0 });
    expect(pose.up).toEqual(normal);
  });

  it("yaw π porta la camera DAVANTI al punto osservato", () => {
    const pose = computeFollowPose({ point, normal, forward, scale: 0.55, yaw: Math.PI, pitch: 0 });
    const offset: [number, number, number] = [
      pose.position[0] - point[0],
      pose.position[1] - point[1],
      pose.position[2] - point[2],
    ];
    expect(dot3(offset, forward)).toBeGreaterThan(0);
  });
});

describe("QA — anti-compenetrazione con la superficie", () => {
  it("clampCameraRadius spinge fuori la camera che finisce sotto il raggio minimo", () => {
    const inside: [number, number, number] = [0.3, 0.4, 0.5]; // r ≈ 0.707
    const minRadius = 1.2;
    const out = clampCameraRadius(inside, minRadius);
    expect(Math.hypot(...out)).toBeCloseTo(minRadius, 6);
    // stessa direzione, solo raggio corretto
    expect(out[0] / Math.hypot(...out)).toBeCloseTo(inside[0] / Math.hypot(...inside), 6);
  });

  it("lascia intatta una camera già fuori dal terreno", () => {
    const outside: [number, number, number] = [0, 3, 0];
    expect(clampCameraRadius(outside, 1.2)).toEqual(outside);
  });

  it("il margine anti-collina cresce con la scala ed è sempre positivo", () => {
    expect(cameraClearance(0)).toBeGreaterThan(0);
    expect(cameraClearance(0.55)).toBeGreaterThan(cameraClearance(0.1));
  });
});

describe("QA — smorzamento indipendente dal frame rate", () => {
  it("dt zero non muove nulla (primo frame, scheda appena ripresa)", () => {
    expect(dampingAlpha(0, 140)).toBe(0);
    expect(dampingAlpha(-5, 140)).toBe(0);
  });

  it("60 passi da 16 ms ≈ 4 passi da 240 ms ≈ 1 passo da 960 ms (stesso tempo totale)", () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = 1 - (1 - a) * (1 - dampingAlpha(16, 140));
    let b = 0;
    for (let i = 0; i < 4; i++) b = 1 - (1 - b) * (1 - dampingAlpha(240, 140));
    const c = dampingAlpha(960, 140);
    expect(a).toBeCloseTo(c, 2);
    expect(b).toBeCloseTo(c, 2);
    expect(a).toBeGreaterThan(0.99); // dopo ~1 s la camera ha praticamente raggiunto la posa
  });
});

describe("QA — ritorno dietro il punto osservato (recenter)", () => {
  it("alpha 1 azzera qualsiasi angolo", () => {
    expect(easeAngleToZero(3.0, 1)).toBe(0);
    expect(easeAngleToZero(-2.5, 1)).toBe(0);
  });

  it("avvicina a zero con percorso breve anche oltre ±π", () => {
    // π + 0.1 wrap → -π + 0.1: avvicinarsi a zero significa crescere verso -0 (valore assoluto che cala dal wrap)
    const next = easeAngleToZero(Math.PI + 0.1, 0.5);
    expect(Math.abs(next)).toBeLessThan(Math.PI);
  });

  it("input non finiti → 0", () => {
    expect(easeAngleToZero(Number.NaN, 0.5)).toBe(0);
  });
});

describe("QA — coordinate toroidali (wrappedDelta)", () => {
  const W = 12;

  it("scelta il percorso più breve attraverso il confine", () => {
    expect(wrappedDelta(2, 11, W)).toBe(-3); // da 2 a 11 passando per lo zero
    expect(wrappedDelta(11, 2, W)).toBe(3);
  });

  it("delta nullo sulla stessa cella", () => {
    expect(wrappedDelta(5, 5, W)).toBe(0);
  });

  it("resta nel range (-size/2, size/2]", () => {
    expect(wrappedDelta(0, W / 2, W)).toBe(W / 2);
    for (let to = 0; to < W * 3; to++) {
      const d = wrappedDelta(4, to, W);
      expect(d).toBeLessThanOrEqual(W / 2);
      expect(d).toBeGreaterThan(-W / 2);
    }
  });
});

describe("QA — orientamento durante gli spostamenti (nextHeading)", () => {
  it("un movimento sotto la soglia non cambia la direzione (pausa rivolta dove andava)", () => {
    const prev = { hx: 1, hy: 0 };
    expect(nextHeading(prev, 0, 0, 1)).toBe(prev);
    expect(nextHeading(prev, HEADING_MIN_MOVEMENT / 10, 0, 1)).toBe(prev);
  });

  it("blend 1 adotta subito la nuova direzione (pan: la camera guarda dove si va)", () => {
    expect(nextHeading({ hx: 1, hy: 0 }, 0, 1, 1)).toEqual({ hx: 0, hy: 1 });
  });

  it("mezza virata con blend 0.5", () => {
    const h = nextHeading({ hx: 1, hy: 0 }, 1, 1, 0.5)!;
    expect(h.hx).toBeCloseTo(h.hy, 6);
  });

  it("inversione a U con blend pieno prende la nuova direzione senza NaN", () => {
    expect(nextHeading({ hx: 1, hy: 0 }, -1, 0, 1)).toEqual({ hx: -1, hy: 0 });
  });

  it("senza direzione precedente e senza movimento resta null", () => {
    expect(nextHeading(null, 0, 0, 1)).toBeNull();
  });

  it("il risultato è sempre un vettore unitario", () => {
    const h = nextHeading({ hx: 0.6, hy: 0.8 }, 3, -2, 0.3)!;
    expect(Math.hypot(h.hx, h.hy)).toBeCloseTo(1, 6);
  });
});

describe("QA — proiezione sferica ↔ griglia (coerenza pan/superficie)", () => {
  const W = 96;
  const H = 48;

  it("directionToGrid è l'inversa di projectToSphere (roundtrip su vari punti)", () => {
    for (const [x, y] of [[10, 12], [37.2, 18.7], [72, 30], [95, 24]] as const) {
      const p = projectToSphere(x, y, W, H, 1);
      const g = directionToGrid([p.x, p.y, p.z], W, H);
      expect(g.x).toBeCloseTo(x, 1);
      expect(g.y).toBeCloseTo(y, 1);
    }
  });

  it("la normale è un vettore unitario allineato con la posizione", () => {
    const p = projectToSphere(30, 20, W, H, 5);
    const n = Math.hypot(p.normalX, p.normalY, p.normalZ);
    expect(n).toBeCloseTo(1, 5);
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(5, 5);
  });
});

describe("QA — peso della rotazione indipendente dal frame rate (headingBlendForDt)", () => {
  it("dt zero → nessuna rotazione", () => {
    expect(headingBlendForDt(0)).toBe(0);
  });

  it("stesso tempo totale, frame rate diverso, stessa rotazione complessiva", () => {
    const oneStep = headingBlendForDt(200);
    let stepped = 0;
    for (let i = 0; i < 10; i++) stepped = 1 - (1 - stepped) * (1 - headingBlendForDt(20));
    expect(stepped).toBeCloseTo(oneStep, 2);
  });
});
