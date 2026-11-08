"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RenderFrame, ViewportFrame, ViewportRequest } from "../../types";
import { speciesHue } from "../../lib/speciesColor";
import { computeCreatureAnatomy, MAX_SPIKES, type CreatureAnatomy } from "../../lib/creatureAnatomy";
import { advanceHeading, nextHeading, wrappedDelta, type Heading, type MutableHeading } from "../../lib/creatureHeading";
import { collectNearbyOrganisms, ensureCandidateBuffer } from "../../lib/followCull";
import { FOLLOW_CREATURE_RANGE_UNITS, creatureScale } from "../../lib/worldScale";
import { terrainColorRGB, applyWaterOverlayRGB, applySeasonalTintRGB } from "../../lib/terrainColor";
import { TICKS_PER_YEAR } from "../../simulation/core/constants";
import { projectToSphere, projectToSphereInto, type SpherePoint, elevationDisplacement, sampleViewportChannelBilinear, sampleViewportTerrainIsOcean, sampleViewportElevationNearest } from "../../lib/sphereProjection";
import { computeRenderStride } from "../../lib/renderSampling";
import {
  computeFollowPose,
  clampCameraRadius,
  cameraClearance,
  dampingAlpha,
  easeAngleToZero,
  directionToGrid,
  type Vec3,
} from "../../lib/followCamera";
import { nearestOrganismId } from "../../lib/followTarget";
import { createLocalScene, type LocalScene } from "./localScene";
import { groundContains, groundRadius, isLocalViewport, localPatchRadiusCells } from "../../lib/localGround";
import { QUALITY_PROFILES, shouldDowngrade, type QualityProfile } from "../../lib/qualityProfile";

const PLANET_RADIUS = 5;
/**
 * v1.6.0 — Modalità leggera. How many creatures get an instance, how detailed
 * each one is, the resolution of the screen buffer and of the terrain all come
 * from the active QualityProfile (lib/qualityProfile.ts) instead of fixed
 * constants. Above the profile's maxCreatures the renderer draws a
 * deterministic stride-sampled subset (see lib/renderSampling.ts, v1.0.2):
 * the simulation engine has no population cap and never will; this only
 * bounds what gets drawn. Instance buffers are sized to that same number
 * (plus a little slack for striding), so a light profile also uses far less
 * memory than a full one.
 */
const CREATURE_BUFFER_SLACK = 16;
/** v1.7.0 — piano vicino della camera: da vicino al suolo serve molto più piccolo di quello della vista dall'alto. */
const FOLLOW_NEAR_PLANE = 0.03;
const ORBIT_NEAR_PLANE = 0.1;
/** v1.7.0 — costante di tempo (ms) dello smorzamento della camera: abbastanza alta da assorbire i salti tra un frame e l'altro. */
const FOLLOW_SMOOTHING_MS = 140;
/** v1.7.0 — dopo quanto tempo senza tocchi la camera torna dietro l'animale, e con che costante di tempo. */
const FOLLOW_RECENTER_DELAY_MS = 2500;
const FOLLOW_RECENTER_TIME_MS = 600;
/** v1.7.0 — se l'animale seguito sparisce (morto) per più di così, si passa al più vicino. */
const FOLLOW_LOST_TARGET_MS = 1500;
/** v1.7.0 — se la nuova posa dista più di così dalla camera attuale (altro animale lontano), la camera salta invece di attraversare il pianeta. */
const FOLLOW_SNAP_DISTANCE = 2.5;
/** v1.8.0 — colori del cielo (terza persona) e dello spazio (vista dall'alto), e foschia atmosferica. */
const SKY_COLOR = 0x9cc3e6;
const SPACE_COLOR = 0x05070a;
const FOLLOW_FOG_NEAR = 1.2;
const FOLLOW_FOG_FAR = 5.2;
const SUN_ORBIT_POSITION: [number, number, number] = [6, 4, 8];
/** v1.8.0 — terreno locale: mezza larghezza (unità del mondo 3D) dell'area richiesta, ritmo delle richieste. */
const LOCAL_PATCH_HALF_UNITS = 3;
const LOCAL_CHECK_INTERVAL_MS = 400;
const LOCAL_MIN_INTERVAL_MS = 400;
const LOCAL_REFRESH_MS = 2500;
const LOCAL_RECENTER_FRACTION = 0.3;
const LEGS_PER_CREATURE = 4;
/** v1.7.0 — radianti per pixel trascinato. */
const FOLLOW_YAW_PER_PX = 0.006;
const FOLLOW_PITCH_PER_PX = 0.004;
const FOLLOW_PITCH_MIN = -0.3;
const FOLLOW_PITCH_MAX = 1.0;
/** Below this normalized carnivory value, no aggression tint is applied (matches the 2D drawCreature threshold). */
const AGGRESSION_VISIBLE_THRESHOLD = 0.15;
/** Pointer movement (px) below which a pointerdown+pointerup is treated as a tap/click rather than a drag-to-rotate (v1.0.4). */
const TAP_MOVEMENT_THRESHOLD_PX = 6;

/**
 * v1.1 — World Scale. Terrain texture LOD tiers, keyed by camera distance
 * from the planet (in units of PLANET_RADIUS). Farther away requests a
 * coarser overview; closer requests sharper detail — but the *maximum*
 * resolution is fixed regardless of how large the simulated world
 * actually is (512x512 vs 2048x2048 request the exact same tiers), which
 * is what keeps render cost flat as the world scales up. See
 * ViewportRequest/ViewportFrame and simulation/core/viewportFrame.ts.
 *
 * v1.2.2 — each tier also now specifies a mesh tessellation
 * (segmentsWidth/segmentsHeight for the sphere's own widthSegments/
 * heightSegments): geometry only gets as detailed as the camera distance
 * actually warrants, same principle as the texture resolution, reusing
 * the exact same tier list rather than a second, independent LOD system.
 */
const TERRAIN_LOD_TIERS: { minDistanceFactor: number; maxWidth: number; maxHeight: number; segmentsWidth: number; segmentsHeight: number }[] = [
  { minDistanceFactor: 4, maxWidth: 320, maxHeight: 160, segmentsWidth: 64, segmentsHeight: 48 },
  { minDistanceFactor: 2.2, maxWidth: 640, maxHeight: 320, segmentsWidth: 96, segmentsHeight: 64 },
  { minDistanceFactor: 0, maxWidth: 1024, maxHeight: 512, segmentsWidth: 160, segmentsHeight: 112 },
];
/** How often (ms) camera distance is polled to decide whether a new terrain LOD tier should be requested. */
const TERRAIN_LOD_CHECK_INTERVAL_MS = 500;

type TerrainTier = { minDistanceFactor: number; maxWidth: number; maxHeight: number; segmentsWidth: number; segmentsHeight: number };

/** v1.6.0 — the LOD tiers a profile may use: those whose texture is no wider than the profile allows (always at least the coarsest one). */
function tiersForProfile(profile: QualityProfile): TerrainTier[] {
  const allowed = TERRAIN_LOD_TIERS.filter((t) => t.maxWidth <= profile.terrainMaxWidth);
  return allowed.length > 0 ? allowed : [TERRAIN_LOD_TIERS[0]];
}

function pickTerrainLodTier(distance: number, tiers: TerrainTier[]): TerrainTier {
  const factor = distance / PLANET_RADIUS;
  for (const tier of tiers) {
    if (factor >= tier.minDistanceFactor) return tier;
  }
  return tiers[tiers.length - 1];
}

const TERRAIN_LABELS: Record<number, string> = {
  0: "Oceano",
  1: "Pianura",
  2: "Deserto",
  3: "Montagna",
  4: "Foresta",
  5: "Tundra",
  6: "Savana",
};

const TERRAIN_SWATCHES: Record<number, string> = {
  0: "#123a52",
  1: "#5b7a3a",
  2: "#c2a25a",
  3: "#6b6558",
  4: "#1f5c34",
  5: "#c7d4d6",
  6: "#a68a3c",
};

/** v1.7.0 — "orbit": vista dall'alto, si ruota il pianeta. "follow": terza persona, la camera segue l'animale selezionato. */
export type CameraMode = "orbit" | "follow";

interface Props {
  frame: RenderFrame | null;
  /** v1.1 — on-demand terrain/vegetation payload (see ViewportRequest/ViewportFrame), independent of frame's per-tick cadence. */
  viewportFrame?: ViewportFrame | null;
  /** v1.1 — called to request a (re)painted terrain texture at a given resolution/region; see the LOD-tier logic driving this from camera distance below. */
  onRequestViewport?: (request: ViewportRequest) => void;
  /** v1.0.4 — currently selected organism id, if any; used to position the highlight ring. */
  selectedOrganismId?: number | null;
  /** v1.0.4 — called with an organism id when the person taps/clicks a creature, or null when they tap empty space (deselecting). */
  onSelectOrganism?: (organismId: number | null) => void;
  /** v1.6.0 — how much to draw and at what resolution (see lib/qualityProfile.ts). Changing the quality level remounts this view (page.tsx keys it on the level). */
  quality?: QualityProfile;
  /** v1.6.0 — called when the view measures that the device cannot keep up (the median frame stays slow for a while). */
  onSlow?: () => void;
  /** v1.7.0 — vista dall'alto (default) o terza persona sull'animale selezionato. */
  cameraMode?: CameraMode;
}

interface HeightmapSample {
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

let trackGeneration = 0;
const tmpPoint: SpherePoint = { x: 0, y: 0, z: 0, normalX: 0, normalY: 0, normalZ: 0 };
const tmpAhead: SpherePoint = { x: 0, y: 0, z: 0, normalX: 0, normalY: 0, normalZ: 0 };

export interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  planetMesh: THREE.Mesh;
  planetTexture: THREE.DataTexture;
  textureData: Uint8Array;
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
}

// Reused scratch objects for the per-frame instance update loop, to avoid
// allocating thousands of THREE.Vector3/Matrix4/Color objects every tick.
const UP = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const tmpLegQuat = new THREE.Quaternion();
const AGGRO_TINT = new THREE.Color(1, 0.35, 0.27);
const SPIKE_TINT = new THREE.Color(1, 1, 1);
const tmpPosition = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpMatrix = new THREE.Matrix4();
const tmpColor = new THREE.Color();
// v1.5.0 — Creature 3D scratch objects.
const tmpColor2 = new THREE.Color();
const tmpTangent = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpBasis = new THREE.Matrix4();
const tmpCreatureMatrix = new THREE.Matrix4();
const tmpLocal = new THREE.Matrix4();
const tmpPartMatrix = new THREE.Matrix4();
const tmpLocalPos = new THREE.Vector3();
const tmpLocalScale = new THREE.Vector3();
const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const Q_IDENTITY = new THREE.Quaternion();
/** Rotates a cone (tip along +Y) so its tip points backward (-Z): the tail. */
const Q_TIP_BACK = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
/** Rotates a cone so its tip points forward (+Z): the jaw. */
const Q_TIP_FORWARD = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
/** Radius of the unit cone geometry used for tail, jaw and spikes (see ConeGeometry below). */
const CONE_BASE_RADIUS = 0.35;

/**
 * Renders the planet as a rotatable 3D sphere with organisms drawn as
 * instanced procedural creature meshes (v0.7 — mondo 3D), replacing the
 * flat 2D canvas (still available in PlanetCanvas.tsx, now unused by
 * app/page.tsx but left in place — its color logic is shared via
 * lib/terrainColor.ts).
 *
 * KNOWN LIMITATION, stated plainly: the simulation's world wraps on both
 * axes (a torus), which cannot be mapped onto a sphere without distortion.
 * The top/bottom rows of the grid compress toward the poles, same as any
 * equirectangular world map projection. See lib/sphereProjection.ts.
 *
 * Individual creature ornaments are simplified compared to the 2D
 * drawCreature (components/simulation/drawCreature.ts): body elongation,
 * species color, an aggression tint, and evasion-driven spikes are all
 * rendered as real 3D geometry via THREE.InstancedMesh (one draw call per
 * feature type regardless of population size); jaw and eye detail are
 * reserved for the still-2D SpeciesPortrait, where only one creature is
 * ever drawn at a time and per-organism instancing doesn't apply.
 *
 * v1.0.2 — LOD adattivo: once the population exceeds the profile's maxCreatures,
 * only a deterministic stride-sampled subset actually gets a rendered
 * instance each frame (see lib/renderSampling.ts), keeping this
 * component's per-frame CPU cost roughly constant regardless of how large
 * the simulation itself grows. The engine has no population cap; only the
 * rendered detail is capped.
 *
 * v1.0.4 — Esplorazione individuale: tapping/clicking a creature raycasts
 * against the body InstancedMesh; the hit's instanceId is mapped back to
 * the underlying organism's id via instanceOrganismId and reported through
 * onSelectOrganism. A pointerdown/pointerup distance check keeps a
 * drag-to-rotate gesture from being misread as a tap. The currently
 * selected organism (if still present in the current frame) gets a bright
 * ring highlight positioned at its live location every frame — note that
 * under heavy LOD sampling the selected organism might not be part of the
 * rendered creature subset, so its position is looked up independently
 * from the full (unsampled) organismsId array, not from the LOD loop.
 *
 * v1.1 — World Scale: the terrain/vegetation texture painted onto the
 * sphere is no longer derived from the per-tick RenderFrame (which no
 * longer carries a full per-cell grid at all — see
 * simulation/core/renderFrame.ts). Instead it's requested on demand via
 * onRequestViewport, driven by camera distance (see TERRAIN_LOD_TIERS)
 * and a periodic refresh, and painted only when a new ViewportFrame
 * arrives (see the effect keyed on [viewportFrame] below).
 *
 * v1.2.2 — Real 3D Surface: that same effect now also displaces the
 * sphere geometry's own vertices from Cell.elevation (via the viewport's
 * new elevation channel), so mountains/valleys are genuine 3D relief, not
 * just a flat-shaded texture — see elevationDisplacement in
 * lib/sphereProjection.ts. Mesh tessellation is tied to the same
 * camera-distance LOD tiers already used for texture resolution.
 * Creatures and the selection ring rest on this same displaced surface,
 * sampled client-side from the on-demand viewport heightmap — never from
 * a per-tick simulation query, so RenderFrame's payload is unchanged.
 */
export function Planet3DView({ frame, viewportFrame = null, onRequestViewport, selectedOrganismId = null, onSelectOrganism, quality = QUALITY_PROFILES.alto, onSlow, cameraMode = "orbit" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const lastTextureSize = useRef<{ width: number; height: number } | null>(null);
  const onSelectRef = useRef(onSelectOrganism);
  const selectedIdRef = useRef(selectedOrganismId);
  const frameRef = useRef(frame);
  const onRequestViewportRef = useRef(onRequestViewport);
  const onSlowRef = useRef(onSlow);
  const cameraModeRef = useRef<CameraMode>(cameraMode);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);
  useEffect(() => {
    onSlowRef.current = onSlow;
  }, [onSlow]);
  useEffect(() => {
    onSelectRef.current = onSelectOrganism;
  }, [onSelectOrganism]);
  useEffect(() => {
    selectedIdRef.current = selectedOrganismId;
  }, [selectedOrganismId]);
  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);
  useEffect(() => {
    onRequestViewportRef.current = onRequestViewport;
  }, [onRequestViewport]);

  // Mount-only: build the renderer, scene, camera, controls, and the
  // pre-allocated meshes once. Per-frame updates (below) only ever mutate
  // texture pixels and instance matrices/colors on these same objects.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 800;

    // v1.6.0 — antialiasing and pixel density are the biggest GPU costs on
    // old graphics cards and dense phone screens; both come from the profile.
    const renderer = new THREE.WebGLRenderer({
      antialias: quality.antialias,
      powerPreference: quality.level === "alto" ? "high-performance" : "default",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatioCap));
    renderer.setSize(width, height);
    renderer.setClearColor(0x05070a, 1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, PLANET_RADIUS * 3);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = PLANET_RADIUS * 1.3;
    controls.maxDistance = PLANET_RADIUS * 8;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    // Once the person actually touches/drags the planet, stop the passive
    // auto-rotation so it doesn't fight their input.
    controls.addEventListener("start", () => {
      controls.autoRotate = false;
    });

    scene.add(new THREE.AmbientLight(0x8899aa, 0.7));
    const sun = new THREE.DirectionalLight(0xfff2d9, 1.1);
    sun.position.set(6, 4, 8);
    scene.add(sun);

    // 1x1 placeholder texture; replaced with real per-cell data on the
    // first frame update effect below (near-instant in practice).
    const placeholderData = new Uint8Array([15, 20, 24, 255]);
    const planetTexture = new THREE.DataTexture(placeholderData, 1, 1, THREE.RGBAFormat);
    planetTexture.flipY = false;
    planetTexture.needsUpdate = true;

    const tiers = tiersForProfile(quality);
    const initialTier = tiers[tiers.length - 1];
    const planetGeometry = new THREE.SphereGeometry(PLANET_RADIUS, initialTier.segmentsWidth, initialTier.segmentsHeight);
    const planetMaterial = new THREE.MeshStandardMaterial({ map: planetTexture, roughness: 0.9, metalness: 0.05 });
    const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
    scene.add(planetMesh);
    // v1.2.2 — pristine copy of the freshly-built sphere's vertex
    // positions, before any displacement is ever applied — see
    // SceneRefs.basePositions's doc comment for why this must never be
    // overwritten with already-displaced data.
    const initialBasePositions = new Float32Array((planetGeometry.attributes.position as THREE.BufferAttribute).array as Float32Array);

    // v1.5.0 — Creature 3D: a creature is a torso, a head, two eyes, a
    // tail, an optional jaw and up to three dorsal spikes, each a separate
    // InstancedMesh (one draw call per part for the whole population). The
    // proportions come from the genome (lib/creatureAnatomy.ts).
    //
    // v1.6.0 — Modalità leggera: the buffers hold only as many creatures as
    // the profile will ever draw, and parts a profile never draws get a
    // one-slot buffer instead of a full one. The lightest profile uses the
    // cheaper Lambert shading.
    const maxCreatures = quality.maxCreatures;
    const capacity = maxCreatures + CREATURE_BUFFER_SLACK;
    const detail = quality.creatureParts;
    const [segW, segH] = quality.creatureSegments;
    const useLambert = quality.level === "basso" || quality.level === "2d";
    const makeMaterial = (opts: { color?: number; roughness?: number; vertexColors?: boolean }) =>
      useLambert
        ? new THREE.MeshLambertMaterial({ ...(opts.color !== undefined ? { color: opts.color } : {}), ...(opts.vertexColors ? { vertexColors: true } : {}) })
        : new THREE.MeshStandardMaterial({ roughness: opts.roughness ?? 0.6, metalness: 0.1, ...(opts.color !== undefined ? { color: opts.color } : {}), ...(opts.vertexColors ? { vertexColors: true } : {}) });
    const makeMesh = (geometry: THREE.BufferGeometry, material: THREE.Material, instances: number, colored: boolean) => {
      const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, instances));
      if (colored) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, instances) * 3), 3);
      mesh.count = 0;
      configureInstancedMesh(mesh);
      scene.add(mesh);
      return mesh;
    };

    const bodyGeometry = addBellyGradient(new THREE.SphereGeometry(1, segW, segH));
    const bodyMaterial = makeMaterial({ roughness: 0.6, vertexColors: true });
    const bodyMesh = makeMesh(bodyGeometry, bodyMaterial, capacity, true);

    const headGeometry = addBellyGradient(new THREE.SphereGeometry(1, Math.max(5, segW - 2), Math.max(3, segH - 2)));
    const headMaterial = makeMaterial({ roughness: 0.55, vertexColors: true });
    const headMesh = makeMesh(headGeometry, headMaterial, capacity, true);

    const eyeGeometry = new THREE.SphereGeometry(1, 6, 4);
    const eyeMaterial = makeMaterial({ color: 0x0b0f14, roughness: 0.25 });
    const eyeMesh = makeMesh(eyeGeometry, eyeMaterial, detail >= 2 ? capacity * 2 : 1, false);

    const tailGeometry = new THREE.ConeGeometry(CONE_BASE_RADIUS, 1, 6);
    const tailMaterial = makeMaterial({ roughness: 0.65 });
    const tailMesh = makeMesh(tailGeometry, tailMaterial, detail >= 2 ? capacity : 1, true);

    const jawGeometry = new THREE.ConeGeometry(CONE_BASE_RADIUS, 1, 5);
    const jawMaterial = makeMaterial({ color: 0xc8553d, roughness: 0.5 });
    const jawMesh = makeMesh(jawGeometry, jawMaterial, detail >= 2 ? capacity : 1, false);

    const spikeGeometry = new THREE.ConeGeometry(CONE_BASE_RADIUS, 1, 5);
    const spikeMaterial = makeMaterial({ roughness: 0.5 });
    const spikeMesh = makeMesh(spikeGeometry, spikeMaterial, detail >= 3 ? capacity * MAX_SPIKES : 1, true);

    // v1.8.0 — zampe (cilindri appesi all'anca), orecchie (coni) e ombra (disco piatto).
    const legGeometry = new THREE.CylinderGeometry(0.8, 1, 1, 5);
    legGeometry.translate(0, -0.5, 0); // l'estremo alto (l'anca) sta in y = 0
    const legMaterial = makeMaterial({ roughness: 0.7 });
    const legMesh = makeMesh(legGeometry, legMaterial, detail >= 2 ? capacity * LEGS_PER_CREATURE : 1, true);
    const earGeometry = new THREE.ConeGeometry(CONE_BASE_RADIUS, 1, 5);
    const earMaterial = makeMaterial({ roughness: 0.6 });
    const earMesh = makeMesh(earGeometry, earMaterial, detail >= 3 ? capacity * 2 : 1, true);
    const shadowGeometry = new THREE.CircleGeometry(1, 14);
    shadowGeometry.rotateX(-Math.PI / 2); // il disco giace nel piano XZ, rivolto verso l'alto
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const shadowMesh = makeMesh(shadowGeometry, shadowMaterial, detail >= 2 ? capacity : 1, false);

    // v1.8.0 — terreno ad alto dettaglio e flora 3D intorno all'animale seguito.
    const local = quality.localTerrainSegments > 0 ? createLocalScene(quality, PLANET_RADIUS) : null;
    if (local) scene.add(local.group);

    // v1.0.4 — highlight ring for the selected organism, hidden by default.
    const ringGeometry = new THREE.TorusGeometry(1, 0.12, 8, 28);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x6bffb0, transparent: true, opacity: 0.9 });
    const selectionRing = new THREE.Mesh(ringGeometry, ringMaterial);
    selectionRing.visible = false;
    scene.add(selectionRing);

    // v1.6.0 — Modalità leggera: watch how long frames really take. If the
    // median stays above ~40 ms (under 25 fps) after the first moments of
    // warm-up, tell the page, which (in automatic mode) steps the quality
    // down. Frames longer than a second are ignored: those are the tab being
    // hidden, not the device being slow.
    const WARMUP_FRAMES = 90;
    const CHECK_EVERY_FRAMES = 90;
    const frameTimes: number[] = [];
    let framesSeen = 0;
    let lastFrameAt = 0;
    let animationFrameId = 0;

    // v1.7.0 — Terza persona. In modalità "follow" la camera non è più
    // governata da OrbitControls (che a ogni update() riporterebbe la camera
    // sulla sua orbita): la posa viene calcolata da updateFollowCamera.
    const follow = createFollowState();
    let followActive = false;
    const enterFollow = () => {
      followActive = true;
      controls.enabled = false;
      controls.autoRotate = false;
      camera.near = FOLLOW_NEAR_PLANE;
      camera.updateProjectionMatrix();
      resetFollowState(follow);
      // v1.8.0 — Da vicino il pianeta diventa un mondo: cielo e foschia atmosferica, terreno locale
      // ad alto dettaglio con le sue piante, e la mesh globale spinta indietro in profondità.
      renderer.setClearColor(SKY_COLOR, 1);
      scene.fog = new THREE.Fog(SKY_COLOR, FOLLOW_FOG_NEAR, FOLLOW_FOG_FAR);
      planetMaterial.polygonOffset = true;
      planetMaterial.polygonOffsetFactor = 2;
      planetMaterial.polygonOffsetUnits = 2;
      local?.setVisible(true);
      localCenter = null;
      lastLocalAt = 0;
    };
    const leaveFollow = () => {
      followActive = false;
      // Riporta la camera sull'orbita, nella direzione da cui guardava, a distanza di vista dall'alto.
      if (camera.position.lengthSq() < 1e-9) camera.position.set(0, 0, 1);
      camera.position.setLength(PLANET_RADIUS * 3);
      camera.up.set(0, 1, 0);
      camera.near = ORBIT_NEAR_PLANE;
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0);
      controls.enabled = true;
      controls.update();
      renderer.setClearColor(SPACE_COLOR, 1);
      scene.fog = null;
      planetMaterial.polygonOffset = false;
      sun.position.set(...SUN_ORBIT_POSITION);
      local?.setVisible(false);
      local?.clear();
      // l'ultimo ViewportFrame era locale: si torna a chiedere quello del pianeta intero
      maybeRequestViewport(true);
    };

    const renderLoop = (nowMs: number) => {
      const wantFollow = cameraModeRef.current === "follow";
      if (wantFollow && !followActive) enterFollow();
      else if (!wantFollow && followActive) leaveFollow();

      if (followActive) {
        const refs = sceneRef.current;
        const f = frameRef.current;
        const id = selectedIdRef.current;
        if (refs && f && id !== null) {
          const dt = lastFrameAt > 0 ? Math.min(nowMs - lastFrameAt, 250) : 0;
          const replacement = updateFollowCamera(refs, f, id, follow, nowMs, dt);
          if (replacement !== null) onSelectRef.current?.(replacement);
          // Il sole segue chi guarda: dall'altra parte del pianeta sarebbe notte e non si vedrebbe niente.
          placeFollowSun(sun, camera.position, follow.target, follow.up);
        }
      } else {
        controls.update();
      }
      renderer.render(scene, camera);
      if (lastFrameAt > 0) {
        const dt = nowMs - lastFrameAt;
        framesSeen++;
        if (framesSeen > WARMUP_FRAMES && dt < 1000) {
          frameTimes.push(dt);
          if (frameTimes.length >= CHECK_EVERY_FRAMES) {
            if (shouldDowngrade(frameTimes)) onSlowRef.current?.();
            frameTimes.length = 0;
          }
        }
      }
      lastFrameAt = nowMs;
      animationFrameId = requestAnimationFrame(renderLoop);
    };
    animationFrameId = requestAnimationFrame(renderLoop);

    // v1.1 — World Scale: periodically decide whether the terrain texture
    // needs a (re)paint, either because the camera crossed into a
    // different LOD tier (zoomed meaningfully in/out) or because enough
    // time has passed that a periodic refresh is worthwhile (vegetation
    // keeps changing near active populations). Deliberately NOT tied to
    // the render loop's per-frame cadence or to the simulation's per-tick
    // RenderFrame — see TERRAIN_LOD_CHECK_INTERVAL_MS and the profile's terrainRefreshMs.
    let lastTierKey = "";
    let lastRequestAt = 0;
    const maybeRequestViewport = (force: boolean) => {
      const f = frameRef.current;
      if (!f || !onRequestViewportRef.current) return;
      // In terza persona il pianeta intero non serve: c'è il terreno locale (maybeRequestLocal).
      if (followActive) return;
      const distance = controls.getDistance();
      const tier = pickTerrainLodTier(distance, tiers);
      const tierKey = `${tier.maxWidth}x${tier.maxHeight}`;
      const now = Date.now();
      const dueForRefresh = now - lastRequestAt >= quality.terrainRefreshMs;
      if (!force && tierKey === lastTierKey && !dueForRefresh) return;
      lastTierKey = tierKey;
      lastRequestAt = now;
      onRequestViewportRef.current({
        centerX: f.planetWidth / 2,
        centerY: f.planetHeight / 2,
        radiusX: f.planetWidth / 2,
        radiusY: f.planetHeight / 2,
        maxWidth: tier.maxWidth,
        maxHeight: tier.maxHeight,
      });
    };
    const lodCheckHandle = setInterval(() => maybeRequestViewport(false), TERRAIN_LOD_CHECK_INTERVAL_MS);

    // v1.8.0 — Terreno locale. In terza persona si chiede, a ritmo moderato, una piccola area
    // intorno all'animale (alla risoluzione delle celle). Si richiede di nuovo quando l'animale
    // si è allontanato dal centro dell'area o dopo LOCAL_REFRESH_MS, per aggiornare la vegetazione.
    let localCenter: { x: number; y: number } | null = null;
    let lastLocalAt = 0;
    const maybeRequestLocal = () => {
      if (!followActive || !local || !follow.hasPosition) return;
      const f = frameRef.current;
      if (!f || !onRequestViewportRef.current) return;
      const radius = localPatchRadiusCells(f.planetWidth, PLANET_RADIUS, LOCAL_PATCH_HALF_UNITS);
      const now = Date.now();
      if (now - lastLocalAt < LOCAL_MIN_INTERVAL_MS) return;
      const moved = localCenter ? Math.hypot(wrappedDelta(localCenter.x, follow.x, f.planetWidth), wrappedDelta(localCenter.y, follow.y, f.planetHeight)) : Infinity;
      if (localCenter && moved < radius * LOCAL_RECENTER_FRACTION && now - lastLocalAt < LOCAL_REFRESH_MS) return;
      localCenter = { x: Math.round(follow.x), y: Math.round(follow.y) };
      lastLocalAt = now;
      onRequestViewportRef.current({
        centerX: localCenter.x,
        centerY: localCenter.y,
        radiusX: radius,
        radiusY: radius,
        maxWidth: radius * 2,
        maxHeight: radius * 2,
      });
    };
    const localCheckHandle = setInterval(maybeRequestLocal, LOCAL_CHECK_INTERVAL_MS);

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    sceneRef.current = {
      renderer,
      scene,
      camera,
      controls,
      planetMesh,
      planetTexture,
      textureData: placeholderData,
      basePositions: initialBasePositions,
      currentSegmentsWidth: initialTier.segmentsWidth,
      heightmap: null,
      capacity,
      maxCreatures,
      detail,
      bodyMesh,
      headMesh,
      eyeMesh,
      tailMesh,
      jawMesh,
      spikeMesh,
      legMesh,
      earMesh,
      shadowMesh,
      local,
      creatureTrack: new Map(),
      selectionRing,
      instanceOrganismId: new Uint32Array(capacity),
    };

    // v1.0.4 — tap/click selection. A pointerdown/pointerup pair is only
    // treated as a tap (not a drag-to-rotate) if the pointer barely moved.
    let pointerDownPos: { x: number; y: number } | null = null;
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    // v1.7.0 — trascinando in terza persona si gira intorno all'animale.
    let lastMovePos: { x: number; y: number } | null = null;

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      lastMovePos = { x: e.clientX, y: e.clientY };
      follow.dragging = true;
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!followActive || !lastMovePos) return;
      const dx = e.clientX - lastMovePos.x;
      const dy = e.clientY - lastMovePos.y;
      lastMovePos = { x: e.clientX, y: e.clientY };
      applyFollowDrag(follow, dx, dy, performance.now());
    };

    const handlePointerEnd = () => {
      lastMovePos = null;
      follow.dragging = false;
      follow.lastInteractAt = performance.now();
    };

    const handlePointerUp = (e: PointerEvent) => {
      handlePointerEnd();
      if (!pointerDownPos) return;
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      pointerDownPos = null;
      if (Math.sqrt(dx * dx + dy * dy) > TAP_MOVEMENT_THRESHOLD_PX) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObject(bodyMesh);
      if (hits.length > 0 && hits[0].instanceId !== undefined && sceneRef.current) {
        const organismId = sceneRef.current.instanceOrganismId[hits[0].instanceId];
        onSelectRef.current?.(organismId);
      } else if (!followActive) {
        // In terza persona un tocco sul vuoto non deseleziona: si smette di seguire dal pulsante.
        onSelectRef.current?.(null);
      }
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(lodCheckHandle);
      clearInterval(localCheckHandle);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerEnd);
      controls.dispose();
      sceneRef.current?.planetMesh.geometry.dispose();
      planetMaterial.dispose();
      sceneRef.current?.planetTexture.dispose();
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      headGeometry.dispose();
      headMaterial.dispose();
      eyeGeometry.dispose();
      eyeMaterial.dispose();
      tailGeometry.dispose();
      tailMaterial.dispose();
      jawGeometry.dispose();
      jawMaterial.dispose();
      spikeGeometry.dispose();
      spikeMaterial.dispose();
      legGeometry.dispose();
      legMaterial.dispose();
      earGeometry.dispose();
      earMaterial.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();
      local?.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
    // Intentionally mount-only: the scene/renderer/meshes are built once
    // and mutated in place by the effect below on every new frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Per-frame: update creature instances and reposition the selection
  // ring from the latest RenderFrame — without rebuilding any Three.js
  // objects. v1.1 — no longer repaints the terrain texture here (that's
  // driven by viewportFrame below, on its own on-demand cadence).
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs || !frame) return;

    // v1.7.0 — in terza persona l'animale seguito va sempre disegnato (anche se il
    // campionamento per densità lo escluderebbe) e non ha l'anello di selezione.
    const following = cameraMode === "follow";
    updateCreatureInstances(refs, frame, following ? selectedIdRef.current : null, following ? FOLLOW_CREATURE_RANGE_UNITS : null);
    updateSelectionRing(refs, frame, following ? null : selectedIdRef.current);
  }, [frame, cameraMode]);

  // v1.1 — repaints the terrain texture only when a new ViewportFrame
  // arrives (on LOD-tier change or periodic refresh — see the mount
  // effect above), never on the simulation's per-tick cadence. The
  // texture's resolution matches the ViewportFrame's own (bounded, fixed
  // LOD-tier) size, not the planet's actual width/height, so a much
  // larger world costs exactly the same to paint here.
  //
  // v1.2.2 — Real 3D Surface: the same effect also (a) rebuilds the
  // sphere geometry at a new tessellation if the LOD tier changed (see
  // rebuildPlanetGeometry below — tessellation is keyed off texWidth,
  // which is unique per tier), and (b) displaces every vertex along its
  // own outward normal by elevationDisplacement(...), sampled from this
  // same viewport payload — never a per-vertex simulation query, never a
  // per-cell Three.js object. Runs only on this same on-demand cadence,
  // not per animation frame, keeping the CPU cost of displacement (and
  // the mandatory computeVertexNormals() afterward, for correct lighting
  // on the now-uneven surface) bounded by how often the viewport actually
  // refreshes rather than by the render loop.
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs || !viewportFrame) return;

    // v1.8.0 — Un ViewportFrame di una piccola area non è la texture del pianeta: alimenta
    // il terreno locale e la flora, e lascia stare la mesh globale e l'altezza di riferimento.
    const currentFrame = frameRef.current;
    if (currentFrame && isLocalViewport(viewportFrame, currentFrame.planetWidth)) {
      refs.local?.update(
        viewportFrame,
        currentFrame.planetWidth,
        currentFrame.planetHeight,
        viewportFrame.originX + viewportFrame.cellsWidth / 2,
        viewportFrame.originY + viewportFrame.cellsHeight / 2,
      );
      return;
    }

    const { texWidth, texHeight, vegetation, terrain, elevation, riverFlow, lake, temperature, planetHeight, tick, originX, originY, cellsWidth, cellsHeight } = viewportFrame;

    const sizeChanged = lastTextureSize.current?.width !== texWidth || lastTextureSize.current?.height !== texHeight;
    if (sizeChanged) {
      const newData = new Uint8Array(texWidth * texHeight * 4);
      const newTexture = new THREE.DataTexture(newData, texWidth, texHeight, THREE.RGBAFormat);
      newTexture.flipY = false;
      const material = refs.planetMesh.material as THREE.MeshStandardMaterial;
      material.map = newTexture;
      material.needsUpdate = true;
      refs.planetTexture.dispose();
      refs.planetTexture = newTexture;
      refs.textureData = newData;
      lastTextureSize.current = { width: texWidth, height: texHeight };
    }

    const data = refs.textureData;
    // v1.3.0 — Stagioni: each texel's own season (mirrored in the southern
    // hemisphere) drives its snow / sea ice / autumn tint.
    const yearPhase = (tick % TICKS_PER_YEAR) / TICKS_PER_YEAR;
    for (let i = 0; i < texWidth * texHeight; i++) {
      const ty = Math.floor(i / texWidth);
      const worldY = (((originY + ((ty + 0.5) / texHeight) * cellsHeight) % planetHeight) + planetHeight) % planetHeight;
      const seasonPhase = worldY < planetHeight / 2 ? yearPhase : (yearPhase + 0.5) % 1;
      const [r, g, b] = applySeasonalTintRGB(
        applyWaterOverlayRGB(terrainColorRGB(terrain[i], vegetation[i]), riverFlow[i], lake[i] === 1),
        terrain[i],
        vegetation[i],
        temperature[i],
        seasonPhase,
      );
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
    }
    refs.planetTexture.needsUpdate = true;

    // v1.2.2 — rebuild the mesh at a new tessellation only when the LOD
    // tier genuinely changed (texWidth uniquely identifies a tier — see
    // TERRAIN_LOD_TIERS), not on every periodic refresh at the same tier.
    const tier = TERRAIN_LOD_TIERS.find((t) => t.maxWidth === texWidth) ?? TERRAIN_LOD_TIERS[TERRAIN_LOD_TIERS.length - 1];
    if (tier.segmentsWidth !== refs.currentSegmentsWidth) {
      const newGeometry = new THREE.SphereGeometry(PLANET_RADIUS, tier.segmentsWidth, tier.segmentsHeight);
      refs.planetMesh.geometry.dispose();
      refs.planetMesh.geometry = newGeometry;
      refs.basePositions = new Float32Array((newGeometry.attributes.position as THREE.BufferAttribute).array as Float32Array);
      refs.currentSegmentsWidth = tier.segmentsWidth;
    }

    // v1.2.2 — the actual vertex displacement: for every vertex, sample
    // elevation (bilinear, for a smooth surface) and terrain (nearest, to
    // detect ocean) at that vertex's own longitude/latitude, and push it
    // outward/inward from PLANET_RADIUS along its own pristine direction.
    const positionAttr = refs.planetMesh.geometry.attributes.position as THREE.BufferAttribute;
    const base = refs.basePositions;
    const positions = positionAttr.array as Float32Array;
    let sawNonFinite = false;
    for (let i = 0; i < base.length; i += 3) {
      const bx = base[i];
      const by = base[i + 1];
      const bz = base[i + 2];
      const dirLength = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
      const dirX = bx / dirLength;
      const dirY = by / dirLength;
      const dirZ = bz / dirLength;
      // Recover the same (gridX, gridY) this vertex's direction corresponds
      // to, inverting projectToSphere's own theta/phi convention, so the
      // heightmap sample lines up with the already-correct color texture.
      const phi = Math.acos(Math.max(-1, Math.min(1, dirY)));
      let theta = Math.atan2(dirZ, -dirX);
      if (theta < 0) theta += Math.PI * 2;
      // Note: this assumes the viewport spans the whole planet
      // (originX=0, cellsWidth=planetWidth), which is the only mode the
      // mount effect above ever requests (see maybeRequestViewport) — a
      // future closer-flyover camera requesting a sub-region would need
      // this inverse mapping revisited.
      const gridX = (theta / (Math.PI * 2)) * cellsWidth + originX;
      const gridY = (phi / Math.PI) * cellsHeight + originY;

      const sampledElevation = sampleViewportChannelBilinear(gridX, gridY, elevation, originX, originY, cellsWidth, cellsHeight, texWidth, texHeight);
      const isOcean = sampleViewportTerrainIsOcean(gridX, gridY, terrain, originX, originY, cellsWidth, cellsHeight, texWidth, texHeight);
      const displacement = elevationDisplacement(sampledElevation, isOcean);
      const newRadius = PLANET_RADIUS + displacement;

      const px = dirX * newRadius;
      const py = dirY * newRadius;
      const pz = dirZ * newRadius;
      if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
        sawNonFinite = true;
        continue; // leave this vertex at its last valid position rather than corrupting the mesh
      }
      positions[i] = px;
      positions[i + 1] = py;
      positions[i + 2] = pz;
    }
    if (sawNonFinite && process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("Planet3DView: non-finite vertex displacement encountered and skipped.");
    }
    positionAttr.needsUpdate = true;
    refs.planetMesh.geometry.computeVertexNormals();

    // v1.2.2 — shared with updateCreatureInstances/updateSelectionRing
    // below, so creatures rest on the same displaced surface without any
    // growth to the per-tick RenderFrame payload.
    refs.heightmap = { elevation, terrain, originX, originY, cellsWidth, cellsHeight, texWidth, texHeight };
  }, [viewportFrame]);

  return (
    <div className="canvas-wrap">
      <div
        ref={containerRef}
        className="planet-canvas planet-canvas-3d"
        role="img"
        aria-label={
          cameraMode === "follow"
            ? "Vista in terza persona su un animale — trascina per guardarti intorno, tocca un altro animale per seguirlo"
            : "Visualizzazione 3D del pianeta simulato — trascina per ruotare, tocca una creatura per selezionarla"
        }
      />
      <ul className="biome-legend" aria-label="Legenda dei biomi">
        {Object.entries(TERRAIN_LABELS).map(([code, label]) => (
          <li key={code}>
            <span className="swatch" style={{ background: TERRAIN_SWATCHES[Number(code)] }} />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * v1.2.2 — Real 3D Surface: resting radius for a creature/marker at a
 * given world (x, y), sampled from the same on-demand viewport heightmap
 * already used to displace the terrain mesh (see the [viewportFrame]
 * effect above) — never a per-tick simulation query, so this adds zero
 * bytes to RenderFrame. `restOffset` is the small existing "hover above
 * the ground" gap (0.02 for bodies, 0.05 for the selection ring, both
 * pre-existing since v0.7/v1.0.4) preserved on top of the terrain height.
 * Falls back to flat PLANET_RADIUS + restOffset if no viewport data has
 * arrived yet (e.g. the very first frame), exactly matching pre-v1.2.2
 * behavior in that case.
 */
function restingRadius(refs: Pick<SceneRefs, "heightmap"> & Partial<Pick<SceneRefs, "local">>, worldX: number, worldY: number, restOffset: number): number {
  // v1.8.0 — dentro il terreno locale si poggia sulla stessa superficie che è disegnata (stessa funzione dei vertici).
  const ground = refs.local?.ground;
  if (ground && groundContains(ground, worldX, worldY, 1)) return groundRadius(ground, worldX, worldY, PLANET_RADIUS) + restOffset;
  const hm = refs.heightmap;
  if (!hm) return PLANET_RADIUS + restOffset;
  const elevation = sampleViewportElevationNearest(worldX, worldY, hm.elevation, hm.originX, hm.originY, hm.cellsWidth, hm.cellsHeight, hm.texWidth, hm.texHeight);
  const isOcean = sampleViewportTerrainIsOcean(worldX, worldY, hm.terrain, hm.originX, hm.originY, hm.cellsWidth, hm.cellsHeight, hm.texWidth, hm.texHeight);
  return PLANET_RADIUS + elevationDisplacement(elevation, isOcean) + restOffset;
}

/** Writes `parent * local(position, rotation, scale)` into `mesh` instance `index`. */
function setPart(
  mesh: THREE.InstancedMesh,
  index: number,
  parent: THREE.Matrix4,
  px: number,
  py: number,
  pz: number,
  rotation: THREE.Quaternion,
  sx: number,
  sy: number,
  sz: number,
): void {
  tmpLocalPos.set(px, py, pz);
  tmpLocalScale.set(sx, sy, sz);
  tmpLocal.compose(tmpLocalPos, rotation, tmpLocalScale);
  tmpPartMatrix.multiplyMatrices(parent, tmpLocal);
  mesh.setMatrixAt(index, tmpPartMatrix);
}

/**
 * v1.8.0 — Ogni InstancedMesh va esclusa dal frustum culling. Three.js ne calcola
 * la sfera di ingombro una volta sola, quando ha ancora zero istanze: resta una
 * sfera vuota al centro del pianeta. Dalla vista dall'alto il centro è
 * inquadrato e non succede nulla; in terza persona è fuori campo e l'intera
 * mesh (cioè tutti gli animali) sparirebbe dallo schermo.
 */
export function configureInstancedMesh(mesh: THREE.InstancedMesh): void {
  mesh.frustumCulled = false;
}

/**
 * v1.8.0 — Sfumatura ventre-dorso: colori per vertice (1 sul ventre, più scuro sul
 * dorso) che il materiale moltiplica per il colore della specie. Dà volume alle
 * sfere che formano il corpo senza nessuna istanza o luce in più.
 */
export function addBellyGradient(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i); // sfera unitaria: -1 ventre, +1 dorso
    const shade = 1 - 0.22 * ((y + 1) / 2);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const sunDir = new THREE.Vector3();
const sunSide = new THREE.Vector3();

/** v1.8.0 — In terza persona il sole sta sopra chi guarda, un po' di lato, così il suolo è sempre illuminato. */
export function placeFollowSun(sun: THREE.DirectionalLight, cameraPosition: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3): void {
  sunDir.copy(target).sub(cameraPosition);
  if (sunDir.lengthSq() < 1e-12) sunDir.set(0, 0, -1);
  sunDir.normalize();
  sunSide.crossVectors(up, sunDir);
  sun.position.copy(target).addScaledVector(up, 7).addScaledVector(sunDir, -2).addScaledVector(sunSide, 3);
}

/**
 * v1.7.0 — Terza persona. Stato della camera che segue un animale: cosa sta
 * seguendo, dove l'ha visto l'ultima volta, la sua direzione di marcia e la
 * posa (già smorzata) della camera.
 */
export interface FollowState {
  id: number | null;
  /** L'ultimo RenderFrame in cui è stato cercato l'animale (si cerca una volta per frame). */
  frame: RenderFrame | null;
  x: number;
  y: number;
  size: number;
  hasPosition: boolean;
  heading: Heading | null;
  hasPose: boolean;
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  yaw: number;
  pitch: number;
  dragging: boolean;
  lastInteractAt: number;
  /** Da quando (ms) l'animale non c'è più nei frame, o null. */
  missingSince: number | null;
}

export function createFollowState(): FollowState {
  return {
    id: null,
    frame: null,
    x: 0,
    y: 0,
    size: 1,
    hasPosition: false,
    heading: null,
    hasPose: false,
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    yaw: 0,
    pitch: 0,
    dragging: false,
    lastInteractAt: 0,
    missingSince: null,
  };
}

/** Riporta lo stato come all'inizio (all'ingresso in terza persona). */
export function resetFollowState(state: FollowState): void {
  state.id = null;
  state.frame = null;
  state.hasPosition = false;
  state.heading = null;
  state.hasPose = false;
  state.yaw = 0;
  state.pitch = 0;
  state.dragging = false;
  state.missingSince = null;
}

/** Un trascinamento di (dx, dy) pixel gira la camera intorno all'animale. */
export function applyFollowDrag(state: FollowState, dx: number, dy: number, nowMs: number): void {
  state.yaw += dx * FOLLOW_YAW_PER_PX;
  state.yaw = Math.atan2(Math.sin(state.yaw), Math.cos(state.yaw));
  state.pitch = Math.min(FOLLOW_PITCH_MAX, Math.max(FOLLOW_PITCH_MIN, state.pitch + dy * FOLLOW_PITCH_PER_PX));
  state.lastInteractAt = nowMs;
}

const fcNormal = new THREE.Vector3();
const fcTangent = new THREE.Vector3();
const fcDesired = new THREE.Vector3();
const fcDesiredTarget = new THREE.Vector3();

/**
 * Posiziona la camera dietro e sopra l'animale `selectedId`, guardando
 * leggermente davanti a lui. Va chiamata a ogni frame di rendering mentre la
 * modalità è "terza persona". Restituisce l'id di un altro animale se quello
 * seguito è sparito (morto) da troppo tempo — il chiamante lo seleziona —,
 * altrimenti null. Finché l'animale manca la camera resta dove l'ha visto.
 */
export function updateFollowCamera(
  refs: Pick<SceneRefs, "camera" | "heightmap"> & Partial<Pick<SceneRefs, "local">>,
  frame: RenderFrame,
  selectedId: number,
  state: FollowState,
  nowMs: number,
  dtMs: number,
): number | null {
  const { planetWidth, planetHeight } = frame;

  if (state.id !== selectedId) {
    state.id = selectedId;
    state.frame = null;
    state.heading = null;
    state.hasPosition = false;
    state.missingSince = null;
  }

  // Si cerca l'animale una sola volta per frame della simulazione.
  if (state.frame !== frame) {
    state.frame = frame;
    let index = -1;
    for (let k = 0; k < frame.organismsId.length; k++) {
      if (frame.organismsId[k] === selectedId) {
        index = k;
        break;
      }
    }
    if (index >= 0) {
      const x = frame.organismsX[index];
      const y = frame.organismsY[index];
      if (state.hasPosition) {
        state.heading = nextHeading(state.heading, wrappedDelta(state.x, x, planetWidth), wrappedDelta(state.y, y, planetHeight));
      }
      state.x = x;
      state.y = y;
      state.size = frame.organismsSize[index];
      state.hasPosition = true;
      state.missingSince = null;
    } else if (state.hasPosition && state.missingSince === null) {
      state.missingSince = nowMs;
    }
  }

  let replacement: number | null = null;
  if (state.missingSince !== null && nowMs - state.missingSince > FOLLOW_LOST_TARGET_MS) {
    replacement = nearestOrganismId(frame, state.x, state.y, selectedId);
    state.missingSince = nowMs; // riprova solo dopo un altro intervallo, se non c'era nessuno
  }

  if (!state.hasPosition) return replacement;

  // Dopo un po' senza tocchi la camera torna dietro l'animale.
  if (!state.dragging && nowMs - state.lastInteractAt > FOLLOW_RECENTER_DELAY_MS && (state.yaw !== 0 || state.pitch !== 0)) {
    const a = dampingAlpha(dtMs, FOLLOW_RECENTER_TIME_MS);
    state.yaw = easeAngleToZero(state.yaw, a);
    state.pitch = Math.abs(state.pitch * (1 - a)) < 1e-4 ? 0 : state.pitch * (1 - a);
  }

  const scale = creatureScale(state.size);
  const restingR = restingRadius(refs, state.x, state.y, 0.02);
  const point = projectToSphere(state.x, state.y, planetWidth, planetHeight, restingR);
  fcNormal.set(point.normalX, point.normalY, point.normalZ);
  const ahead = projectToSphere(state.x + (state.heading?.hx ?? 0) * 0.5, state.y + (state.heading?.hy ?? -1) * 0.5, planetWidth, planetHeight, restingR);
  fcTangent.set(ahead.x - point.x, ahead.y - point.y, ahead.z - point.z);
  fcTangent.addScaledVector(fcNormal, -fcTangent.dot(fcNormal));
  if (fcTangent.lengthSq() < 1e-12) {
    fcTangent.crossVectors(fcNormal, Math.abs(fcNormal.y) < 0.9 ? UP : tmpRight.set(1, 0, 0));
  }
  fcTangent.normalize();

  const pose = computeFollowPose({
    point: [point.x, point.y, point.z],
    normal: [fcNormal.x, fcNormal.y, fcNormal.z],
    forward: [fcTangent.x, fcTangent.y, fcTangent.z],
    scale,
    yaw: state.yaw,
    pitch: state.pitch,
  });

  // La camera non deve finire dentro una collina.
  const grid = directionToGrid(pose.position, planetWidth, planetHeight);
  const minRadius = restingRadius(refs, grid.x, grid.y, 0) + cameraClearance(scale);
  const cam: Vec3 = clampCameraRadius(pose.position, minRadius);

  fcDesired.set(cam[0], cam[1], cam[2]);
  fcDesiredTarget.set(pose.target[0], pose.target[1], pose.target[2]);

  if (!state.hasPose || state.position.distanceTo(fcDesired) > FOLLOW_SNAP_DISTANCE) {
    state.position.copy(fcDesired);
    state.target.copy(fcDesiredTarget);
    state.up.copy(fcNormal);
    state.hasPose = true;
  } else {
    const a = dampingAlpha(dtMs, FOLLOW_SMOOTHING_MS);
    state.position.lerp(fcDesired, a);
    state.target.lerp(fcDesiredTarget, a);
    state.up.lerp(fcNormal, a).normalize();
  }

  refs.camera.position.copy(state.position);
  refs.camera.up.copy(state.up);
  refs.camera.lookAt(state.target);
  return replacement;
}

/**
 * v1.5.0 — Creature 3D. Each drawn creature is placed on the (displaced)
 * surface, oriented with its feet on the ground and its nose toward the
 * direction it has been moving, and built from the parts of its genome-
 * derived anatomy (torso, head, eyes, tail, jaw, spikes). Everything
 * about its shape is a pure function of its traits (lib/creatureAnatomy.ts),
 * so an evolving species visibly changes body over generations.
 */
export function updateCreatureInstances(
  refs: SceneRefs,
  frame: RenderFrame,
  forceOrganismId: number | null = null,
  /** v1.9.0 — se indicato (e c'è un animale obbligato), si disegnano solo le creature entro questo raggio da lui. */
  cullRangeUnits: number | null = null,
): void {
  const {
    organismsX,
    organismsY,
    organismsSpecies,
    organismsSize,
    organismsSpeed,
    organismsCarnivory,
    organismsVision,
    organismsEvasion,
    organismsHuntingSkill,
    organismsId,
    planetWidth,
    planetHeight,
  } = frame;

  const populationAll = organismsX.length;

  // v1.7.0 — un animale "obbligato" (quello seguito in terza persona) viene
  // disegnato anche se il campionamento a passo fisso non lo includerebbe.
  let forcedIndex = -1;
  if (forceOrganismId !== null) {
    for (let k = 0; k < populationAll; k++) {
      if (organismsId[k] === forceOrganismId) {
        forcedIndex = k;
        break;
      }
    }
  }

  // v1.9.0 — in terza persona la foschia e la curvatura del pianeta nascondono tutto ciò che è lontano:
  // si elaborano e si disegnano solo le creature vicine, e il campionamento si fa su quelle (più dettaglio vicino).
  let candidates: Int32Array | null = null;
  let population = populationAll;
  if (cullRangeUnits !== null && cullRangeUnits > 0 && forcedIndex >= 0) {
    candidates = ensureCandidateBuffer(populationAll);
    population = collectNearbyOrganisms(candidates, organismsX, organismsY, populationAll, organismsX[forcedIndex], organismsY[forcedIndex], planetWidth, planetHeight, cullRangeUnits, PLANET_RADIUS);
  }

  const stride = computeRenderStride(population, refs.maxCreatures);
  const generation = ++trackGeneration;
  const cellUnits = (2 * Math.PI * PLANET_RADIUS) / Math.max(1, planetWidth);

  let extraIndex = -1;
  if (forcedIndex >= 0 && stride > 1) {
    let position = forcedIndex;
    if (candidates) {
      position = -1;
      for (let p = 0; p < population; p++) {
        if (candidates[p] === forcedIndex) {
          position = p;
          break;
        }
      }
    }
    if (position >= 0 && position % stride !== 0) extraIndex = forcedIndex;
  }

  let writeIndex = 0;
  for (let step = 0; writeIndex < refs.capacity; step++) {
    const sampled = step * stride;
    let i: number;
    if (sampled >= population) {
      if (extraIndex < 0) break;
      i = extraIndex;
      extraIndex = -1;
    } else {
      i = candidates ? candidates[sampled] : sampled;
    }
    const id = organismsId[i];
    const x = organismsX[i];
    const y = organismsY[i];

    const restingR = restingRadius(refs, x, y, 0.02);
    const point = projectToSphereInto(tmpPoint, x, y, planetWidth, planetHeight, restingR);
    tmpPosition.set(point.x, point.y, point.z);
    tmpNormal.set(point.normalX, point.normalY, point.normalZ);

    // Heading: face the way this creature has moved since the last frame
    // (keeps its previous heading while it stands still; first sight of a
    // creature faces north until it moves).
    let track = refs.creatureTrack.get(id);
    let walking = false;
    if (track) {
      const dxCells = wrappedDelta(track.x, x, planetWidth);
      const dyCells = wrappedDelta(track.y, y, planetHeight);
      advanceHeading(track, dxCells, dyCells);
      // v1.8.0 — il passo avanza con la strada fatta: una falcata (mezzo ciclo) ogni ~1,6 lunghezze di corpo.
      const travelled = Math.hypot(dxCells, dyCells) * cellUnits;
      walking = travelled > 1e-5;
      track.phase = (track.phase + (travelled / (creatureScale(organismsSize[i]) * 1.6)) * Math.PI) % (Math.PI * 2);
      track.x = x;
      track.y = y;
    } else {
      track = { x, y, hasHeading: false, hx: 0, hy: -1, phase: 0, gen: 0, anatomy: null, aSpeed: 0, aCarnivory: 0, aVision: 0, aEvasion: 0, aHunting: 0 };
      refs.creatureTrack.set(id, track);
    }
    track.gen = generation;
    const phase = track.phase;
    const ahead = projectToSphereInto(tmpAhead, x + (track.hasHeading ? track.hx : 0) * 0.5, y + (track.hasHeading ? track.hy : -1) * 0.5, planetWidth, planetHeight, restingR);
    tmpTangent.set(ahead.x - point.x, ahead.y - point.y, ahead.z - point.z);
    tmpTangent.addScaledVector(tmpNormal, -tmpTangent.dot(tmpNormal));
    if (tmpTangent.lengthSq() < 1e-12) {
      // Degenerate (e.g. exactly at a pole): any direction along the surface will do.
      tmpTangent.crossVectors(tmpNormal, Math.abs(tmpNormal.y) < 0.9 ? UP : tmpRight.set(1, 0, 0));
    }
    tmpTangent.normalize();
    tmpRight.crossVectors(tmpNormal, tmpTangent);
    tmpBasis.makeBasis(tmpRight, tmpNormal, tmpTangent);
    tmpQuaternion.setFromRotationMatrix(tmpBasis);

    // v1.9.0 — l'anatomia dipende solo dai geni: si ricalcola solo se sono cambiati.
    const gSpeed = organismsSpeed[i];
    const gCarnivory = organismsCarnivory[i];
    const gVision = organismsVision[i];
    const gEvasion = organismsEvasion[i];
    const gHunting = organismsHuntingSkill[i];
    let anatomy = track.anatomy;
    if (!anatomy || track.aSpeed !== gSpeed || track.aCarnivory !== gCarnivory || track.aVision !== gVision || track.aEvasion !== gEvasion || track.aHunting !== gHunting) {
      anatomy = computeCreatureAnatomy({ speed: gSpeed, carnivory: gCarnivory, vision: gVision, evasion: gEvasion, huntingSkill: gHunting });
      track.anatomy = anatomy;
      track.aSpeed = gSpeed;
      track.aCarnivory = gCarnivory;
      track.aVision = gVision;
      track.aEvasion = gEvasion;
      track.aHunting = gHunting;
    }

    const baseScale = creatureScale(organismsSize[i]);
    tmpScale.set(baseScale, baseScale, baseScale);
    tmpCreatureMatrix.compose(tmpPosition, tmpQuaternion, tmpScale);

    // Senza zampe (dettaglio 1) il torso è affondato di un quinto della sua altezza nel suolo, così una creatura non sembra
    // mai fluttuare sul terreno irregolare. Con le zampe (v1.8.0) il corpo sta alla loro altezza, con i piedi sul suolo.
    const hasLegs = refs.detail >= 2;
    const lift = hasLegs ? anatomy.legLength * 0.97 + anatomy.bodyHalfHeight * 0.4 : anatomy.bodyHalfHeight * 0.8;

    setPart(refs.bodyMesh, writeIndex, tmpCreatureMatrix, 0, lift, 0, Q_IDENTITY, anatomy.bodyHalfWidth, anatomy.bodyHalfHeight, anatomy.bodyHalfLength);
    setPart(refs.headMesh, writeIndex, tmpCreatureMatrix, 0, lift + anatomy.headY, anatomy.headZ, Q_IDENTITY, anatomy.headRadius, anatomy.headRadius, anatomy.headRadius);
    // v1.6.0 — lighter profiles skip the finer parts entirely: eyes, tail
    // and jaw from detail 2, dorsal spikes only at detail 3.
    if (refs.detail >= 2) {
      setPart(refs.eyeMesh, writeIndex * 2, tmpCreatureMatrix, -anatomy.eyeX, lift + anatomy.eyeY, anatomy.eyeZ, Q_IDENTITY, anatomy.eyeRadius, anatomy.eyeRadius, anatomy.eyeRadius);
      setPart(refs.eyeMesh, writeIndex * 2 + 1, tmpCreatureMatrix, anatomy.eyeX, lift + anatomy.eyeY, anatomy.eyeZ, Q_IDENTITY, anatomy.eyeRadius, anatomy.eyeRadius, anatomy.eyeRadius);
      setPart(refs.tailMesh, writeIndex, tmpCreatureMatrix, 0, lift, anatomy.tailZ, Q_TIP_BACK, anatomy.tailRadius / CONE_BASE_RADIUS, anatomy.tailLength, anatomy.tailRadius / CONE_BASE_RADIUS);
      if (anatomy.jawVisible) {
        setPart(refs.jawMesh, writeIndex, tmpCreatureMatrix, 0, lift + anatomy.jawY, anatomy.jawZ, Q_TIP_FORWARD, anatomy.jawRadius / CONE_BASE_RADIUS, anatomy.jawLength, anatomy.jawRadius / CONE_BASE_RADIUS);
      } else {
        refs.jawMesh.setMatrixAt(writeIndex, ZERO_MATRIX);
      }
    }

    if (hasLegs) {
      // quattro zampe che oscillano in diagonale (trotto) mentre la creatura si muove
      for (let n = 0; n < LEGS_PER_CREATURE; n++) {
        const side = n % 2 === 0 ? -1 : 1;
        const front = n < 2;
        const swing = walking ? Math.sin(phase + (n === 0 || n === 3 ? 0 : Math.PI)) * 0.55 : 0;
        tmpLegQuat.setFromAxisAngle(AXIS_X, swing);
        setPart(
          refs.legMesh,
          writeIndex * LEGS_PER_CREATURE + n,
          tmpCreatureMatrix,
          side * anatomy.legX,
          anatomy.legLength * 0.97,
          front ? anatomy.legFrontZ : anatomy.legBackZ,
          tmpLegQuat,
          anatomy.legRadius,
          anatomy.legLength,
          anatomy.legRadius,
        );
      }
      // ombra morbida sul suolo
      setPart(refs.shadowMesh, writeIndex, tmpCreatureMatrix, 0, 0.05, 0, Q_IDENTITY, anatomy.bodyHalfWidth * 1.5, 1, anatomy.bodyHalfLength * 1.4);
    }
    if (refs.detail >= 3) {
      // orecchie per gli erbivori, più grandi con la vista migliore, inclinate verso l'esterno
      for (let n = 0; n < 2; n++) {
        const slot = writeIndex * 2 + n;
        if (anatomy.earVisible) {
          const side = n === 0 ? -1 : 1;
          tmpLegQuat.setFromAxisAngle(AXIS_Z, -side * 0.35);
          setPart(refs.earMesh, slot, tmpCreatureMatrix, side * anatomy.earX, lift + anatomy.earY, anatomy.earZ, tmpLegQuat, anatomy.earRadius / CONE_BASE_RADIUS, anatomy.earHeight, anatomy.earRadius / CONE_BASE_RADIUS);
        } else {
          refs.earMesh.setMatrixAt(slot, ZERO_MATRIX);
        }
      }
    }

    // Species color, warmed toward red the more predatory the creature is.
    tmpColor.setHSL(speciesHue(organismsSpecies[i]) / 360, 0.85, 0.62);
    if (anatomy.aggression > AGGRESSION_VISIBLE_THRESHOLD) {
      tmpColor.lerp(AGGRO_TINT, anatomy.aggression * 0.35);
    }
    refs.bodyMesh.setColorAt(writeIndex, tmpColor);
    refs.headMesh.setColorAt(writeIndex, tmpColor);
    if (refs.detail >= 2) {
      tmpColor2.copy(tmpColor).multiplyScalar(0.82);
      refs.tailMesh.setColorAt(writeIndex, tmpColor2);
      // zampe più scure del corpo
      tmpColor2.copy(tmpColor).multiplyScalar(0.68);
      for (let n = 0; n < LEGS_PER_CREATURE; n++) refs.legMesh.setColorAt(writeIndex * LEGS_PER_CREATURE + n, tmpColor2);
    }
    if (refs.detail >= 3) {
      tmpColor2.copy(tmpColor).lerp(SPIKE_TINT, 0.18);
      refs.earMesh.setColorAt(writeIndex * 2, tmpColor2);
      refs.earMesh.setColorAt(writeIndex * 2 + 1, tmpColor2);
    }
    tmpColor2.copy(tmpColor).lerp(SPIKE_TINT, 0.3);

    for (let k = 0; refs.detail >= 3 && k < MAX_SPIKES; k++) {
      const slot = writeIndex * MAX_SPIKES + k;
      const spike = anatomy.spikes[k];
      if (spike) {
        setPart(
          refs.spikeMesh,
          slot,
          tmpCreatureMatrix,
          0,
          lift + anatomy.bodyHalfHeight * 0.95 + spike.height * 0.45,
          spike.z,
          Q_IDENTITY,
          spike.radius / CONE_BASE_RADIUS,
          spike.height,
          spike.radius / CONE_BASE_RADIUS,
        );
        refs.spikeMesh.setColorAt(slot, tmpColor2);
      } else {
        refs.spikeMesh.setMatrixAt(slot, ZERO_MATRIX);
      }
    }

    refs.instanceOrganismId[writeIndex] = id;
    writeIndex++;
  }
  // v1.9.0 — chi non è stato disegnato in questo frame esce dalla traccia (come prima), senza ricostruire la mappa.
  for (const [trackId, t] of refs.creatureTrack) {
    if (t.gen !== generation) refs.creatureTrack.delete(trackId);
  }

  refs.bodyMesh.count = writeIndex;
  refs.headMesh.count = writeIndex;
  refs.eyeMesh.count = refs.detail >= 2 ? writeIndex * 2 : 0;
  refs.tailMesh.count = refs.detail >= 2 ? writeIndex : 0;
  refs.jawMesh.count = refs.detail >= 2 ? writeIndex : 0;
  refs.spikeMesh.count = refs.detail >= 3 ? writeIndex * MAX_SPIKES : 0;
  refs.legMesh.count = refs.detail >= 2 ? writeIndex * LEGS_PER_CREATURE : 0;
  refs.earMesh.count = refs.detail >= 3 ? writeIndex * 2 : 0;
  refs.shadowMesh.count = refs.detail >= 2 ? writeIndex : 0;

  for (const mesh of [refs.bodyMesh, refs.headMesh, refs.eyeMesh, refs.tailMesh, refs.jawMesh, refs.spikeMesh, refs.legMesh, refs.earMesh, refs.shadowMesh]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

/**
 * Positions (or hides) the selection ring for the currently selected
 * organism, if any. Searches the full (unsampled) organismsId array rather
 * than relying on the LOD-strided instance loop above, since the selected
 * organism might not have been included in this frame's rendered subset.
 */
function updateSelectionRing(refs: SceneRefs, frame: RenderFrame, selectedId: number | null): void {
  if (selectedId === null) {
    refs.selectionRing.visible = false;
    return;
  }

  const { organismsId, organismsX, organismsY, organismsSize, planetWidth, planetHeight } = frame;
  let index = -1;
  for (let i = 0; i < organismsId.length; i++) {
    if (organismsId[i] === selectedId) {
      index = i;
      break;
    }
  }

  if (index === -1) {
    refs.selectionRing.visible = false;
    return;
  }

  const point = projectToSphere(organismsX[index], organismsY[index], planetWidth, planetHeight, restingRadius(refs, organismsX[index], organismsY[index], 0.05));
  const normal = new THREE.Vector3(point.normalX, point.normalY, point.normalZ);
  refs.selectionRing.position.set(point.x, point.y, point.z);
  refs.selectionRing.quaternion.setFromUnitVectors(UP, normal);
  refs.selectionRing.rotateX(Math.PI / 2); // torus is authored flat on XY; align its face with the surface normal

  const baseScale = creatureScale(organismsSize[index]);
  const ringScale = baseScale * 2.2;
  refs.selectionRing.scale.set(ringScale, ringScale, ringScale);
  refs.selectionRing.visible = true;
}
