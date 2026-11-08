import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createLocalScene, createGrassTuftGeometry, TERRAIN_SKIRT } from "../components/simulation/localScene";
import { QUALITY_PROFILES } from "../lib/qualityProfile";
import { groundRadius } from "../lib/localGround";
import { projectToSphere } from "../lib/sphereProjection";
import { makeVf } from "./helpers_vf";

const R = 5;
const W = 512;
const H = 512;

describe("v1.8.0 — scena locale (terreno + flora)", () => {
  it("parte invisibile, senza terreno e senza piante", () => {
    const s = createLocalScene(QUALITY_PROFILES.alto, R);
    expect(s.group.visible).toBe(false);
    expect(s.ground).toBeNull();
    expect(s.stats().plants).toBe(0);
  });

  it("update: i vertici del terreno sono finiti e stanno vicini alla sfera del pianeta", () => {
    const s = createLocalScene(QUALITY_PROFILES.medio, R);
    s.update(makeVf({ terrain: 1, elevation: 0.5 }), W, H, 132, 232);
    const terrain = s.group.children[0] as THREE.Mesh;
    const pos = terrain.geometry.attributes.position as THREE.BufferAttribute;
    expect(pos.count).toBe(65 * 65);
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThan(R - 0.5);
      expect(r).toBeLessThan(R + 0.7);
    }
  });

  it("l'anello esterno è abbassato di TERRAIN_SKIRT rispetto ai vertici interni vicini", () => {
    const s = createLocalScene(QUALITY_PROFILES.medio, R);
    const vf = makeVf({ terrain: 1, elevation: 0.5, vegetation: 0 });
    s.update(vf, W, H, 132, 232);
    const terrain = s.group.children[0] as THREE.Mesh;
    const pos = terrain.geometry.attributes.position as THREE.BufferAttribute;
    const radius = (i: number, j: number) => {
      const k = j * 65 + i;
      return Math.hypot(pos.getX(k), pos.getY(k), pos.getZ(k));
    };
    // lungo il bordo sinistro: confronto col vertice accanto
    expect(radius(1, 30) - radius(0, 30)).toBeGreaterThan(TERRAIN_SKRT_MIN());
    function TERRAIN_SKRT_MIN() {
      return TERRAIN_SKIRT * 0.5;
    }
  });

  it("i colori dei vertici sono in [0,1]", () => {
    const s = createLocalScene(QUALITY_PROFILES.basso, R);
    s.update(makeVf({ terrain: 4 }), W, H, 132, 232);
    const colors = (s.group.children[0] as THREE.Mesh).geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < colors.array.length; i++) {
      expect(colors.array[i]).toBeGreaterThanOrEqual(0);
      expect(colors.array[i]).toBeLessThanOrEqual(1);
    }
  });

  it("la flora riempie le istanze entro i tetti del profilo e le mesh non vengono scartate dal frustum", () => {
    for (const level of ["basso", "medio", "alto"] as const) {
      const profile = QUALITY_PROFILES[level];
      const s = createLocalScene(profile, R);
      s.update(makeVf({ terrain: 4, vegetation: 0.9, originY: 230 }), W, H, 132, 262);
      const st = s.stats();
      expect(st.plants).toBeGreaterThan(0);
      expect(st.plants).toBeLessThanOrEqual(profile.floraMax + 3);
      expect(st.instances).toBeGreaterThanOrEqual(st.plants);
      for (const child of s.group.children) expect(child.frustumCulled).toBe(false);
      for (const child of s.group.children) {
        if (child instanceof THREE.InstancedMesh) expect(child.count).toBeLessThanOrEqual(child.instanceMatrix.count);
      }
    }
  });

  it("le matrici delle piante sono finite e le piante poggiano sul suolo", () => {
    const s = createLocalScene(QUALITY_PROFILES.medio, R);
    const vf = makeVf({ terrain: 4, vegetation: 0.9, originY: 230, elevation: 0.55 });
    s.update(vf, W, H, 132, 262);
    const ground = s.ground!;
    const meshes = s.group.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let checked = 0;
    for (const mesh of meshes) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        for (const e of m.elements) expect(Number.isFinite(e)).toBe(true);
        p.setFromMatrixPosition(m);
        const r = p.length();
        // nessuna parte sta sotto il suolo di molto, né in aria a distanza assurda
        expect(r).toBeGreaterThan(R - 0.3);
        expect(r).toBeLessThan(R + 5); // v1.9.0 — una conifera adulta arriva a circa 4 unità
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(groundRadius(ground, 132, 262, R)).toBeGreaterThan(R);
  });

  it("un profilo senza flora (floraMax 0) non scrive istanze; il terreno sì", () => {
    const s = createLocalScene({ ...QUALITY_PROFILES.medio, floraMax: 0 }, R);
    s.update(makeVf({ terrain: 4, vegetation: 0.9 }), W, H, 132, 232);
    expect(s.stats().plants).toBe(0);
    expect(s.stats().instances).toBe(0);
    expect(s.stats().terrainVertices).toBe(65 * 65);
  });

  it("un profilo senza terreno locale (segmenti 0) non rompe l'update", () => {
    const s = createLocalScene(QUALITY_PROFILES["2d"], R);
    expect(() => s.update(makeVf(), W, H, 132, 232)).not.toThrow();
    expect(s.stats().terrainVertices).toBe(0);
  });

  it("clear() dimentica il terreno e toglie le piante; setVisible lo mostra", () => {
    const s = createLocalScene(QUALITY_PROFILES.medio, R);
    s.setVisible(true);
    expect(s.group.visible).toBe(true);
    s.update(makeVf({ terrain: 4, vegetation: 0.9, originY: 230 }), W, H, 132, 262);
    expect(s.ground).not.toBeNull();
    s.clear();
    expect(s.ground).toBeNull();
    expect(s.stats().plants).toBe(0);
    for (const child of s.group.children) if (child instanceof THREE.InstancedMesh) expect(child.count).toBe(0);
  });

  it("aggiornare due volte con gli stessi dati dà lo stesso risultato (nessuna deriva)", () => {
    const s = createLocalScene(QUALITY_PROFILES.medio, R);
    const vf = makeVf({ terrain: 4, vegetation: 0.8, originY: 230 });
    s.update(vf, W, H, 132, 262);
    const a = s.stats();
    s.update(vf, W, H, 132, 262);
    expect(s.stats()).toEqual(a);
  });

  it("il ciuffo d'erba è una geometria con 5 fili (15 vertici) alta circa 1", () => {
    const g = createGrassTuftGeometry();
    expect(g.attributes.position.count).toBe(15);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBe(0);
    expect(g.boundingBox!.max.y).toBeGreaterThan(0.7);
    expect(g.boundingBox!.max.y).toBeLessThanOrEqual(1);
  });

  it("la proiezione dei vertici concorda con projectToSphere sul punto centrale", () => {
    const s = createLocalScene(QUALITY_PROFILES.medio, R);
    const vf = makeVf({ terrain: 1, elevation: 0.5, originX: 100, originY: 200, cells: 64 });
    s.update(vf, W, H, 132, 232);
    const pos = (s.group.children[0] as THREE.Mesh).geometry.attributes.position as THREE.BufferAttribute;
    const k = 32 * 65 + 32; // vertice centrale: gx=132, gy=232
    const expected = projectToSphere(132, 232, W, H, groundRadius(s.ground!, 132, 232, R));
    expect(pos.getX(k)).toBeCloseTo(expected.x, 5);
    expect(pos.getY(k)).toBeCloseTo(expected.y, 5);
    expect(pos.getZ(k)).toBeCloseTo(expected.z, 5);
  });
});
