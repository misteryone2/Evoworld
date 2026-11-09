/**
 * v1.8.0 — Mondo 3D da vicino. La parte Three.js della "scena locale": mentre
 * si segue un animale in terza persona, intorno a lui il pianeta non è più
 * una texture sulla sfera ma una mesh di terreno ad alto dettaglio con le sue
 * piante in 3D. Si ricostruisce solo quando arriva un nuovo ViewportFrame
 * locale (ogni qualche secondo), mai a ogni fotogramma.
 *
 * La geometria è alla risoluzione delle celle della simulazione (è tutto ciò
 * che c'è); l'aspetto "dettagliato" viene da vertici fitti con colori
 * interpolati, piccole asperità deterministiche (lib/localGround.ts) e da
 * decine di migliaia di istanze di piante (lib/flora.ts).
 */
import * as THREE from "three";
import type { ViewportFrame } from "../../types";
import type { QualityProfile } from "../../lib/qualityProfile";
import { projectToSphere } from "../../lib/sphereProjection";
import { terrainColorRGB, applyWaterOverlayRGB, applySeasonalTintRGB, applyRockBySlopeRGB } from "../../lib/terrainColor";
import { yearPhase } from "../../simulation/planet/seasons";
import {
  type LocalGround,
  createLocalGround,
  groundChannel,
  groundCode,
  groundDisplacement,
  groundRadius,
  hash2,
  valueNoise,
} from "../../lib/localGround";
import { createTrunkField, type TrunkField } from "../../lib/trunkAvoid";
import { createWaveNormalTexture } from "../../lib/waveNormals";
import { floraBudget, foliageColor, planFlora, plantShape, type PlantPlacement } from "../../lib/flora";

/** Quanto si abbassa l'anello esterno della mesh, per nascondere la fessura con la mesh globale. */
export const TERRAIN_SKIRT = 0.1;

/** v1.9.4 — Quanto la superficie dell'acqua si alza sopra il letto (fiumi/laghi), in unità del mondo. */
export const WATER_LIFT = 0.012;

export interface LocalSceneStats {
  terrainVertices: number;
  plants: number;
  instances: number;
}

export interface LocalScene {
  group: THREE.Group;
  /** v1.9.1 — i tronchi degli alberi attuali, per far girare le creature intorno (solo nel disegno). */
  trunks: TrunkField;
  /** v1.9.4 — fa scorrere le onde: chiamato a ogni frame dalla vista (tempo in secondi). */
  updateWater(timeSec: number): void;
  /** Il terreno locale attuale (null finché non è arrivato il primo ViewportFrame locale). */
  ground: LocalGround | null;
  update(vf: ViewportFrame, planetWidth: number, planetHeight: number, focusX: number, focusY: number): void;
  setVisible(visible: boolean): void;
  /** Dimentica il terreno attuale e toglie le piante (all'uscita dalla terza persona). */
  clear(): void;
  stats(): LocalSceneStats;
  dispose(): void;
}

const UP = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const IDENTITY_Q = new THREE.Quaternion();

/** Un ciuffo d'erba: cinque fili triangolari che si aprono a ventaglio. Base a y = 0, altezza 1. */
export function createGrassTuftGeometry(): THREE.BufferGeometry {
  const blades = 5;
  const positions: number[] = [];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + 0.4;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const tipHeight = 0.75 + 0.25 * (i % 2);
    const base = 0.12;
    const half = 0.07;
    // base: due vertici affiancati, punta inclinata verso l'esterno
    positions.push(ca * base - sa * half, 0, sa * base + ca * half);
    positions.push(ca * base + sa * half, 0, sa * base - ca * half);
    positions.push(ca * 0.42, tipHeight, sa * 0.42);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function baseUnit(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.translate(0, 0.5, 0); // base a y = 0
  return geometry;
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
  mesh.count = 0;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity) * 3), 3);
  // La sfera di ingombro di una InstancedMesh si calcola una volta sola, a zero istanze: va sempre scartata.
  mesh.frustumCulled = false;
  return mesh;
}

export function createLocalScene(quality: QualityProfile, planetRadius: number): LocalScene {
  const group = new THREE.Group();
  group.visible = false;

  const segments = Math.max(0, quality.localTerrainSegments);
  const vertsPerSide = segments + 1;
  const vertexCount = segments > 0 ? vertsPerSide * vertsPerSide : 0;

  // ---- terreno ----
  const terrainGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  terrainGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  terrainGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  if (segments > 0) {
    const index: number[] = [];
    for (let j = 0; j < segments; j++) {
      for (let i = 0; i < segments; i++) {
        const a = j * vertsPerSide + i;
        const b = a + 1;
        const c = a + vertsPerSide;
        const d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
    terrainGeometry.setIndex(index);
  }
  const terrainMaterial =
    quality.level === "alto"
      ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })
      : new THREE.MeshLambertMaterial({ vertexColors: true });
  const terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrainMesh.frustumCulled = false;
  // v1.9.2 — al livello "Completa" il terreno riceve le ombre del sole e gli alberi le proiettano.
  const shadows = quality.level === "alto";
  terrainMesh.receiveShadow = shadows;
  group.add(terrainMesh);

  // ---- v1.9.4 — acqua: superficie sopra fiumi e laghi ----
  // v1.9.5 — le onde sono condivise con l'oceano in orbita: lib/waveNormals.ts
  const waveTexture = createWaveNormalTexture();
  waveTexture.repeat.set(6, 6);

  const waterGeometry = new THREE.BufferGeometry();
  const waterPositions = new Float32Array(vertexCount * 3);
  const waterFlags = new Uint8Array(vertexCount); // 1 = il vertice è su una cella d'acqua
  waterGeometry.setAttribute("position", new THREE.BufferAttribute(waterPositions, 3));
  // v1.9.4b — senza UV la normal map campiona sempre lo stesso punto: onde ferme e
  // niente riflesso. La griglia è regolare, quindi gli UV sono banali.
  const waterUvs = new Float32Array(vertexCount * 2);
  for (let j = 0; j <= segments; j++) {
    for (let i = 0; i <= segments; i++) {
      const k = j * vertsPerSide + i;
      waterUvs[k * 2] = i / segments;
      waterUvs[k * 2 + 1] = j / segments;
    }
  }
  waterGeometry.setAttribute("uv", new THREE.BufferAttribute(waterUvs, 2));
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e5a96,
    transparent: true,
    opacity: 0.82,
    roughness: 0.12,
    metalness: 0.05,
    normalMap: waveTexture,
    normalScale: new THREE.Vector2(0.5, 0.5),
  });
  const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
  waterMesh.frustumCulled = false;
  waterMesh.receiveShadow = shadows;
  waterMesh.renderOrder = 1; // dopo il terreno: la trasparenza si ordina bene
  waterMesh.visible = false;
  group.add(waterMesh);

  // ---- flora ----
  const budget = floraBudget(quality.floraMax);
  const treeCap = budget.trees;
  const flatLeaf = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const solid = new THREE.MeshLambertMaterial();
  const crownDetail = quality.level === "alto" ? 1 : 0;
  const floraEnabled = quality.floraMax > 0;
  const trunks: TrunkField = createTrunkField(budget.trees);
  const trunkMesh = instanced(baseUnit(new THREE.CylinderGeometry(0.7, 1, 1, 6)), solid, floraEnabled ? treeCap : 0);
  const crownMesh = instanced(new THREE.IcosahedronGeometry(1, crownDetail), solid, floraEnabled ? treeCap + budget.bushes : 0);
  const coneMesh = instanced(baseUnit(new THREE.ConeGeometry(1, 1, 7)), solid, floraEnabled ? treeCap * 2 : 0);
  const cactusMesh = instanced(baseUnit(new THREE.CylinderGeometry(0.85, 1, 1, 6)), solid, floraEnabled ? treeCap * 3 : 0);
  const grassMesh = instanced(createGrassTuftGeometry(), flatLeaf, floraEnabled ? budget.grass : 0);
  for (const m of [trunkMesh, crownMesh, coneMesh, cactusMesh]) m.castShadow = shadows; // l'erba no: troppo sottile
  const floraMeshes = [trunkMesh, crownMesh, coneMesh, cactusMesh, grassMesh];
  for (const m of floraMeshes) group.add(m);

  const parent = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const qUp = new THREE.Quaternion();
  const qYaw = new THREE.Quaternion();
  const qLean = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const color = new THREE.Color();

  const state: { ground: LocalGround | null; plants: number; instances: number } = { ground: null, plants: 0, instances: 0 };

  function writeTerrain(ground: LocalGround): void {
    if (segments <= 0) return;
    const { vf, planetWidth, planetHeight } = ground;
    const phase = yearPhase(vf.tick);
    for (let j = 0; j <= segments; j++) {
      for (let i = 0; i <= segments; i++) {
        const k = j * vertsPerSide + i;
        const gx = vf.originX + (i / segments) * vf.cellsWidth;
        const gy = vf.originY + (j / segments) * vf.cellsHeight;
        const edge = i === 0 || j === 0 || i === segments || j === segments;
        const r = planetRadius + groundDisplacement(ground, gx, gy) - (edge ? TERRAIN_SKIRT : 0);
        const p = projectToSphere(gx, gy, planetWidth, planetHeight, r);
        positions[k * 3] = p.x;
        positions[k * 3 + 1] = p.y;
        positions[k * 3 + 2] = p.z;

        // v1.9.4 — Acqua: la superficie è lo stesso vertice spinto in fuori di WATER_LIFT
        // lungo la sua stessa direzione radiale (niente seconda proiezione). La posizione
        // si scrive sempre, così i quad d'acqua non ereditano mai coordinate vecchie.
        const isRiver = groundChannel(ground, vf.riverFlow, gx, gy) > 0.03;
        const isLake = groundCode(ground, vf.lake, gx, gy) === 1;
        waterFlags[k] = isRiver || isLake ? 1 : 0;
        const waterScale = (r + WATER_LIFT) / r;
        waterPositions[k * 3] = p.x * waterScale;
        waterPositions[k * 3 + 1] = p.y * waterScale;
        waterPositions[k * 3 + 2] = p.z * waterScale;

        const terrain = groundCode(ground, vf.terrain, gx, gy);
        const vegetation = groundChannel(ground, vf.vegetation, gx, gy);
        const temperature = groundChannel(ground, vf.temperature, gx, gy);
        let rgb = terrainColorRGB(terrain, vegetation);
        // v1.9.3 — Materiali: i pendii ripidi diventano roccia. Pendenza dalle
        // differenze centrali dello spostamento reale del terreno, per cella
        // della simulazione; 0.04 unità di rilievo per cella = pendio pieno.
        const step = vf.cellsWidth / segments;
        const slopePerCell =
          (Math.abs(groundDisplacement(ground, gx + step, gy) - groundDisplacement(ground, gx - step, gy)) +
            Math.abs(groundDisplacement(ground, gx, gy + step) - groundDisplacement(ground, gx, gy - step))) /
          (2 * step);
        rgb = applyRockBySlopeRGB(rgb, slopePerCell / 0.04, terrain);
        rgb = applyWaterOverlayRGB(rgb, groundChannel(ground, vf.riverFlow, gx, gy), groundCode(ground, vf.lake, gx, gy) === 1);
        const wrappedY = ((gy % planetHeight) + planetHeight) % planetHeight;
        rgb = applySeasonalTintRGB(rgb, terrain, vegetation, temperature, wrappedY < planetHeight / 2 ? phase : (phase + 0.5) % 1);
        // variazione di luminosità a macchie, così il suolo non è una tinta unita
        const shade = 0.9 + 0.2 * valueNoise(gx * 0.9, gy * 0.9, 5) + 0.06 * (hash2(Math.floor(gx * 3), Math.floor(gy * 3), 9) - 0.5);
        colors[k * 3] = Math.min(1, (rgb[0] / 255) * shade);
        colors[k * 3 + 1] = Math.min(1, (rgb[1] / 255) * shade);
        colors[k * 3 + 2] = Math.min(1, (rgb[2] / 255) * shade);
      }
    }
    (terrainGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (terrainGeometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    terrainGeometry.computeVertexNormals();

    // v1.9.4 — Acqua: si disegnano solo i quad con almeno 2 vertici su acqua (le rive
    // restano sfumate dalla trasparenza); il resto della griglia non costa nulla.
    const wIndex: number[] = [];
    for (let j = 0; j < segments; j++) {
      for (let i = 0; i < segments; i++) {
        const a = j * vertsPerSide + i;
        const b = a + 1;
        const c = a + vertsPerSide;
        const d = c + 1;
        if (waterFlags[a] + waterFlags[b] + waterFlags[c] + waterFlags[d] >= 2) {
          wIndex.push(a, c, b, b, c, d);
        }
      }
    }
    waterGeometry.setIndex(wIndex);
    (waterGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    if (wIndex.length > 0) waterGeometry.computeVertexNormals();
    waterMesh.visible = wIndex.length > 0;
  }

  // contatori di istanze scritte per ciascuna mesh nell'aggiornamento corrente
  const used = { trunk: 0, crown: 0, cone: 0, cactus: 0, grass: 0 };

  function put(mesh: THREE.InstancedMesh, slot: keyof typeof used, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: THREE.Color): void {
    const index = used[slot];
    if (index >= mesh.instanceMatrix.count) return;
    pos.set(x, y, z);
    scl.set(sx, sy, sz);
    local.compose(pos, IDENTITY_Q, scl);
    world.multiplyMatrices(parent, local);
    mesh.setMatrixAt(index, world);
    mesh.setColorAt(index, c);
    used[slot] = index + 1;
  }

  const leaf = new THREE.Color();
  const wood = new THREE.Color();

  function writePlant(ground: LocalGround, plant: PlantPlacement, phase: number): void {
    const r = groundRadius(ground, plant.gx, plant.gy, planetRadius) - 0.004;
    const p = projectToSphere(plant.gx, plant.gy, ground.planetWidth, ground.planetHeight, r);
    normal.set(p.normalX, p.normalY, p.normalZ);
    qUp.setFromUnitVectors(UP, normal);
    qYaw.setFromAxisAngle(UP, plant.yaw);
    const leanAmount = plant.kind === "palm" ? 0.18 : 0.1;
    qLean.setFromAxisAngle(AXIS_X, plant.genes.lean * leanAmount);
    q.copy(qUp).multiply(qYaw).multiply(qLean);
    pos.set(p.x, p.y, p.z);
    parent.compose(pos, q, ONE);

    const shape = plantShape(plant.kind, plant.genes);
    const [fr, fg, fb] = foliageColor(plant, phase);
    leaf.setRGB(fr / 255, fg / 255, fb / 255);
    const woodShade = 0.8 + 0.3 * plant.genes.height;
    wood.setRGB((plant.kind === "palm" ? 120 : 88) * woodShade / 255, (plant.kind === "palm" ? 96 : 64) * woodShade / 255, 42 * woodShade / 255);

    const { height: h, trunkHeight: th, trunkRadius: tr, crownRadius: cr } = shape;
    switch (plant.kind) {
      case "broadleaf":
        put(trunkMesh, "trunk", 0, 0, 0, tr, th, tr, wood);
        put(crownMesh, "crown", 0, th + cr * 0.55, 0, cr, cr * 0.85, cr, leaf);
        break;
      case "palm":
        put(trunkMesh, "trunk", 0, 0, 0, tr, th, tr, wood);
        put(crownMesh, "crown", 0, th + cr * 0.1, 0, cr * 1.3, cr * 0.4, cr * 1.3, leaf);
        break;
      case "acacia":
        put(trunkMesh, "trunk", 0, 0, 0, tr, th, tr, wood);
        put(crownMesh, "crown", 0, th + cr * 0.15, 0, cr, cr * 0.3, cr, leaf);
        break;
      case "conifer": {
        put(trunkMesh, "trunk", 0, 0, 0, tr, th, tr, wood);
        put(coneMesh, "cone", 0, th * 0.7, 0, cr, h * 0.58, cr, leaf);
        color.copy(leaf).multiplyScalar(1.12);
        put(coneMesh, "cone", 0, th + h * 0.36, 0, cr * 0.68, h * 0.46, cr * 0.68, color);
        break;
      }
      case "bush":
        put(crownMesh, "crown", 0, cr * 0.45, 0, cr, cr * 0.7, cr, leaf);
        break;
      case "cactus": {
        put(cactusMesh, "cactus", 0, 0, 0, tr, h, tr, leaf);
        const arms = hash2(plant.cellX, plant.cellY, 77) < 0.5 ? 1 : 2;
        put(cactusMesh, "cactus", tr * 1.9, h * 0.35, 0, tr * 0.62, h * 0.3, tr * 0.62, leaf);
        if (arms === 2) put(cactusMesh, "cactus", -tr * 1.9, h * 0.5, 0, tr * 0.62, h * 0.26, tr * 0.62, leaf);
        break;
      }
      default:
        put(grassMesh, "grass", 0, 0, 0, cr * 1.2, h, cr * 1.2, leaf);
    }
  }

  function writeFlora(ground: LocalGround, focusX: number, focusY: number): void {
    used.trunk = used.crown = used.cone = used.cactus = used.grass = 0;
    trunks.count = 0;
    trunks.planetWidth = ground.planetWidth;
    trunks.planetHeight = ground.planetHeight;
    trunks.cellX = (2 * Math.PI * planetRadius) / Math.max(1, ground.planetWidth);
    trunks.cellY = (Math.PI * planetRadius) / Math.max(1, ground.planetHeight);
    const plan = floraEnabled ? planFlora(ground, focusX, focusY, budget) : [];
    const phase = yearPhase(ground.vf.tick);
    for (const plant of plan) {
      // la stagione di ogni pianta dipende dal suo emisfero, come per il terreno
      const wrappedY = ((plant.gy % ground.planetHeight) + ground.planetHeight) % ground.planetHeight;
      writePlant(ground, plant, wrappedY < ground.planetHeight / 2 ? phase : (phase + 0.5) % 1);
      // v1.9.1 — i tronchi (non erba né cespugli: quelli si attraversano) fermano le creature.
      if (plant.kind !== "grass" && plant.kind !== "bush" && trunks.count < trunks.gx.length) {
        const k = trunks.count++;
        trunks.gx[k] = plant.gx;
        trunks.gy[k] = plant.gy;
        trunks.radius[k] = plantShape(plant.kind, plant.genes).trunkRadius;
      }
    }
    trunkMesh.count = used.trunk;
    crownMesh.count = used.crown;
    coneMesh.count = used.cone;
    cactusMesh.count = used.cactus;
    grassMesh.count = used.grass;
    for (const m of floraMeshes) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    state.plants = plan.length;
    state.instances = used.trunk + used.crown + used.cone + used.cactus + used.grass;
  }

  return {
    group,
    trunks,
    get ground() {
      return state.ground;
    },
    update(vf, planetWidth, planetHeight, focusX, focusY) {
      const ground = createLocalGround(vf, planetWidth, planetHeight, planetRadius);
      state.ground = ground;
      writeTerrain(ground);
      writeFlora(ground, focusX, focusY);
    },
    setVisible(visible) {
      group.visible = visible;
    },
    clear() {
      state.ground = null;
      trunks.count = 0;
      state.plants = 0;
      state.instances = 0;
      for (const m of floraMeshes) m.count = 0;
      waterGeometry.setIndex([]);
      waterMesh.visible = false;
    },
    updateWater(timeSec) {
      waveTexture.offset.set((timeSec * 0.033) % 1, (timeSec * 0.021) % 1);
    },
    stats() {
      return { terrainVertices: vertexCount, plants: state.plants, instances: state.instances };
    },
    dispose() {
      terrainGeometry.dispose();
      terrainMaterial.dispose();
      waterGeometry.dispose();
      waterMaterial.dispose();
      waveTexture.dispose();
      for (const m of floraMeshes) m.geometry.dispose();
      solid.dispose();
      flatLeaf.dispose();
      group.removeFromParent();
    },
  };
}
