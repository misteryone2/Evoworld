"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RenderFrame } from "../../types";
import { speciesHue } from "../../lib/speciesColor";
import { computeCreatureShape } from "../../lib/creatureShape";
import { terrainColorRGB } from "../../lib/terrainColor";
import { projectToSphere } from "../../lib/sphereProjection";
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
}

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  planetMesh: THREE.Mesh;
  planetTexture: THREE.DataTexture;
  textureData: Uint8Array;
  bodyMesh: THREE.InstancedMesh;
  spikeMesh: THREE.InstancedMesh;
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
 */
export function Planet3DView({ frame }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const lastPlanetSize = useRef<{ width: number; height: number } | null>(null);

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

    const planetGeometry = new THREE.SphereGeometry(PLANET_RADIUS, 96, 64);
    const planetMaterial = new THREE.MeshStandardMaterial({ map: planetTexture, roughness: 0.9, metalness: 0.05 });
    const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
    scene.add(planetMesh);

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

    let animationFrameId = 0;
    const renderLoop = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(renderLoop);
    };
    animationFrameId = requestAnimationFrame(renderLoop);

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    sceneRef.current = { renderer, scene, camera, controls, planetMesh, planetTexture, textureData: placeholderData, bodyMesh, spikeMesh };

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      controls.dispose();
      planetGeometry.dispose();
      planetMaterial.dispose();
      sceneRef.current?.planetTexture.dispose();
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      spikeGeometry.dispose();
      spikeMaterial.dispose();
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

  // Per-frame: repaint the planet texture and update creature instances
  // from the latest RenderFrame, without rebuilding any Three.js objects.
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs || !frame) return;

    const { planetWidth, planetHeight, vegetation, terrain } = frame;

    const sizeChanged =
      lastPlanetSize.current?.width !== planetWidth || lastPlanetSize.current?.height !== planetHeight;
    if (sizeChanged) {
      const newData = new Uint8Array(planetWidth * planetHeight * 4);
      const newTexture = new THREE.DataTexture(newData, planetWidth, planetHeight, THREE.RGBAFormat);
      newTexture.flipY = false;
      const material = refs.planetMesh.material as THREE.MeshStandardMaterial;
      material.map = newTexture;
      material.needsUpdate = true;
      refs.planetTexture.dispose();
      refs.planetTexture = newTexture;
      refs.textureData = newData;
      lastPlanetSize.current = { width: planetWidth, height: planetHeight };
    }

    const data = refs.textureData;
    for (let i = 0; i < planetWidth * planetHeight; i++) {
      const [r, g, b] = terrainColorRGB(terrain[i], vegetation[i]);
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
    }
    refs.planetTexture.needsUpdate = true;

    updateCreatureInstances(refs, frame);
  }, [frame]);

  return (
    <div className="canvas-wrap">
      <div
        ref={containerRef}
        className="planet-canvas planet-canvas-3d"
        role="img"
        aria-label="Visualizzazione 3D del pianeta simulato — trascina per ruotare"
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
    planetWidth,
    planetHeight,
  } = frame;

  const population = organismsX.length;
  const stride = computeRenderStride(population, RENDER_TARGET_COUNT);

  let writeIndex = 0;
  for (let i = 0; i < population && writeIndex < MAX_CREATURE_INSTANCES; i += stride) {
    const point = projectToSphere(organismsX[i], organismsY[i], planetWidth, planetHeight, PLANET_RADIUS + 0.02);
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

    writeIndex++;
  }

  refs.bodyMesh.count = writeIndex;
  refs.spikeMesh.count = writeIndex;

  refs.bodyMesh.instanceMatrix.needsUpdate = true;
  refs.bodyMesh.instanceColor!.needsUpdate = true;
  refs.spikeMesh.instanceMatrix.needsUpdate = true;
  refs.spikeMesh.instanceColor!.needsUpdate = true;
}
