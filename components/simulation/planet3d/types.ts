import type * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LocalScene } from "../localScene";
import type { MutableHeading } from "../../../lib/creatureHeading";
import type { VisualMotion } from "../../../lib/naturalMotion";
import type { LivingState } from "../../../lib/livingBehavior";
import type { CreatureAnatomy } from "../../../lib/creatureAnatomy";
import type { CreatureAnatomyRenderSource, CreatureRenderPartKey } from "../../../lib/visual/anatomyRenderPlan";

export interface HeightmapSample {
  elevation: Float32Array;
  terrain: Uint8Array;
  originX: number;
  originY: number;
  cellsWidth: number;
  cellsHeight: number;
  texWidth: number;
  texHeight: number;
}

/**
 * v1.9.0 — Traccia di una creatura disegnata: ultima posizione, orientamento, fase del passo e anatomia
 * (che dipende solo dai geni, quindi si ricalcola solo se cambiano). Si modifica sul posto a ogni frame:
 * niente oggetti nuovi per creatura, e quindi meno lavoro per il garbage collector.
 */
export interface CreatureTrack extends MutableHeading {
  /** v1.10.2 — rotazione, velocità e inclinazione visive (temporanee, solo per il disegno). */
  motion: VisualMotion;
  /** v1.10.4 — stato visivo da ferma (respiro, sguardo, mangia, riposa): temporaneo, non persistente. */
  living: LivingState;
  x: number;
  y: number;
  phase: number;
  /** Numero del frame in cui la creatura è stata disegnata l'ultima volta (per scartare le assenti). */
  gen: number;
  anatomy: CreatureAnatomy | null;
  aSpeed: number;
  aCarnivory: number;
  aVision: number;
  aEvasion: number;
  aHunting: number;
}

export interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  planetMesh: THREE.Mesh;
  planetTexture: THREE.DataTexture;
  textureData: Uint8Array;
  /** v1.9.4 — Acqua: roughnessMap del pianeta (verde: 255 = terra opaca, ~45 = acqua lucida). */
  roughnessTexture: THREE.DataTexture;
  roughnessData: Uint8Array;
  /** v1.2.2 — pristine, undisplaced unit-sphere vertex positions (direction * PLANET_RADIUS) for the CURRENT geometry, captured fresh whenever the geometry is (re)built at a new LOD tessellation. Displacement is always computed from this, never from the previous frame's already-displaced positions, so repeated updates don't compound. */
  basePositions: Float32Array;
  /** v1.2.2 — tessellation (segmentsWidth) the current planetMesh.geometry was built at, to detect when a LOD tier change requires rebuilding the geometry rather than just re-displacing it. */
  currentSegmentsWidth: number;
  /** v1.2.2 — latest viewport elevation/terrain sample, shared so creature positioning (updateCreatureInstances) can rest organisms on the same displaced surface without any per-tick RenderFrame payload growth. */
  heightmap: HeightmapSample | null;
  /** v1.6.0 — instance-buffer size, drawn-creature target and how many body parts to draw (1 torso+head, 2 +eyes/tail/jaw, 3 +spikes). */
  capacity: number;
  maxCreatures: number;
  detail: 1 | 2 | 3;
  bodyMesh: THREE.InstancedMesh;
  /** v1.5.0 — Creature 3D: the rest of a creature's body, one InstancedMesh per part (see updateCreatureInstances). */
  headMesh: THREE.InstancedMesh;
  /** Two slots per creature: instance 2n is the left eye, 2n+1 the right. */
  eyeMesh: THREE.InstancedMesh;
  tailMesh: THREE.InstancedMesh;
  jawMesh: THREE.InstancedMesh;
  /** Three slots per creature (up to three dorsal spikes): instances 3n..3n+2. */
  spikeMesh: THREE.InstancedMesh;
  /** v1.8.0 — quattro zampe per creatura (istanze 4n..4n+3), dal dettaglio 2. */
  legMesh: THREE.InstancedMesh;
  /** v1.8.0 — due orecchie per creatura (istanze 2n, 2n+1), solo al dettaglio 3 e solo per gli erbivori. */
  earMesh: THREE.InstancedMesh;
  /** v1.8.0 — ombra morbida sotto ogni creatura, dal dettaglio 2. */
  shadowMesh: THREE.InstancedMesh;
  /** v1.8.0 — terreno ad alto dettaglio e flora 3D intorno all'animale seguito (null se il profilo non li prevede). */
  local: LocalScene | null;
  /** v1.5.0 — last rendered position and heading of each drawn creature, so each one can face the way it has been moving. Rebuilt every frame (creatures no longer drawn are dropped). v1.8.0: `phase` è la fase del passo, che avanza con la strada percorsa. */
  creatureTrack: Map<number, CreatureTrack>;
  selectionRing: THREE.Mesh;
  /** Maps instance index (as written by updateCreatureInstances) back to the underlying organism's id, for raycasting hit-tests (v1.0.4). */
  instanceOrganismId: Uint32Array;

  // ---- G-REV-02: sorgente di rendering G2, opzionale e mai scritta dalla simulazione ----
  /** Provider lato renderer dei piani G2. Se assente, il comportamento resta legacy. */
  renderSource?: CreatureAnatomyRenderSource | null;
  /** Pool instanziati generici (segmenti, appendici, occhi). Chiavi come in GENERIC_RENDER_SLOTS. */
  genericMeshes?: Partial<Record<CreatureRenderPartKey, THREE.InstancedMesh>>;
  /** Slot per creatura effettivamente allocati per ciascun pool. */
  genericSlotsPerCreature?: Partial<Record<CreatureRenderPartKey, number>>;
  /** Statistiche di rendering del frame, mutate in posto per evitare allocazioni. */
  creatureRenderStats?: CreatureRendererStats;
}

export interface CreatureRendererStats {
  drawn: number;
  mapped: number;
  legacy: number;
  fallback: number;
  unsupported: number;
  /** Motivi di fallback del frame corrente (al massimo 8 voci). */
  fallbackReasons: string[];
}
