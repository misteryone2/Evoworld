import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { updateCreatureInstances, type SceneRefs } from "../components/simulation/Planet3DView";
import { createRuntimeAnatomyRenderSource } from "../lib/visual/runtimeAnatomyRenderSource";
import { projectToSphereInto, type SpherePoint } from "../lib/sphereProjection";
import { createSceneRefs, createRenderFrame } from "../scripts/g31Fixtures";
import { buildRenderFrame } from "../simulation/core/renderFrame";
import { World } from "../simulation/core/world";
import type { RenderFrame } from "../types";

const CAP = 8;

function refsFor(): SceneRefs {
  const refs = createSceneRefs(THREE, CAP, 3, true, true);
  refs.maxCreatures = CAP;
  return refs;
}

function setAdaptive(refs: SceneRefs, overrides: Record<string, unknown> = {}): void {
  refs.adaptive = {
    enabled: true, nearDistanceScales: 55, farStride: 4,
    cullBehindCamera: false, cullMarginUnits: 4, ...overrides,
  };
  refs.adaptiveState = null;
}

function worldPoint(frame: RenderFrame, index: number): SpherePoint {
  return projectToSphereInto(
    { x: 0, y: 0, z: 0, normalX: 0, normalY: 0, normalZ: 0 },
    frame.organismsX[index], frame.organismsY[index], frame.planetWidth, frame.planetHeight, 0.02,
  );
}

function nearCamera(refs: SceneRefs, frame: RenderFrame, index: number): void {
  const p = worldPoint(frame, index);
  refs.camera.position.set(p.x + p.normalX * 3, p.y + p.normalY * 3, p.z + p.normalZ * 3);
  refs.camera.lookAt(p.x, p.y, p.z);
  refs.camera.updateMatrixWorld(true);
}

function farCamera(refs: SceneRefs): void {
  refs.camera.position.set(1000, 0, 0);
  refs.camera.lookAt(1001, 0, 0);
  refs.camera.updateMatrixWorld(true);
}

function matrixAt(mesh: THREE.InstancedMesh, index: number): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(index, m);
  return m;
}

function frameWith(count: number, positions: Array<{ x: number; y: number; species?: number; size?: number }>): RenderFrame {
  return createRenderFrame(count, true, { positions, columns: 64, spacing: 3 });
}

function worldSnapshot(world: World): string[] {
  return world.organisms.map((o) => [
    o.id, o.speciesId, o.position.x.toFixed(6), o.position.y.toFixed(6),
    o.energy.toFixed(6), o.age, o.alive, JSON.stringify(o.genome),
    Array.from(o.brain).map((v) => v.toFixed(6)).join(","),
  ].join("|"));
}

describe("G3.1 — aggiornamento adattivo della rappresentazione grafica", () => {
  it("1. aggiorna ogni frame le creature vicine e visibili", () => {
    const refs = refsFor();
    const frame = frameWith(2, [{ x: 200, y: 200 }, { x: 220, y: 200 }]);
    nearCamera(refs, frame, 0);
    setAdaptive(refs);
    updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position);
    const before = matrixAt(refs.bodyMesh, 0).clone();
    frame.organismsX[0] += 4;
    updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position);
    const after = matrixAt(refs.bodyMesh, 0);
    expect(before.equals(after)).toBe(false);
    expect(refs.creatureRenderStats!.lodNear).toBeGreaterThanOrEqual(1);
    expect(refs.creatureRenderStats!.updated).toBeGreaterThanOrEqual(1);
  });

  it("2. non riscrive le creature lontane nei frame non dovuti", () => {
    const refs = refsFor();
    const frame = frameWith(4, [
      { x: 100, y: 100 }, { x: 120, y: 100 }, { x: 140, y: 100 }, { x: 160, y: 100 },
    ]);
    farCamera(refs);
    setAdaptive(refs);
    updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position);
    // slot 3: (frame 2, stride 4) non è dovuto.
    const before = matrixAt(refs.bodyMesh, 3).clone();
    frame.organismsX[3] += 6;
    updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position);
    expect(matrixAt(refs.bodyMesh, 3).equals(before)).toBe(true);
    expect(refs.creatureRenderStats!.skipped).toBeGreaterThan(0);
    expect(refs.creatureRenderStats!.updated! + refs.creatureRenderStats!.skipped!).toBe(4);
  });

  it("3. aggiorna subito una creatura che rientra nella visuale", () => {
    const refs = refsFor();
    const frame = frameWith(2, [{ x: 200, y: 200 }, { x: 220, y: 200 }]);
    // Camera che guarda via dal pianeta: tutto è cullato.
    refs.camera.position.set(0, 0, 24);
    refs.camera.lookAt(0, 0, 100);
    refs.camera.updateMatrixWorld(true);
    setAdaptive(refs, { cullBehindCamera: true });
    updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position);
    expect(refs.creatureRenderStats!.culled).toBe(2);
    expect(Math.abs(matrixAt(refs.bodyMesh, 0).determinant())).toBe(0);

    nearCamera(refs, frame, 0);
    updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position);
    expect(Math.abs(matrixAt(refs.bodyMesh, 0).determinant())).toBeGreaterThan(0);
    expect(refs.creatureRenderStats!.culled).toBeLessThan(2);
    expect(refs.instanceOrganismId[0]).toBe(frame.organismsId[0]);
  });

  it("4. un cambio anatomico invalida i dati anche su una creatura saltata", () => {
    const refs = refsFor();
    const frame = frameWith(4, [
      { x: 100, y: 100 }, { x: 120, y: 100 }, { x: 140, y: 100 }, { x: 160, y: 100 },
    ]);
    farCamera(refs);
    const source = createRuntimeAnatomyRenderSource("g31-invalidation");
    source.syncFrame(frame);
    setAdaptive(refs);
    updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position, source);
    const before = matrixAt(refs.bodyMesh, 3).clone();

    const changed = { ...frame, tick: frame.tick + 1, organismsBodyStature: Float32Array.from(frame.organismsBodyStature!, (v, i) => i === 3 ? 0.95 : v) } as RenderFrame;
    source.syncFrame(changed);
    // Il frame 2 non farebbe cadere lo slot 3; l'invalidazione deve forzarlo.
    updateCreatureInstances(refs, changed, null, null, 16, refs.camera.position, source);
    expect(matrixAt(refs.bodyMesh, 3).equals(before)).toBe(false);
    expect(refs.creatureRenderStats!.lodFar).toBe(4);
  });

  it("5. il cambio di LOD non altera la geometria definita dai geni", () => {
    const options = { positions: [{ x: 200, y: 200 }, { x: 220, y: 200 }], columns: 64, spacing: 3 };
    const frame = createRenderFrame(2, true, options);
    const plain = refsFor();
    const adaptive = refsFor();
    nearCamera(adaptive, frame, 0);
    setAdaptive(adaptive, { farStride: 16 });
    updateCreatureInstances(plain, frame, null, null, 16, null);
    updateCreatureInstances(adaptive, frame, null, null, 16, adaptive.camera.position);
    expect(adaptive.creatureRenderStats!.lodNear).toBe(2);
    for (let i = 0; i < 2; i++) {
      expect(matrixAt(adaptive.bodyMesh, i).equals(matrixAt(plain.bodyMesh, i))).toBe(true);
      expect(matrixAt(adaptive.headMesh, i).equals(matrixAt(plain.headMesh, i))).toBe(true);
    }
    const keys = ["segment", "appendage", "eye"] as const;
    for (const key of keys) {
      expect(adaptive.genericMeshes![key]!.count).toBe(plain.genericMeshes![key]!.count);
    }
  });

  it("6. i pool non contaminano lo stato tra creature diverse", () => {
    const refs = refsFor();
    const frame = frameWith(3, [
      { x: 100, y: 100, species: 1 }, { x: 130, y: 100, species: 9 }, { x: 160, y: 100, species: 15 },
    ]);
    farCamera(refs);
    setAdaptive(refs, { farStride: 1 });
    const source = createRuntimeAnatomyRenderSource("g31-pools");
    source.syncFrame(frame);
    for (let f = 0; f < 4; f++) {
      updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position, source);
      expect(refs.creatureRenderStats!.droppedParts).toBe(0);
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(matrixAt(refs.bodyMesh, i).determinant())).toBeGreaterThan(0);
        expect(refs.instanceOrganismId[i]).toBe(frame.organismsId[i]);
      }
    }
    const color0 = new THREE.Color();
    const color1 = new THREE.Color();
    refs.bodyMesh.getColorAt(0, color0);
    refs.bodyMesh.getColorAt(1, color1);
    expect(color0.equals(color1)).toBe(false);
    expect(refs.genericMeshes!.segment!.count).toBeGreaterThan(0);
  });

  it("7. non accumula arretrati: al frame dovuto la creatura usa i dati correnti", () => {
    const refs = refsFor();
    const frame = frameWith(2, [{ x: 100, y: 100 }, { x: 160, y: 100 }]);
    farCamera(refs);
    setAdaptive(refs, { farStride: 4 });
    for (let f = 0; f < 12; f++) {
      frame.organismsX[1] = 160 + f;
      updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position);
      const stats = refs.creatureRenderStats!;
      expect(stats.updated! + stats.skipped!).toBe(2);
      expect(stats.updated!).toBeLessThanOrEqual(2);
    }
    // Dopo 12 frame il dato dello slot 1 è stato riscritto più volte, senza picchi.
    expect(Math.abs(matrixAt(refs.bodyMesh, 1).determinant())).toBeGreaterThan(0);
    expect(refs.instanceOrganismId[1]).toBe(frame.organismsId[1]);
  });

  it("8. il cambio di camera aggiorna la classificazione LOD", () => {
    const refs = refsFor();
    const frame = frameWith(2, [{ x: 200, y: 200 }, { x: 220, y: 200 }]);
    farCamera(refs);
    setAdaptive(refs);
    updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position);
    expect(refs.creatureRenderStats!.lodFar).toBe(2);
    nearCamera(refs, frame, 0);
    updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position);
    expect(refs.creatureRenderStats!.lodNear).toBeGreaterThanOrEqual(1);
  });

  it("9. il cambio di viewport/zoom forza una nuova classificazione", () => {
    const refs = refsFor();
    const frame = frameWith(2, [{ x: 100, y: 100 }, { x: 120, y: 100 }]);
    farCamera(refs);
    setAdaptive(refs);
    // Primo frame: refresh iniziale. Il secondo è già differenziale.
    updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position);
    updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position);
    expect(refs.creatureRenderStats!.skipped!).toBeGreaterThan(0);
    refs.camera.aspect = 1.6;
    refs.camera.fov = 60;
    refs.camera.updateProjectionMatrix();
    updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position);
    expect(refs.creatureRenderStats!.updated).toBe(2);
    expect(refs.creatureRenderStats!.skipped).toBe(0);
  });

  it("10. la simulazione biologica è identica con rendering adattivo attivo o disattivo", () => {
    const config = { width: 96, height: 96, seed: 31 } as never;
    const plainWorld = new World(config, 40);
    const adaptiveWorld = new World(config, 40);
    const refs = refsFor();
    nearCamera(refs, createRenderFrame(1, true), 0);
    setAdaptive(refs, { cullBehindCamera: true });

    for (let tick = 0; tick < 12; tick++) {
      plainWorld.step();
      adaptiveWorld.step();
      const frame = buildRenderFrame(adaptiveWorld);
      updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position);
    }
    expect(worldSnapshot(adaptiveWorld)).toEqual(worldSnapshot(plainWorld));
  });

  it("11. popolazione elevata: nessuna scrittura fuori capacity e contatori coerenti", () => {
    const n = 200;
    const refs = createSceneRefs(THREE, n, 3, true, true);
    refs.maxCreatures = n;
    const frame = createRenderFrame(n, true, { columns: 32, spacing: 2 });
    farCamera(refs);
    setAdaptive(refs, { farStride: 6 });
    const source = createRuntimeAnatomyRenderSource("g31-large");
    source.syncFrame(frame);
    for (let f = 0; f < 8; f++) {
      updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position, source);
      if (f === 0) continue; // primo frame: refresh completo iniziale
      const stats = refs.creatureRenderStats!;
      expect(stats.updated! + stats.skipped! + stats.culled!).toBe(n);
      expect(stats.updated!).toBeLessThan(n);
      expect(stats.drawn).toBeLessThanOrEqual(n);
      expect(refs.bodyMesh.count).toBeLessThanOrEqual(n);
      expect(refs.genericMeshes!.segment!.count).toBeLessThanOrEqual(n * 32);
      expect(stats.droppedParts).toBe(0);
    }
  });
});
