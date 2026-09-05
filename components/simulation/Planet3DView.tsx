"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RenderFrame, ViewportFrame, ViewportRequest } from "../../types";
import { speciesHue } from "../../lib/speciesColor";
import { computeCreatureShape } from "../../lib/creatureShape";
import { terrainColorRGB } from "../../lib/terrainColor";
import { projectToSphere, elevationDisplacement, sampleViewportChannelBilinear, sampleViewportTerrainIsOcean, sampleViewportElevationNearest } from "../../lib/sphereProjection";
import { computeRenderStride } from "../../lib/renderSampling";

const PLANET_RADIUS = 5;
/**
 * Buffer capacity for the instanced meshes — how many organisms could ever
 * get a rendered instance in one frame, worst case. Kept comfortably above
 * RENDER_TARGET_COUNT (below) since striding leaves a small remainder.
 */
const MAX_CREATURE_INSTANCES = 6000;
/**
 * v1.0.2 — LOD adattivo. Above this many organisms, the renderer stops
 * trying to give every single one an instance and instead draws a
 * deterministic stride-sampled subset (see lib/renderSampling.ts), keeping
 * the per-frame CPU cost of writing instance matrices roughly constant
 * even as the simulation itself scales to far larger populations. The
 * simulation engine has no population cap and never will; this only
 * bounds what gets drawn.
 */
const RENDER_TARGET_COUNT = 4000;
/** Below this normalized evasion value, no spike ornament is drawn at all (matches the 2D drawCreature threshold). */
const SPIKINESS_VISIBLE_THRESHOLD = 0.2;
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
/** How often (ms) the terrain texture is refreshed even without a zoom-level change, to reflect ongoing vegetation drift — not every tick, deliberately. */
const TERRAIN_REFRESH_INTERVAL_MS = 4000;
/** How often (ms) camera distance is polled to decide whether a new terrain LOD tier should be requested. */
const TERRAIN_LOD_CHECK_INTERVAL_MS = 500;

function pickTerrainLodTier(distance: number): { maxWidth: number; maxHeight: number; segmentsWidth: number; segmentsHeight: number } {
  const factor = distance / PLANET_RADIUS;
  for (const tier of TERRAIN_LOD_TIERS) {
    if (factor >= tier.minDistanceFactor) return tier;
  }
  return TERRAIN_LOD_TIERS[TERRAIN_LOD_TIERS.length - 1];
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

interface SceneRefs {
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
  bodyMesh: THREE.InstancedMesh;
  spikeMesh: THREE.InstancedMesh;
  selectionRing: THREE.Mesh;
  /** Maps instance index (as written by updateCreatureInstances) back to the underlying organism's id, for raycasting hit-tests (v1.0.4). */
  instanceOrganismId: Uint32Array;
}

// Reused scratch objects for the per-frame instance update loop, to avoid
// allocating thousands of THREE.Vector3/Matrix4/Color objects every tick.
const UP = new THREE.Vector3(0, 1, 0);
const AGGRO_TINT = new THREE.Color(1, 0.35, 0.27);
const tmpPosition = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpMatrix = new THREE.Matrix4();
const tmpColor = new THREE.Color();

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
 * v1.0.2 — LOD adattivo: once the population exceeds RENDER_TARGET_COUNT,
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
export function Planet3DView({ frame, viewportFrame = null, onRequestViewport, selectedOrganismId = null, onSelectOrganism }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const lastTextureSize = useRef<{ width: number; height: number } | null>(null);
  const onSelectRef = useRef(onSelectOrganism);
  const selectedIdRef = useRef(selectedOrganismId);
  const frameRef = useRef(frame);
  const onRequestViewportRef = useRef(onRequestViewport);

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

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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

    const initialTier = TERRAIN_LOD_TIERS[TERRAIN_LOD_TIERS.length - 1];
    const planetGeometry = new THREE.SphereGeometry(PLANET_RADIUS, initialTier.segmentsWidth, initialTier.segmentsHeight);
    const planetMaterial = new THREE.MeshStandardMaterial({ map: planetTexture, roughness: 0.9, metalness: 0.05 });
    const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
    scene.add(planetMesh);
    // v1.2.2 — pristine copy of the freshly-built sphere's vertex
    // positions, before any displacement is ever applied — see
    // SceneRefs.basePositions's doc comment for why this must never be
    // overwritten with already-displaced data.
    const initialBasePositions = new Float32Array((planetGeometry.attributes.position as THREE.BufferAttribute).array as Float32Array);

    const bodyGeometry = new THREE.SphereGeometry(1, 8, 6);
    const bodyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 });
    const bodyMesh = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, MAX_CREATURE_INSTANCES);
    bodyMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CREATURE_INSTANCES * 3), 3);
    bodyMesh.count = 0;
    scene.add(bodyMesh);

    const spikeGeometry = new THREE.ConeGeometry(0.35, 1, 5);
    const spikeMaterial = new THREE.MeshStandardMaterial({ roughness: 0.5 });
    const spikeMesh = new THREE.InstancedMesh(spikeGeometry, spikeMaterial, MAX_CREATURE_INSTANCES);
    spikeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CREATURE_INSTANCES * 3), 3);
    spikeMesh.count = 0;
    scene.add(spikeMesh);

    // v1.0.4 — highlight ring for the selected organism, hidden by default.
    const ringGeometry = new THREE.TorusGeometry(1, 0.12, 8, 28);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x6bffb0, transparent: true, opacity: 0.9 });
    const selectionRing = new THREE.Mesh(ringGeometry, ringMaterial);
    selectionRing.visible = false;
    scene.add(selectionRing);

    let animationFrameId = 0;
    const renderLoop = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(renderLoop);
    };
    animationFrameId = requestAnimationFrame(renderLoop);

    // v1.1 — World Scale: periodically decide whether the terrain texture
    // needs a (re)paint, either because the camera crossed into a
    // different LOD tier (zoomed meaningfully in/out) or because enough
    // time has passed that a periodic refresh is worthwhile (vegetation
    // keeps changing near active populations). Deliberately NOT tied to
    // the render loop's per-frame cadence or to the simulation's per-tick
    // RenderFrame — see TERRAIN_LOD_CHECK_INTERVAL_MS/TERRAIN_REFRESH_INTERVAL_MS.
    let lastTierKey = "";
    let lastRequestAt = 0;
    const maybeRequestViewport = (force: boolean) => {
      const f = frameRef.current;
      if (!f || !onRequestViewportRef.current) return;
      const distance = controls.getDistance();
      const tier = pickTerrainLodTier(distance);
      const tierKey = `${tier.maxWidth}x${tier.maxHeight}`;
      const now = Date.now();
      const dueForRefresh = now - lastRequestAt >= TERRAIN_REFRESH_INTERVAL_MS;
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
      bodyMesh,
      spikeMesh,
      selectionRing,
      instanceOrganismId: new Uint32Array(MAX_CREATURE_INSTANCES),
    };

    // v1.0.4 — tap/click selection. A pointerdown/pointerup pair is only
    // treated as a tap (not a drag-to-rotate) if the pointer barely moved.
    let pointerDownPos: { x: number; y: number } | null = null;
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: PointerEvent) => {
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
      } else {
        onSelectRef.current?.(null);
      }
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(lodCheckHandle);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      controls.dispose();
      sceneRef.current?.planetMesh.geometry.dispose();
      planetMaterial.dispose();
      sceneRef.current?.planetTexture.dispose();
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      spikeGeometry.dispose();
      spikeMaterial.dispose();
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

    updateCreatureInstances(refs, frame);
    updateSelectionRing(refs, frame, selectedIdRef.current);
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

    const { texWidth, texHeight, vegetation, terrain, elevation, originX, originY, cellsWidth, cellsHeight } = viewportFrame;

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
    for (let i = 0; i < texWidth * texHeight; i++) {
      const [r, g, b] = terrainColorRGB(terrain[i], vegetation[i]);
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
        aria-label="Visualizzazione 3D del pianeta simulato — trascina per ruotare, tocca una creatura per selezionarla"
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
function restingRadius(refs: SceneRefs, worldX: number, worldY: number, restOffset: number): number {
  const hm = refs.heightmap;
  if (!hm) return PLANET_RADIUS + restOffset;
  const elevation = sampleViewportElevationNearest(worldX, worldY, hm.elevation, hm.originX, hm.originY, hm.cellsWidth, hm.cellsHeight, hm.texWidth, hm.texHeight);
  const isOcean = sampleViewportTerrainIsOcean(worldX, worldY, hm.terrain, hm.originX, hm.originY, hm.cellsWidth, hm.cellsHeight, hm.texWidth, hm.texHeight);
  return PLANET_RADIUS + elevationDisplacement(elevation, isOcean) + restOffset;
}

function updateCreatureInstances(refs: SceneRefs, frame: RenderFrame): void {
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

  const population = organismsX.length;
  const stride = computeRenderStride(population, RENDER_TARGET_COUNT);

  let writeIndex = 0;
  for (let i = 0; i < population && writeIndex < MAX_CREATURE_INSTANCES; i += stride) {
    const restingR = restingRadius(refs, organismsX[i], organismsY[i], 0.02);
    const point = projectToSphere(organismsX[i], organismsY[i], planetWidth, planetHeight, restingR);
    tmpPosition.set(point.x, point.y, point.z);
    tmpNormal.set(point.normalX, point.normalY, point.normalZ);
    tmpQuaternion.setFromUnitVectors(UP, tmpNormal);

    const shape = computeCreatureShape({
      speed: organismsSpeed[i],
      carnivory: organismsCarnivory[i],
      vision: organismsVision[i],
      evasion: organismsEvasion[i],
      huntingSkill: organismsHuntingSkill[i],
    });

    const baseScale = Math.max(0.05, organismsSize[i] * 0.12);
    tmpScale.set(baseScale * (0.85 + shape.elongation * 0.5), baseScale * (0.85 - shape.elongation * 0.2), baseScale);
    tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale);
    refs.bodyMesh.setMatrixAt(writeIndex, tmpMatrix);

    tmpColor.setHSL(speciesHue(organismsSpecies[i]) / 360, 0.85, 0.62);
    if (shape.aggression > AGGRESSION_VISIBLE_THRESHOLD) {
      tmpColor.lerp(AGGRO_TINT, shape.aggression * 0.35);
    }
    refs.bodyMesh.setColorAt(writeIndex, tmpColor);

    if (shape.spikiness > SPIKINESS_VISIBLE_THRESHOLD) {
      const spikeLength = baseScale * (1 + shape.spikiness * 2.5);
      tmpPosition.addScaledVector(tmpNormal, baseScale * 0.6);
      tmpScale.set(baseScale * 0.4, spikeLength, baseScale * 0.4);
      tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale);
      refs.spikeMesh.setMatrixAt(writeIndex, tmpMatrix);
      refs.spikeMesh.setColorAt(writeIndex, tmpColor);
    } else {
      tmpScale.set(0, 0, 0);
      tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale);
      refs.spikeMesh.setMatrixAt(writeIndex, tmpMatrix);
    }

    refs.instanceOrganismId[writeIndex] = organismsId[i];
    writeIndex++;
  }

  refs.bodyMesh.count = writeIndex;
  refs.spikeMesh.count = writeIndex;

  refs.bodyMesh.instanceMatrix.needsUpdate = true;
  refs.bodyMesh.instanceColor!.needsUpdate = true;
  refs.spikeMesh.instanceMatrix.needsUpdate = true;
  refs.spikeMesh.instanceColor!.needsUpdate = true;
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

  const baseScale = Math.max(0.05, organismsSize[index] * 0.12);
  const ringScale = baseScale * 2.2;
  refs.selectionRing.scale.set(ringScale, ringScale, ringScale);
  refs.selectionRing.visible = true;
}
