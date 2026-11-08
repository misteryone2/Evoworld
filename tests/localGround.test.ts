import { describe, it, expect } from "vitest";
import {
  hash2,
  valueNoise,
  createLocalGround,
  groundContains,
  groundElevation,
  groundDisplacement,
  groundRadius,
  groundTerrain,
  groundChannel,
  isLocalViewport,
  localPatchRadiusCells,
  LOCAL_LIFT,
  MICRO_RELIEF,
} from "../lib/localGround";
import { elevationDisplacement } from "../lib/sphereProjection";
import { makeVf } from "./helpers_vf";

const W = 512;
const H = 512;

describe("v1.8.0 — terreno locale (parte pura)", () => {
  it("hash2 è deterministico, in [0,1) e cambia con coordinate e sale", () => {
    expect(hash2(3, 9, 1)).toBe(hash2(3, 9, 1));
    expect(hash2(3, 9, 1)).not.toBe(hash2(3, 9, 2));
    expect(hash2(3, 9, 1)).not.toBe(hash2(4, 9, 1));
    for (let i = 0; i < 500; i++) {
      const h = hash2(i, i * 7 - 300, 5);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it("hash2 è ben distribuito (media vicina a 0,5)", () => {
    let sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) sum += hash2(i % 64, Math.floor(i / 64), 3);
    expect(sum / n).toBeGreaterThan(0.45);
    expect(sum / n).toBeLessThan(0.55);
  });

  it("valueNoise resta in [0,1] ed è continuo", () => {
    let prev = valueNoise(0, 0.5);
    for (let i = 1; i < 400; i++) {
      const v = valueNoise(i * 0.01, 0.5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(Math.abs(v - prev)).toBeLessThan(0.02);
      prev = v;
    }
  });

  it("groundContains: dentro, fuori, margine e mondo che si richiude", () => {
    const g = createLocalGround(makeVf({ originX: 100, originY: 200, cells: 64 }), W, H);
    expect(groundContains(g, 120, 220)).toBe(true);
    expect(groundContains(g, 99, 220)).toBe(false);
    expect(groundContains(g, 164.5, 220)).toBe(false);
    expect(groundContains(g, 101, 220, 2)).toBe(false);
    expect(groundContains(g, 102.5, 220, 2)).toBe(true);
    // area a cavallo del bordo del mondo: origine -20, copre da -20 a 44, cioè anche 492..512
    const wrap = createLocalGround(makeVf({ originX: -20, originY: 10, cells: 64 }), W, H);
    expect(groundContains(wrap, 500, 30)).toBe(true);
    expect(groundContains(wrap, 10, 30)).toBe(true);
    expect(groundContains(wrap, 300, 30)).toBe(false);
  });

  it("i campioni di terreno e quota arrivano dal canale giusto (e fuori area valgono il bordo)", () => {
    const vf = makeVf({ originX: 100, originY: 200, cells: 32, elevation: (x) => x / 31, terrain: (x) => (x < 16 ? 0 : 1) });
    const g = createLocalGround(vf, W, H);
    expect(groundTerrain(g, 105, 210)).toBe(0);
    expect(groundTerrain(g, 125, 210)).toBe(1);
    expect(groundElevation(g, 100.5, 210)).toBeCloseTo(0, 5);
    expect(groundElevation(g, 131.5, 210)).toBeCloseTo(1, 5);
    expect(groundElevation(g, 116.5, 210)).toBeCloseTo(16 / 31, 2);
    expect(groundChannel(g, vf.elevation, 90, 210)).toBeCloseTo(0, 5); // fuori: bordo
    expect(groundChannel(g, vf.elevation, 160, 210)).toBeCloseTo(1, 5);
  });

  it("displacement = rilievo + asperità piccole + sollevamento; sul mare niente asperità", () => {
    const land = createLocalGround(makeVf({ elevation: 0.6, terrain: 1 }), W, H);
    const base = elevationDisplacement(0.6, false);
    for (let i = 0; i < 100; i++) {
      const d = groundDisplacement(land, 110 + i * 0.37, 220 + i * 0.21);
      expect(Math.abs(d - base - LOCAL_LIFT)).toBeLessThanOrEqual(MICRO_RELIEF * 1.6 * 1.1 + 1e-9);
    }
    const sea = createLocalGround(makeVf({ elevation: 0.2, terrain: 0 }), W, H);
    expect(groundDisplacement(sea, 110.3, 220.7)).toBeCloseTo(elevationDisplacement(0.2, true) + LOCAL_LIFT, 9);
    expect(groundRadius(sea, 110, 220, 5)).toBeCloseTo(5 + elevationDisplacement(0.2, true) + LOCAL_LIFT, 9);
  });

  it("l'altezza del suolo è deterministica (stesso punto, stesso valore)", () => {
    const a = createLocalGround(makeVf(), W, H);
    const b = createLocalGround(makeVf(), W, H);
    expect(groundDisplacement(a, 123.4, 234.5)).toBe(groundDisplacement(b, 123.4, 234.5));
  });

  it("isLocalViewport distingue un'area piccola dal pianeta intero", () => {
    expect(isLocalViewport({ cellsWidth: 128 }, 512)).toBe(true);
    expect(isLocalViewport({ cellsWidth: 512 }, 512)).toBe(false);
    expect(isLocalViewport({ cellsWidth: 480 }, 512)).toBe(false);
  });

  it("localPatchRadiusCells copre la distanza richiesta ma resta tra 20 e 64", () => {
    // mondo 512: una cella è 2π*5/512 ≈ 0,0614 unità; 3 unità ≈ 49 celle
    expect(localPatchRadiusCells(512, 5, 3)).toBe(49);
    expect(localPatchRadiusCells(4096, 5, 3)).toBe(64); // celle minuscole: tetto
    expect(localPatchRadiusCells(64, 5, 3)).toBe(20); // celle enormi: minimo
  });
});
