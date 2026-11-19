import type { SceneRefs } from "../components/simulation/Planet3DView";
import type { RenderFrame } from "../types";
import { GENERIC_RENDER_SLOTS, type CreatureRenderPartKey } from "../lib/visual/anatomyRenderPlan";
import { TRAIT_RANGES } from "../simulation/biology/genome";

/** Fixture condivisa tra benchmark e test G3.1: nessun dato della simulazione viene modificato. */
export const G31_KEYS = Object.keys(GENERIC_RENDER_SLOTS) as CreatureRenderPartKey[];
export const g31Mid = (key: keyof typeof TRAIT_RANGES) => (TRAIT_RANGES[key].min + TRAIT_RANGES[key].max) / 2;

export interface G31FrameOptions {
  /** Griglia: x = 80 + (i % columns) * spacing. */
  columns?: number;
  spacing?: number;
  origin?: number;
  withMorphology?: boolean;
  tick?: number;
  /** Override per singola creatura (indici nell'array). */
  positions?: Array<{ x: number; y: number; species?: number; size?: number }>;
}

export function createRenderFrame(count: number, withMorphology = false, options: G31FrameOptions = {}): RenderFrame {
  const columns = options.columns ?? 128;
  const spacing = options.spacing ?? 2;
  const origin = options.origin ?? 80;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const species = new Uint16Array(count);
  const size = new Float32Array(count);
  const speed = new Float32Array(count);
  const carnivory = new Float32Array(count);
  const vision = new Float32Array(count);
  const evasion = new Float32Array(count);
  const hunting = new Float32Array(count);
  const ids = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const override = options.positions?.[i];
    x[i] = override?.x ?? origin + (i % columns) * spacing;
    y[i] = override?.y ?? origin + Math.floor(i / columns) * spacing;
    species[i] = override?.species ?? i % 17;
    size[i] = override?.size ?? 0.8 + (i % 7) * 0.1;
    speed[i] = g31Mid("speed");
    carnivory[i] = g31Mid("carnivory");
    vision[i] = g31Mid("vision");
    evasion[i] = g31Mid("evasion");
    hunting[i] = g31Mid("huntingSkill");
    ids[i] = i + 1;
  }
  const useMorphology = withMorphology && options.withMorphology !== false;
  return {
    tick: options.tick ?? 1,
    planetWidth: 512,
    planetHeight: 512,
    organismsX: x, organismsY: y, organismsSpecies: species, organismsSize: size,
    organismsSpeed: speed, organismsCarnivory: carnivory, organismsVision: vision,
    organismsEvasion: evasion, organismsHuntingSkill: hunting, organismsId: ids,
    ...(useMorphology ? {
      organismsBodyStature: Float32Array.from({ length: count }, (_, i) => 0.2 + (i % 7) * 0.1),
      organismsFurDensity: Float32Array.from({ length: count }, (_, i) => 0.3 + (i % 5) * 0.1),
      organismsDermalArmor: Float32Array.from({ length: count }, (_, i) => 0.1 + (i % 9) * 0.05),
      organismsMorphologyPresence: new Uint8Array(count).fill(7),
    } : {}),
  } as unknown as RenderFrame;
}

/**
 * Costruisce SceneRefs con mesh instanziate. `THREE` e' passato dal chiamante
 * per mantenere questo modulo indipendente dal bundle del browser.
 */
export function createSceneRefs(THREE: typeof import("three"), capacity: number, detail: 1 | 2 | 3 = 3, withGeneric = true, withCamera = false): SceneRefs {
  const one = Math.max(1, capacity);
  const mesh = (cap: number, colored = false) => {
    const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 4, 3), new THREE.MeshBasicMaterial(), Math.max(1, cap));
    if (colored) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cap) * 3), 3);
    m.count = 0;
    m.frustumCulled = false;
    return m;
  };
  const refs = {
    bodyMesh: mesh(one), headMesh: mesh(one), eyeMesh: mesh(one * 2), tailMesh: mesh(one),
    jawMesh: mesh(one), spikeMesh: mesh(one * 3), legMesh: mesh(one * 4), earMesh: mesh(one * 2),
    shadowMesh: mesh(one), creatureTrack: new Map(), instanceOrganismId: new Uint32Array(one),
    heightmap: null, capacity: one, maxCreatures: one, detail,
    creatureRenderStats: { drawn: 0, mapped: 0, legacy: 0, fallback: 0, unsupported: 0, fallbackReasons: [] },
  } as unknown as SceneRefs;
  if (withGeneric) {
    refs.genericMeshes = {};
    refs.genericSlotsPerCreature = {};
    for (const key of G31_KEYS) {
      refs.genericMeshes[key] = mesh(one * GENERIC_RENDER_SLOTS[key], key !== "eye");
      refs.genericSlotsPerCreature[key] = GENERIC_RENDER_SLOTS[key];
    }
  }
  if (withCamera) {
    refs.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    refs.camera.position.set(0, 0, 24);
    refs.camera.updateMatrixWorld(true);
  }
  return refs;
}
