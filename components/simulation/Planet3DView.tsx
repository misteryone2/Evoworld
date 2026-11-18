"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RenderFrame, ViewportFrame, ViewportRequest } from "../../types";
import { MAX_SPIKES } from "../../lib/creatureAnatomy";
import { GENERIC_RENDER_SLOTS, type CreatureAnatomyRenderSource, type CreatureRenderPartKey } from "../../lib/visual/anatomyRenderPlan";
import { createRuntimeAnatomyRenderSource, type RuntimeAnatomyRenderSource } from "../../lib/visual/runtimeAnatomyRenderSource";
import { wrappedDelta } from "../../lib/creatureHeading";
import { createMotionBuffer, ingestMotionFrame, interpolatedFrame } from "../../lib/motionInterpolation";
import { shouldDrawCreatures } from "../../lib/animationScheduler";
import { FOLLOW_CREATURE_RANGE_UNITS } from "../../lib/worldScale";
import { terrainColorRGB, applyWaterOverlayRGB, applySeasonalTintRGB, applyRockBySlopeRGB, applyMicroVariationRGB } from "../../lib/terrainColor";
import { createWaveNormalTexture } from "../../lib/waveNormals";
import { TICKS_PER_YEAR } from "../../simulation/core/constants";
import { projectToSphere, elevationDisplacement, sampleViewportChannelBilinear, sampleViewportTerrainIsOcean } from "../../lib/sphereProjection";
import {
  computeFollowPose,
  clampCameraRadius,
  cameraClearance,
  dampingAlpha,
  easeAngleToZero,
  directionToGrid,
  type Vec3,
} from "../../lib/followCamera";
import { createLocalScene } from "./localScene";
import { isLocalViewport, localPatchRadiusCells } from "../../lib/localGround";
import { QUALITY_PROFILES, shouldDowngrade, type QualityProfile } from "../../lib/qualityProfile";
import { addBellyGradient, configureInstancedMesh, updateCreatureInstances } from "./planet3d/creatureInstancing";
import { PLANET_RADIUS, CREATURE_BUFFER_SLACK, LEGS_PER_CREATURE, CONE_BASE_RADIUS } from "./planet3d/constants";
import { CLOUD_COUNTS, CLOUD_HEIGHT, CLOUD_SPREAD, CLOUD_WIND, SKY_COLOR, createCloudTexture, createSkyDome } from "./planet3d/sky";
import { SUN_ORBIT_POSITION, placeFollowSun, setSunShadowExtent } from "./planet3d/sun";
import { applyFollowDrag, createFollowState, panFreeCamera, resetFollowState, updateFollowCamera, updateFreeCamera, type FollowState } from "./planet3d/cameraRig";
import { pickTerrainLodTier, tiersForProfile, TERRAIN_LOD_CHECK_INTERVAL_MS, TERRAIN_LOD_TIERS } from "./planet3d/terrainTiers";
import { updateSelectionRing } from "./planet3d/selectionRing";
import type { CreatureTrack, HeightmapSample, SceneRefs } from "./planet3d/types";

// UP resta nel componente per l'orientamento della camera; le creature hanno
// una copia privata nel modulo (nessuno stato scrivibile condiviso).
const UP = new THREE.Vector3(0, 1, 0);

// G1-b — il componente riesporta l'API storica: test e chiamanti restano invariati.
export type { CreatureTrack, SceneRefs } from "./planet3d/types";
export { createCloudTexture, createSkyDome } from "./planet3d/sky";
export { placeFollowSun, setSunShadowExtent } from "./planet3d/sun";
export { applyFollowDrag, createFollowState, panFreeCamera, resetFollowState, updateFollowCamera, updateFreeCamera } from "./planet3d/cameraRig";
export type { FollowState } from "./planet3d/cameraRig";
export { addBellyGradient, configureInstancedMesh, updateCreatureInstances } from "./planet3d/creatureInstancing";

/** v1.7.0 — piano vicino della camera: da vicino al suolo serve molto più piccolo di quello della vista dall'alto. */
const FOLLOW_NEAR_PLANE = 0.03;
const ORBIT_NEAR_PLANE = 0.1;
const FOLLOW_FOG_NEAR = 1.2;
const FOLLOW_FOG_FAR = 5.2;
/** Sfondo della vista dall'alto (lo spazio), distinto dal cielo della terza persona. */
const SPACE_COLOR = 0x05070a;
/** v1.8.0 — terreno locale: mezza larghezza (unità del mondo 3D) dell'area richiesta, ritmo delle richieste. */
const LOCAL_PATCH_HALF_UNITS = 3;
const LOCAL_CHECK_INTERVAL_MS = 400;
const LOCAL_MIN_INTERVAL_MS = 400;
const LOCAL_REFRESH_MS = 2500;
const LOCAL_RECENTER_FRACTION = 0.3;
/** Pointer movement (px) below which a pointerdown+pointerup is treated as a tap/click rather than a drag-to-rotate (v1.0.4). */
const TAP_MOVEMENT_THRESHOLD_PX = 6;


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

/**
 * v1.7.0 — "orbit": vista dall'alto, si ruota il pianeta. "follow": terza persona, la camera segue l'animale selezionato.
 * v1.10.8 — "free": terza persona SLEGATA dagli esseri: il punto d'osservazione è un punto qualunque della
 * superficie (non un animale); si sposta verso il punto toccato e la camera lo incornicia da dietro.
 */
export type CameraMode = "orbit" | "follow" | "free";

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
  /**
   * G-REV-02 — sorgente G2 opzionale. G3 la crea automaticamente dal frame:
   * questo prop resta solo per test/override espliciti e non è più necessario.
   */
  anatomyRenderSource?: CreatureAnatomyRenderSource | null;
}



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
export function Planet3DView({ frame, viewportFrame = null, onRequestViewport, selectedOrganismId = null, onSelectOrganism, quality = QUALITY_PROFILES.alto, onSlow, cameraMode = "orbit", anatomyRenderSource = null }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const lastTextureSize = useRef<{ width: number; height: number } | null>(null);
  const onSelectRef = useRef(onSelectOrganism);
  const selectedIdRef = useRef(selectedOrganismId);
  const frameRef = useRef(frame);
  const onRequestViewportRef = useRef(onRequestViewport);
  const onSlowRef = useRef(onSlow);
  const cameraModeRef = useRef<CameraMode>(cameraMode);
  // G3 — sorgente automatica: nessuna prop manuale è più necessaria per
  // collegare il descriptor G2 al renderer. Il prop resta un override opzionale.
  const runtimeAnatomySourceRef = useRef<RuntimeAnatomyRenderSource>(createRuntimeAnatomyRenderSource());
  const anatomyRenderSourceRef = useRef<CreatureAnatomyRenderSource | null>(anatomyRenderSource ?? runtimeAnatomySourceRef.current);
  // v1.10.8 — il pianeta globale (mappa altezze + texture) è stato costruito almeno una volta per il mondo corrente.
  const globalTerrainBuiltRef = useRef(false);
  const globalPlanetKeyRef = useRef("");
  // v1.10.1 — posizioni precedenti e attuali delle creature, solo per il disegno (non persistono, non entrano nei salvataggi).
  const motionRef = useRef(createMotionBuffer());

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
  useEffect(() => {
    const active = anatomyRenderSource ?? runtimeAnatomySourceRef.current;
    anatomyRenderSourceRef.current = active;
    if (sceneRef.current) sceneRef.current.renderSource = active;
  }, [anatomyRenderSource]);

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
    // v1.9.2 — Atmosfera: tone mapping filmico (colori meno piatti, costo quasi nullo) e,
    // solo al livello "Completa", ombre morbide PCF. Negli altri profili il renderer resta
    // com'era: il telefono è il vincolo, le ombre sono l'extra del dispositivo potente.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    const shadows = quality.level === "alto";
    if (shadows) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
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

    // v1.9.2 — Atmosfera: la luce ambientale uniforme diventa una hemisphere light
    // (cielo sopra, suolo sotto): stesso costo, ma il volume delle forme si vede.
    // Il sole guadagna intensità perché il tone mapping ACES scurisce i mezzi toni.
    scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.55));
    const sun = new THREE.DirectionalLight(0xfff2d9, 1.45);
    sun.position.set(...SUN_ORBIT_POSITION);
    scene.add(sun);
    // vNext (graphics pass) — luce di riempimento debole dal lato opposto:
    // stacca i volumi delle creature dal fondo scuro senza cambiare la
    // direzione del sole. Nessuna ombra, una sola draw-cost trascurabile.
    const fillLight = new THREE.DirectionalLight(0x9fc4ff, 0.22);
    fillLight.position.set(-SUN_ORBIT_POSITION[0], SUN_ORBIT_POSITION[1] * 0.35, -SUN_ORBIT_POSITION[2]);
    scene.add(fillLight);
    if (shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.05;
      const sc = sun.shadow.camera as THREE.OrthographicCamera;
      sc.near = 0.1;
      sc.far = Math.hypot(...SUN_ORBIT_POSITION) + PLANET_RADIUS * 1.6;
      setSunShadowExtent(sun, PLANET_RADIUS * 1.3);
    }

    // 1x1 placeholder texture; replaced with real per-cell data on the
    // first frame update effect below (near-instant in practice).
    const placeholderData = new Uint8Array([15, 20, 24, 255]);
    const planetTexture = new THREE.DataTexture(placeholderData, 1, 1, THREE.RGBAFormat);
    planetTexture.flipY = false;
    planetTexture.needsUpdate = true;
    // v1.9.4 — Acqua: placeholder 1x1 tutto opaco finché non arriva il primo viewport.
    const roughnessData = new Uint8Array([0, 235, 0, 255]); // R inutilizzato, G = roughness, B = metalness
    const roughnessTexture = new THREE.DataTexture(roughnessData, 1, 1, THREE.RGBAFormat);
    roughnessTexture.flipY = false;
    roughnessTexture.needsUpdate = true;

    const tiers = tiersForProfile(quality);
    const initialTier = tiers[tiers.length - 1];
    const planetGeometry = new THREE.SphereGeometry(PLANET_RADIUS, initialTier.segmentsWidth, initialTier.segmentsHeight);
    // v1.9.4 — Acqua: la roughnessMap moltiplica la roughness base (1): i texel d'acqua
    // (canale verde ~45/255) diventano lucidi e riflettono il sole, la terra resta opaca.
    const planetMaterial = new THREE.MeshStandardMaterial({ map: planetTexture, roughnessMap: roughnessTexture, metalnessMap: roughnessTexture, roughness: 1, metalness: 1 });
    const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
    planetMesh.receiveShadow = shadows;
    planetMesh.castShadow = shadows; // le montagne si gettano ombra addosso
    scene.add(planetMesh);

    // v1.9.5 — Oceano attivo: l'acqua non è più solo colore dipinto sulla texture,
    // ma una vera superficie sferica al livello del mare, appena sopra il raggio base
    // (la terra emersa è più in alto e la nasconde, gli oceani dipinti sono più in
    // basso e traspaiono: la trasparenza dà la profondità). Onde animate sempre.
    const oceanWaves = createWaveNormalTexture();
    oceanWaves.repeat.set(28, 18);
    const oceanMaterial = new THREE.MeshStandardMaterial({
      color: 0x1c4f7f,
      transparent: true,
      opacity: 0.6,
      roughness: 0.22,
      metalness: 0.08,
      normalMap: oceanWaves,
      normalScale: new THREE.Vector2(0.4, 0.4),
    });
    const oceanMesh = new THREE.Mesh(new THREE.SphereGeometry(PLANET_RADIUS + 0.004, 96, 64), oceanMaterial);
    oceanMesh.receiveShadow = shadows;
    oceanMesh.renderOrder = 1; // sopra la superficie del pianeta, sotto le creature
    scene.add(oceanMesh);
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
    // vNext (graphics pass) — metalness per materiale: la pelle/superficie organica
    // non è metallo, va tenuta bassa; gli occhi restano lucidi. Senza opt-in il
    // valore resta quello storico (0.1) per non alterare gli altri materiali.
    const makeMaterial = (opts: { color?: number; roughness?: number; metalness?: number; vertexColors?: boolean }) =>
      useLambert
        ? new THREE.MeshLambertMaterial({ ...(opts.color !== undefined ? { color: opts.color } : {}), ...(opts.vertexColors ? { vertexColors: true } : {}) })
        : new THREE.MeshStandardMaterial({ roughness: opts.roughness ?? 0.6, metalness: opts.metalness ?? 0.1, ...(opts.color !== undefined ? { color: opts.color } : {}), ...(opts.vertexColors ? { vertexColors: true } : {}) });
    const makeMesh = (geometry: THREE.BufferGeometry, material: THREE.Material, instances: number, colored: boolean) => {
      const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, instances));
      if (colored) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, instances) * 3), 3);
      // v1.9.2 — le creature proiettano ombra quando le ombre sono attive (solo "Completa").
      mesh.castShadow = shadows;
      mesh.count = 0;
      configureInstancedMesh(mesh);
      scene.add(mesh);
      return mesh;
    };

    const bodyGeometry = addBellyGradient(new THREE.SphereGeometry(1, segW, segH));
    const bodyMaterial = makeMaterial({ roughness: 0.52, metalness: 0.04, vertexColors: true });
    const bodyMesh = makeMesh(bodyGeometry, bodyMaterial, capacity, true);

    const headGeometry = addBellyGradient(new THREE.SphereGeometry(1, Math.max(5, segW - 2), Math.max(3, segH - 2)));
    const headMaterial = makeMaterial({ roughness: 0.48, metalness: 0.04, vertexColors: true });
    const headMesh = makeMesh(headGeometry, headMaterial, capacity, true);

    const eyeGeometry = new THREE.SphereGeometry(1, 6, 4);
    const eyeMaterial = makeMaterial({ color: 0x0b0f14, roughness: 0.16, metalness: 0.0 });
    const eyeMesh = makeMesh(eyeGeometry, eyeMaterial, detail >= 2 ? capacity * 2 : 1, false);

    const tailGeometry = new THREE.ConeGeometry(CONE_BASE_RADIUS, 1, 6);
    const tailMaterial = makeMaterial({ roughness: 0.56, metalness: 0.04 });
    const tailMesh = makeMesh(tailGeometry, tailMaterial, detail >= 2 ? capacity : 1, true);

    const jawGeometry = new THREE.ConeGeometry(CONE_BASE_RADIUS, 1, 5);
    const jawMaterial = makeMaterial({ color: 0xc8553d, roughness: 0.45, metalness: 0.03 });
    const jawMesh = makeMesh(jawGeometry, jawMaterial, detail >= 2 ? capacity : 1, false);

    const spikeGeometry = new THREE.ConeGeometry(CONE_BASE_RADIUS, 1, 5);
    const spikeMaterial = makeMaterial({ roughness: 0.42, metalness: 0.05 });
    const spikeMesh = makeMesh(spikeGeometry, spikeMaterial, detail >= 3 ? capacity * MAX_SPIKES : 1, true);

    // v1.8.0 — zampe (cilindri appesi all'anca), orecchie (coni) e ombra (disco piatto).
    const legGeometry = new THREE.CylinderGeometry(0.8, 1, 1, 5);
    legGeometry.translate(0, -0.5, 0); // l'estremo alto (l'anca) sta in y = 0
    const legMaterial = makeMaterial({ roughness: 0.62, metalness: 0.03 });
    const legMesh = makeMesh(legGeometry, legMaterial, detail >= 2 ? capacity * LEGS_PER_CREATURE : 1, true);
    const earGeometry = new THREE.ConeGeometry(CONE_BASE_RADIUS, 1, 5);
    const earMaterial = makeMaterial({ roughness: 0.55, metalness: 0.03 });
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
    shadowMesh.castShadow = false; // è già un'ombra disegnata: non ne proietta una seconda

    // G-REV-02 — pool generici per le parti G2 non rappresentabili dai nove mesh
    // fissi. I slots sono costanti e limitati; i mesh restano invisibili finché
    // non viene fornita una sorgente, quindi il percorso legacy non cambia.
    const genericMeshes: Partial<Record<CreatureRenderPartKey, THREE.InstancedMesh>> = {};
    const genericGeometries: Partial<Record<CreatureRenderPartKey, THREE.BufferGeometry>> = {};
    const genericMaterials: Partial<Record<CreatureRenderPartKey, THREE.Material>> = {};
    const genericSlotsPerCreature: Partial<Record<CreatureRenderPartKey, number>> = {};
    for (const key of Object.keys(GENERIC_RENDER_SLOTS) as CreatureRenderPartKey[]) {
      const slots = GENERIC_RENDER_SLOTS[key];
      const geometry = key === "segment"
        ? new THREE.SphereGeometry(1, Math.max(5, segW - 2), Math.max(3, segH - 2))
        : key === "appendage"
          ? new THREE.CylinderGeometry(0.8, 1, 1, 5)
          : new THREE.SphereGeometry(1, 6, 4);
      const material = key === "eye"
        ? makeMaterial({ color: 0x0b0f14, roughness: 0.16, metalness: 0 })
        : makeMaterial({ roughness: 0.58, metalness: 0.03 });
      genericGeometries[key] = geometry;
      genericMaterials[key] = material;
      genericSlotsPerCreature[key] = slots;
      const mesh = makeMesh(geometry, material, capacity * slots, key !== "eye");
      mesh.visible = false;
      genericMeshes[key] = mesh;
    }

    // v1.8.0 — terreno ad alto dettaglio e flora 3D intorno all'animale seguito.
    const local = quality.localTerrainSegments > 0 ? createLocalScene(quality, PLANET_RADIUS) : null;
    if (local) scene.add(local.group);

    // v1.0.4 — highlight ring for the selected organism, hidden by default.
    const ringGeometry = new THREE.TorusGeometry(1, 0.12, 8, 28);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x6bffb0, transparent: true, opacity: 0.9 });
    const selectionRing = new THREE.Mesh(ringGeometry, ringMaterial);
    selectionRing.visible = false;
    scene.add(selectionRing);
    // v1.10.6 — cielo con gradiente e nuvole in terza persona (il numero di nuvole dipende dal profilo).
    const sky = createSkyDome();
    scene.add(sky);
    const cloudTexture = createCloudTexture();
    const cloudCount = CLOUD_COUNTS[quality.level];
    const clouds: THREE.Sprite[] = [];
    for (let n = 0; n < cloudCount; n++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture, transparent: true, opacity: 0.55, depthWrite: false }));
      sprite.scale.set(3.5 + (n % 3), 1.6 + (n % 3) * 0.5, 1);
      // posizioni deterministiche sparse intorno all'area, ognuna con la sua quota e la sua velocità del vento
      const angle = (n / Math.max(1, cloudCount)) * Math.PI * 2 + n * 0.7;
      sprite.position.set(Math.cos(angle) * (4 + (n % 5)), CLOUD_HEIGHT + (n % 4) * 1.3, Math.sin(angle) * (4 + (n % 5)));
      sprite.userData.wind = 0.8 + (n % 5) * 0.12;
      sprite.visible = false;
      scene.add(sprite);
      clouds.push(sprite);
    }

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

    // v1.10.1 — Movimento continuo. Le creature si ridisegnano a ogni frame di rendering con le posizioni
    // interpolate tra due frame del mondo, non solo quando ne arriva uno nuovo. Si ridisegna solo se c'è
    // qualcosa da muovere (frame nuovo, interpolazione in corso, cambio di camera o di selezione): da fermo,
    // in pausa, non si fa nulla.
    let lastDrawnVersion = -1;
    let lastDrawnAlpha = 1;
    let lastDrawnFollowing = false;
    let lastDrawnSelected: number | null = null;
    let lastCreatureDrawAt = 0;
    let lastDrawnCount = 0; // creature disegnate l'ultima volta: se ce ne sono, la posa viva (respiro, idle, riposo) continua anche in pausa
    let creatureCostMs = 0; // costo medio di un aggiornamento delle creature
    let creatureMinIntervalMs = 0; // se è alto, si ridisegna al massimo a 30 Hz

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
      // v1.9.2 — da vicino le stesse 2048x2048 pixel d'ombra si concentrano su pochi metri e restano nitide.
      if (sun.castShadow) setSunShadowExtent(sun, 6);
      planetMaterial.polygonOffset = true;
      planetMaterial.polygonOffsetFactor = 2;
      planetMaterial.polygonOffsetUnits = 2;
      local?.setVisible(true);
      // da vicino pensa all'acqua la scena locale: la sfera d'oceano si nasconde.
      oceanMesh.visible = false;
      sky.visible = true;
      for (const cloud of clouds) cloud.visible = true;
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
      if (sun.castShadow) setSunShadowExtent(sun, PLANET_RADIUS * 1.3);
      local?.setVisible(false);
      local?.clear();
      oceanMesh.visible = true;
      sky.visible = false;
      for (const cloud of clouds) cloud.visible = false;
      // l'ultimo ViewportFrame era locale: si torna a chiedere quello del pianeta intero
      maybeRequestViewport(true);
    };

    const renderLoop = (nowMs: number) => {
      // v1.10.8 — "free" condivide con "follow" la scena da vicino (cielo, foschia, terreno locale, ombre):
      // cambia solo chi decide la posa della camera (updateFreeCamera invece di updateFollowCamera).
      const wantFollow = cameraModeRef.current === "follow";
      const wantFree = cameraModeRef.current === "free";
      const wantSurface = wantFollow || wantFree;
      if (wantSurface && !followActive) enterFollow();
      else if (!wantSurface && followActive) leaveFollow();

      // v1.10.1 — le posizioni da disegnare in questo istante (i dati reali del frame non si toccano).
      const sceneRefs = sceneRef.current;
      const realFrame = frameRef.current;
      let view = realFrame;
      let motionAlpha = 1;
      if (realFrame) {
        const interpolated = interpolatedFrame(realFrame, motionRef.current, nowMs);
        view = interpolated.frame;
        motionAlpha = interpolated.alpha;
      }

      // G3 — il descriptor dipende dal frame reale, non dall'interpolazione
      // visiva: sincronizzare qui evita di rigenerare piani a ogni sub-frame.
      const activeSource = anatomyRenderSourceRef.current;
      if (activeSource && typeof (activeSource as RuntimeAnatomyRenderSource).syncFrame === "function") {
        (activeSource as RuntimeAnatomyRenderSource).syncFrame(realFrame);
      }

      if (followActive) {
        const refs = sceneRefs;
        const f = view;
        const id = selectedIdRef.current;
        if (refs && f) {
          const dt = lastFrameAt > 0 ? Math.min(nowMs - lastFrameAt, 250) : 0;
          if (wantFollow && id !== null) {
            const replacement = updateFollowCamera(refs, f, id, follow, nowMs, dt);
            if (replacement !== null) onSelectRef.current?.(replacement);
          } else if (wantFree) {
            // v1.10.8 — camera libera: il punto d'osservazione avanza verso il punto toccato.
            updateFreeCamera(refs, f, follow, nowMs, dt);
          }
          // Il sole segue chi guarda: dall'altra parte del pianeta sarebbe notte e non si vedrebbe niente.
          placeFollowSun(sun, camera.position, follow.target, follow.up);
          // v1.9.4 — Acqua: la superficie locale scorre col tempo reale, non col tick.
          local?.updateWater(nowMs / 1000);
          // v1.10.6 — il cielo segue la camera; le nuvole derivano piano col vento e, se escono
          // dall'area, ricompaiono dall'altra parte (dietro chi guarda non se ne accorge).
          sky.position.copy(camera.position);
          for (const cloud of clouds) {
            cloud.position.x += CLOUD_WIND * (cloud.userData.wind ?? 1) * (dt / 1000);
            const dx = cloud.position.x - follow.target.x;
            const dz = cloud.position.z - follow.target.z;
            if (dx > CLOUD_SPREAD) cloud.position.x -= CLOUD_SPREAD * 2;
            else if (dx < -CLOUD_SPREAD) cloud.position.x += CLOUD_SPREAD * 2;
            if (dz > CLOUD_SPREAD) cloud.position.z -= CLOUD_SPREAD * 2;
            else if (dz < -CLOUD_SPREAD) cloud.position.z += CLOUD_SPREAD * 2;
          }
        }
      } else {
        controls.update();
      }
      // v1.9.5 — l'oceano respira sempre: in orbita scorre anche quando la camera
      // è ferma e il tick non rinfresca la texture (in follow ci pensa updateWater).
      if (!followActive) oceanWaves.offset.set((nowMs / 1000 * 0.02) % 1, (nowMs / 1000 * 0.013) % 1);

      if (sceneRefs && view) {
        const selected = selectedIdRef.current;
        const motionVersion = motionRef.current.version;
        // v1.10.8 — "forcing": solo in terza persona (non in camera libera) un animale è obbligato e la scena è ritagliata attorno a lui
        const forcing = followActive && wantFollow;
        const needsDraw =
          motionVersion !== lastDrawnVersion || lastDrawnAlpha < 1 || forcing !== lastDrawnFollowing || selected !== lastDrawnSelected;
        // v1.10.5 (consolidamento) — senza dati nuovi (pausa) la posa viva delle creature disegnate prosegue a ~30 Hz
        if (shouldDrawCreatures({ dataDirty: needsDraw, drawnCount: lastDrawnCount, nowMs, lastDrawAt: lastCreatureDrawAt, costIntervalMs: creatureMinIntervalMs })) {
          const startedAt = performance.now();
          const dtDraw = lastCreatureDrawAt > 0 ? Math.min(nowMs - lastCreatureDrawAt, 250) : 100;
          // v1.7.0 — in terza persona l'animale seguito va sempre disegnato e non ha l'anello di selezione.
          // v1.10.8 — in camera libera nessun animale è obbligato e l'anello di selezione resta visibile.
          lastDrawnCount = updateCreatureInstances(sceneRefs, view, forcing ? selected : null, forcing ? FOLLOW_CREATURE_RANGE_UNITS : null, dtDraw, camera.position);
          updateSelectionRing(sceneRefs, view, forcing ? null : selected);
          creatureCostMs = creatureCostMs * 0.8 + (performance.now() - startedAt) * 0.2;
          creatureMinIntervalMs = creatureCostMs > 8 ? 33 : 0;
          lastDrawnVersion = motionVersion;
          lastDrawnAlpha = motionAlpha;
          lastDrawnFollowing = forcing;
          lastDrawnSelected = selected;
          lastCreatureDrawAt = nowMs;
        }
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
    // v1.10.8 — bugfix "si vede solo il cielo": partendo direttamente in vista libera (o terza persona),
    // la richiesta del pianeta globale (mappa altezze + texture) veniva saltata per sempre, la camera
    // non conosceva le colline e nasceva DENTRO il terreno. Il pianeta globale viene quindi costruito
    // comunque la prima volta, anche da vicino; dopo, si torna a risparmiare (c'è il terreno locale).
    const maybeRequestViewport = (force: boolean) => {
      const f = frameRef.current;
      if (!f || !onRequestViewportRef.current) return;
      if (followActive && globalTerrainBuiltRef.current) return;
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
      roughnessTexture,
      roughnessData,
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
      renderSource: anatomyRenderSourceRef.current,
      genericMeshes,
      genericSlotsPerCreature,
      creatureRenderStats: { drawn: 0, mapped: 0, legacy: 0, fallback: 0, unsupported: 0, fallbackReasons: [] },
    };

    // G3 — snapshot di QA in development: espose solo statistiche, non muta la scena.
    if (process.env.NODE_ENV !== "production") {
      const debugWindow = window as Window & {
        __EVOWORLD_G3__?: { snapshot: () => Record<string, unknown> };
      };
      debugWindow.__EVOWORLD_G3__ = {
        snapshot: () => ({
          quality: quality.level,
          rendererInfo: {
            calls: renderer.info.render.calls,
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
          },
          renderStats: { ...sceneRef.current?.creatureRenderStats },
          anatomySource: runtimeAnatomySourceRef.current.stats(),
        }),
      };
    }

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
      if (cameraModeRef.current === "free") {
        // v1.10.10 — in vista libera trascinare SPOSTA il punto d'osservazione nella direzione del gesto
        // (su PC col mouse premuto, su telefono col dito): la camera lo segue e si gira verso dove si va.
        const refs = sceneRef.current;
        const f = frameRef.current;
        if (refs && f) panFreeCamera(refs, f, follow, dx, dy);
      } else {
        applyFollowDrag(follow, dx, dy, performance.now());
      }
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
      } else if (cameraModeRef.current === "free") {
        // v1.10.8 — in camera libera un tocco sul terreno lo raggiunge: il punto d'osservazione ci va da solo.
        const groundHits = raycaster.intersectObject(planetMesh);
        if (groundHits.length > 0) {
          const p = groundHits[0].point;
          const grid = directionToGrid([p.x, p.y, p.z], frameRef.current?.planetWidth ?? 0, frameRef.current?.planetHeight ?? 0);
          if (grid.x > 0 || grid.y > 0) {
            follow.goalX = grid.x;
            follow.goalY = grid.y;
            follow.hasGoal = true;
          }
        }
        // v1.10.9 — SELEZIONE AL TOCCO, estensibile: qui sopra gli animali (istanze del motore).
        // Le piante (flora della scena locale) entreranno appena avranno un'identità nella simulazione:
        // basterà aggiungere la loro mesh a questa catena di raycast, PRIMA del terreno, e chiamare
        // onSelect con l'id della pianta — il pannello dati e l'anello di selezione li seguiranno.
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
      if (process.env.NODE_ENV !== "production") {
        const debugWindow = window as Window & { __EVOWORLD_G3__?: unknown };
        delete debugWindow.__EVOWORLD_G3__;
      }
      cancelAnimationFrame(animationFrameId);
      clearInterval(lodCheckHandle);
      clearInterval(localCheckHandle);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerEnd);
      controls.dispose();
      // G3 — i buffer di istanza non sono liberati da geometry.dispose():
      // vanno rilasciati esplicitamente, inclusi i pool cresciuti a runtime.
      const refsForCleanup = sceneRef.current;
      for (const mesh of [
        refsForCleanup?.bodyMesh, refsForCleanup?.headMesh, refsForCleanup?.eyeMesh,
        refsForCleanup?.tailMesh, refsForCleanup?.jawMesh, refsForCleanup?.spikeMesh,
        refsForCleanup?.legMesh, refsForCleanup?.earMesh, refsForCleanup?.shadowMesh,
      ]) mesh?.dispose();
      sceneRef.current?.planetMesh.geometry.dispose();
      planetMaterial.dispose();
      sceneRef.current?.planetTexture.dispose();
      sceneRef.current?.roughnessTexture.dispose();
      oceanWaves.dispose();
      oceanMaterial.dispose();
      oceanMesh.geometry.dispose();
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
      for (const key of Object.keys(genericMeshes) as CreatureRenderPartKey[]) {
        const mesh = refsForCleanup?.genericMeshes?.[key] ?? genericMeshes[key];
        if (mesh) {
          scene.remove(mesh);
          mesh.dispose();
        }
        genericGeometries[key]?.dispose();
        genericMaterials[key]?.dispose();
      }
      local?.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
      cloudTexture.dispose();
      for (const cloud of clouds) cloud.material.dispose();
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

  // v1.10.1 — A ogni frame nuovo del mondo si registrano le posizioni (la precedente diventa il punto di
  // partenza dell'interpolazione). Il disegno delle creature e dell'anello di selezione non avviene più
  // qui: lo fa il ciclo di rendering a ogni frame, con le posizioni interpolate (vedi renderLoop).
  // v1.1 — il terreno non si ridipinge qui (lo guida viewportFrame, qui sotto, con una cadenza sua).
  useEffect(() => {
    if (!frame) return;
    ingestMotionFrame(motionRef.current, frame, performance.now());
  }, [frame]);

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

    // v1.10.8 — è arrivato un ViewportFrame del pianeta intero: la mappa altezze globale esiste, la camera
    // in vista libera/terza persona può fidarsi. Al cambio di mondo la bandierina si azzera e si ricostruisce.
    // (Le dimensioni del mondo stanno nel RenderFrame, non nel ViewportFrame.)
    if (currentFrame) {
      const planetKey = `${currentFrame.planetWidth}x${currentFrame.planetHeight}`;
      if (globalPlanetKeyRef.current !== planetKey) {
        globalPlanetKeyRef.current = planetKey;
        globalTerrainBuiltRef.current = false;
      }
      globalTerrainBuiltRef.current = true;
    }

    const { texWidth, texHeight, vegetation, terrain, elevation, riverFlow, lake, temperature, planetHeight, tick, originX, originY, cellsWidth, cellsHeight } = viewportFrame;

    const sizeChanged = lastTextureSize.current?.width !== texWidth || lastTextureSize.current?.height !== texHeight;
    if (sizeChanged) {
      const newData = new Uint8Array(texWidth * texHeight * 4);
      const newTexture = new THREE.DataTexture(newData, texWidth, texHeight, THREE.RGBAFormat);
      newTexture.flipY = false;
      // v1.9.4 — Acqua: la roughnessMap raddoppia con la map, stessa griglia.
      const newRoughnessData = new Uint8Array(texWidth * texHeight * 4);
      const newRoughnessTexture = new THREE.DataTexture(newRoughnessData, texWidth, texHeight, THREE.RGBAFormat);
      newRoughnessTexture.flipY = false;
      const material = refs.planetMesh.material as THREE.MeshStandardMaterial;
      material.map = newTexture;
      material.roughnessMap = newRoughnessTexture;
      material.needsUpdate = true;
      refs.planetTexture.dispose();
      refs.planetTexture = newTexture;
      refs.textureData = newData;
      refs.roughnessTexture.dispose();
      refs.roughnessTexture = newRoughnessTexture;
      refs.roughnessData = newRoughnessData;
      lastTextureSize.current = { width: texWidth, height: texHeight };
    }

    const data = refs.textureData;
    const roughnessData = refs.roughnessData;
    // v1.3.0 — Stagioni: each texel's own season (mirrored in the southern
    // hemisphere) drives its snow / sea ice / autumn tint.
    const yearPhase = (tick % TICKS_PER_YEAR) / TICKS_PER_YEAR;
    for (let i = 0; i < texWidth * texHeight; i++) {
      const ty = Math.floor(i / texWidth);
      const worldY = (((originY + ((ty + 0.5) / texHeight) * cellsHeight) % planetHeight) + planetHeight) % planetHeight;
      const seasonPhase = worldY < planetHeight / 2 ? yearPhase : (yearPhase + 0.5) % 1;
      // v1.9.3 — Materiali: pendenza dalle differenze centrali del canale di
      // elevazione (wrap orizzontale come il mondo), rocce sui pendii ripidi
      // e micro-variazione deterministica per texel: la tinta unita sparisce.
      const tx = i % texWidth;
      const tyRow = Math.floor(i / texWidth);
      const xm = (tx - 1 + texWidth) % texWidth;
      const xp = (tx + 1) % texWidth;
      const ymRow = Math.max(0, tyRow - 1);
      const ypRow = Math.min(texHeight - 1, tyRow + 1);
      const slope =
        Math.abs(elevation[tyRow * texWidth + xp] - elevation[tyRow * texWidth + xm]) +
        Math.abs(elevation[ypRow * texWidth + tx] - elevation[ymRow * texWidth + tx]);
      const hash01 = (((tx * 73856093) ^ (tyRow * 19349663)) >>> 0) % 1024 / 1023;
      const [r, g, b] = applySeasonalTintRGB(
        applyWaterOverlayRGB(
          applyMicroVariationRGB(applyRockBySlopeRGB(terrainColorRGB(terrain[i], vegetation[i]), slope / 0.3, terrain[i]), hash01),
          riverFlow[i],
          lake[i] === 1,
        ),
        terrain[i],
        vegetation[i],
        temperature[i],
        seasonPhase,
      );
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
      // v1.9.4b — Acqua: oceano, laghi e fiumi diventano riflettenti, la terra resta opaca.
      // La roughnessMap legge il canale VERDE, la metalnessMap il BLU: con l'acqua liscia
      // (30/255) e leggermente metallica (51/255) il sole ci si specchia; la terra resta
      // ruvida (235) e non metallica (0) esattamente come prima.
      const isWaterTexel = terrain[i] === 0 || riverFlow[i] > 0 || lake[i] === 1;
      roughnessData[i * 4] = 0;
      roughnessData[i * 4 + 1] = isWaterTexel ? 30 : 235;
      roughnessData[i * 4 + 2] = isWaterTexel ? 51 : 0;
      roughnessData[i * 4 + 3] = 255;
    }
    refs.planetTexture.needsUpdate = true;
    refs.roughnessTexture.needsUpdate = true;

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
            : cameraMode === "free"
              ? "Vista in terza persona libera — trascina per spostarti nella direzione del gesto, tocca un punto per andarci"
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


