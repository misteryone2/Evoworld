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
  MIN_ELEVATION,
  MAX_ELEVATION,
  type Vec3,
} from "../lib/followCamera";
import { projectToSphere } from "../lib/sphereProjection";

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// Creatura sul "polo" +Y, che guarda verso +Z: normale (0,1,0), avanti (0,0,1), lato sinistro = normale × avanti = (1,0,0).
const base = { point: [0, 5, 0] as Vec3, normal: [0, 1, 0] as Vec3, forward: [0, 0, 1] as Vec3, scale: 0.12, yaw: 0, pitch: 0 };

describe("v1.7.0 — camera in terza persona (matematica pura)", () => {
  it("con yaw 0 la camera sta dietro e sopra la creatura", () => {
    const pose = computeFollowPose(base);
    const offset = sub(pose.position, base.point);
    expect(dot(offset, base.forward)).toBeLessThan(0); // dietro
    expect(dot(offset, base.normal)).toBeGreaterThan(0); // sopra
    expect(Math.abs(offset[0])).toBeLessThan(1e-9); // né a destra né a sinistra
  });

  it("guarda un punto appena davanti e sopra la creatura, e 'su' è la normale", () => {
    const pose = computeFollowPose(base);
    const t = sub(pose.target, base.point);
    expect(dot(t, base.forward)).toBeGreaterThan(0);
    expect(dot(t, base.normal)).toBeGreaterThan(0);
    expect(pose.up).toEqual(base.normal);
  });

  it("la distanza dalla creatura è quella richiesta, qualunque yaw e pitch", () => {
    for (const yaw of [0, 0.7, Math.PI / 2, Math.PI, -2]) {
      for (const pitch of [-0.2, 0, 0.5]) {
        const pose = computeFollowPose({ ...base, yaw, pitch });
        expect(dist(pose.position, base.point)).toBeCloseTo(followDistance(base.scale), 9);
      }
    }
  });

  it("con yaw π la camera passa davanti alla creatura; con yaw π/2 va su un lato", () => {
    const front = sub(computeFollowPose({ ...base, yaw: Math.PI }).position, base.point);
    expect(dot(front, base.forward)).toBeGreaterThan(0);
    const side = sub(computeFollowPose({ ...base, yaw: Math.PI / 2 }).position, base.point);
    expect(Math.abs(dot(side, base.forward))).toBeLessThan(1e-9);
    expect(Math.abs(side[0])).toBeGreaterThan(0.1);
  });

  it("la distanza è limitata sia per creature minuscole sia per quelle enormi, e mai NaN", () => {
    expect(followDistance(0.001)).toBe(MIN_FOLLOW_DISTANCE);
    expect(followDistance(50)).toBe(MAX_FOLLOW_DISTANCE);
    expect(followDistance(NaN)).toBe(MIN_FOLLOW_DISTANCE);
    const mid = followDistance(0.12);
    expect(mid).toBeGreaterThanOrEqual(MIN_FOLLOW_DISTANCE);
    expect(mid).toBeLessThanOrEqual(MAX_FOLLOW_DISTANCE);
  });

  it("l'inclinazione resta nei limiti", () => {
    expect(followElevation(-10)).toBe(MIN_ELEVATION);
    expect(followElevation(10)).toBe(MAX_ELEVATION);
    expect(followElevation(NaN)).toBeGreaterThan(MIN_ELEVATION);
  });

  it("clampCameraRadius spinge fuori una camera sotto la superficie e lascia stare le altre", () => {
    const inside: Vec3 = [0, 3, 0];
    const out = clampCameraRadius(inside, 5);
    expect(Math.hypot(...out)).toBeCloseTo(5, 9);
    expect(out[1]).toBeGreaterThan(0); // stessa direzione
    const fine: Vec3 = [0, 6, 0];
    expect(clampCameraRadius(fine, 5)).toBe(fine);
    expect(clampCameraRadius([0, 0, 0], 5)).toEqual([0, 0, 0]);
  });

  it("il margine dal terreno cresce con la creatura", () => {
    expect(cameraClearance(0.3)).toBeGreaterThan(cameraClearance(0.05));
  });

  it("dampingAlpha: 0 senza tempo, tra 0 e 1 altrimenti, crescente con dt", () => {
    expect(dampingAlpha(0, 140)).toBe(0);
    expect(dampingAlpha(-5, 140)).toBe(0);
    const a16 = dampingAlpha(16, 140);
    const a100 = dampingAlpha(100, 140);
    expect(a16).toBeGreaterThan(0);
    expect(a100).toBeGreaterThan(a16);
    expect(a100).toBeLessThan(1);
    expect(dampingAlpha(10, 0)).toBe(1);
  });

  it("easeAngleToZero prende la strada più corta e arriva a zero", () => {
    expect(easeAngleToZero(0.5, 0.5)).toBeCloseTo(0.25, 9);
    // 2π - 0.2 equivale a -0.2: deve avvicinarsi a zero da sotto, non fare quasi un giro
    expect(easeAngleToZero(2 * Math.PI - 0.2, 0.5)).toBeCloseTo(-0.1, 9);
    expect(easeAngleToZero(0.5, 1)).toBe(0);
    expect(easeAngleToZero(NaN, 0.5)).toBe(0);
  });

  it("directionToGrid è l'inverso di projectToSphere", () => {
    const W = 512;
    const H = 256;
    for (const [x, y] of [[10, 20], [256, 128], [400.5, 200.25], [1, 255]]) {
      const p = projectToSphere(x, y, W, H, 5.3);
      const g = directionToGrid([p.x, p.y, p.z], W, H);
      expect(g.x).toBeCloseTo(x, 4);
      expect(g.y).toBeCloseTo(y, 4);
    }
  });
});
