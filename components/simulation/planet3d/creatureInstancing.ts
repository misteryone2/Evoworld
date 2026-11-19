import * as THREE from "three";
import type { RenderFrame } from "../../../types";
import { speciesHue } from "../../../lib/speciesColor";
import { hueShiftFromVariation, stableVariation01 } from "../../../lib/visual/creatureVisualDescriptor";
import {
  GENERIC_RENDER_SLOTS, RENDER_POOL_LIMITS, isUsableAnatomyRenderPlanCached,
  type AnatomyRenderPlan, type CreatureAnatomyRenderSource, type CreaturePartInstance, type CreatureRenderPartKey,
} from "../../../lib/visual/anatomyRenderPlan";
import { computeCreatureAnatomy, MAX_SPIKES, type CreatureAnatomy } from "../../../lib/creatureAnatomy";
import type { Heading } from "../../../lib/creatureHeading";
import { createVisualMotion, stepVisualMotion } from "../../../lib/naturalMotion";
import { advancePhase, computeBodyPose, createBodyPose, normalizedSpeed } from "../../../lib/bodyAnimation";
import { applyLivingPose, createLivingState, stepLiving } from "../../../lib/livingBehavior";
import { createLodDetail, createLodWeights, lodDetail, lodWeights, FULL_DETAIL } from "../../../lib/animationLod";
import { collectNearbyOrganisms, ensureCandidateBuffer } from "../../../lib/followCull";
import { creatureScale } from "../../../lib/worldScale";
import { bodyRadiusUnits } from "../../../simulation/core/scale";
import { pushOutOfTrunks, type XY } from "../../../lib/trunkAvoid";
import { projectToSphereInto, type SpherePoint } from "../../../lib/sphereProjection";
import { computeRenderStride } from "../../../lib/renderSampling";
import {
  createAdaptiveState, farUpdateDue,
  DEFAULT_CULL_MARGIN_UNITS, DEFAULT_FAR_STRIDE, DEFAULT_NEAR_DISTANCE_SCALES,
} from "../../../lib/adaptiveRender";
import { groundContains } from "../../../lib/localGround";
import { AGGRESSION_VISIBLE_THRESHOLD, CONE_BASE_RADIUS, LEGS_PER_CREATURE, PLANET_RADIUS } from "./constants";
import { restingRadius } from "./terrainSampling";
import type { CreatureTrack, SceneRefs } from "./types";

// Scratch condiviso solo da questo modulo: nessuna allocazione per creatura/frame.
const UP = new THREE.Vector3(0, 1, 0);
let trackGeneration = 0;
const tmpDrawn: XY = { x: 0, y: 0 };
// v1.10.3 — animazione del corpo: posa e matrici di lavoro riusate per ogni creatura (nessuna allocazione per frame)
const tmpPose = createBodyPose();
const tmpLodWeights = createLodWeights();
const tmpLodDetail = createLodDetail();
const tmpHeadParent = new THREE.Matrix4();
const tmpHeadLocal = new THREE.Matrix4();
const tmpNeckBack = new THREE.Matrix4();
const tmpHeadQuat = new THREE.Quaternion();
const tmpTailQuat = new THREE.Quaternion();
const tmpPoseEuler = new THREE.Euler();
const tmpPoseVec = new THREE.Vector3();
const ONE_VEC = new THREE.Vector3(1, 1, 1);
const tmpLeanEuler = new THREE.Euler();
const tmpLeanQuat = new THREE.Quaternion();
const tmpPoint: SpherePoint = { x: 0, y: 0, z: 0, normalX: 0, normalY: 0, normalZ: 0 };
const tmpAhead: SpherePoint = { x: 0, y: 0, z: 0, normalX: 0, normalY: 0, normalZ: 0 };


// Reused scratch objects for the per-frame instance update loop, to avoid
// allocating thousands of THREE.Vector3/Matrix4/Color objects every tick.
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
const tmpGenericQuat = new THREE.Quaternion();
const GENERIC_KEYS = Object.keys(GENERIC_RENDER_SLOTS) as CreatureRenderPartKey[];
/** Rotates a cone (tip along +Y) so its tip points backward (-Z): the tail. */
const Q_TIP_BACK = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
/** Rotates a cone so its tip points forward (+Z): the jaw. */
const Q_TIP_FORWARD = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
// G3.1 — direzione della camera per il culling dietro il piano di imaging.
const tmpCameraForward = new THREE.Vector3();

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
 * v1.10.5 — Come setPart, ma posizione e scala locali si scrivono prima nei vettori di lavoro (`tmpLocalPos`,
 * `tmpLocalScale`) invece di passarle come argomenti. Nel ciclo per creatura setPart si chiamava una quindicina di
 * volte con sei numeri decimali, e V8, non potendola espandere in linea in una funzione così grande, creava un
 * oggetto temporaneo per ognuno: circa 1,4 KB di spazzatura per creatura a ogni aggiornamento. Così no.
 */
function commitPart(mesh: THREE.InstancedMesh, index: number, parent: THREE.Matrix4, rotation: THREE.Quaternion): void {
  tmpLocal.compose(tmpLocalPos, rotation, tmpLocalScale);
  tmpPartMatrix.multiplyMatrices(parent, tmpLocal);
  mesh.setMatrixAt(index, tmpPartMatrix);
}

// ---- G-REV-02: pool generici G2. Nessuna allocazione per parte/frame. ----
/**
 * G3 — crescita controllata: il mesh viene sostituito solo quando la domanda
 * supera la capacità, con headroom del 25% arrotondato a 64 istanze. Geometria
 * e materiale sono riutilizzati; `dispose()` libera solo i buffer di istanza.
 */
function ensureGenericPool(refs: SceneRefs, key: CreatureRenderPartKey, slots: number, stats?: SceneRefs["creatureRenderStats"]): void {
  const mesh = refs.genericMeshes?.[key];
  if (!mesh) return;
  const needed = Math.max(1, refs.capacity * slots);
  if (mesh.instanceMatrix.count >= needed) return;
  const ceiling = Math.max(needed, RENDER_POOL_LIMITS[key] * refs.capacity);
  const headroom = Math.ceil((needed * 1.25) / 64) * 64;
  const capacity = Math.min(ceiling, Math.max(needed, headroom));
  const next = new THREE.InstancedMesh(mesh.geometry, mesh.material, capacity);
  next.name = mesh.name;
  next.renderOrder = mesh.renderOrder;
  next.castShadow = mesh.castShadow;
  next.receiveShadow = mesh.receiveShadow;
  next.visible = false;
  next.count = 0;
  configureInstancedMesh(next);
  if (mesh.instanceColor) {
    next.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    next.instanceColor.setUsage(mesh.instanceColor.usage);
  }
  const parent = mesh.parent;
  if (parent) {
    parent.add(next);
    parent.remove(mesh);
  }
  mesh.dispose();
  refs.genericMeshes![key] = next;
  if (stats?.poolGrowth && stats.poolGrowth.length < 8) {
    stats.poolGrowth.push(`${key}:${mesh.instanceMatrix.count}->${capacity}`);
  }
}

/** Dimensiona i pool prima del loop, usando i massimi dichiarati dalla sorgente. */
function configureGenericPools(refs: SceneRefs, source: CreatureAnatomyRenderSource, stats?: SceneRefs["creatureRenderStats"]): void {
  if (!refs.genericMeshes) return;
  const requested = source.maxSlots?.() ?? null;
  if (!refs.genericSlotsPerCreature) refs.genericSlotsPerCreature = {};
  for (const key of GENERIC_KEYS) {
    const wanted = requested?.[key] ?? GENERIC_RENDER_SLOTS[key];
    const slots = Math.max(GENERIC_RENDER_SLOTS[key], Math.min(RENDER_POOL_LIMITS[key], Math.max(0, Math.floor(wanted))));
    refs.genericSlotsPerCreature[key] = slots;
    if (stats?.poolCapacity) stats.poolCapacity[key] = slots;
    ensureGenericPool(refs, key, slots, stats);
  }
}

type GenericCursors = Record<CreatureRenderPartKey, number>;

/**
 * G3 — layout denso dei pool generici: le parti reali vengono scritte in
 * sequenza da zero e `mesh.count` copre solo quelle scritte. Non serve più
 * azzerare tutti gli slot di ogni creatura (fino a 112 matrici each): le
 * istanze oltre `count` non vengono disegnate, quindi non c'è contaminazione
 * tra anatomie diverse. L'ordine delle parti resta quello del piano, e ogni
 * parte conserva posa, rotazione e colore propri: nessuna perdita di fedeltà.
 */
function writeGenericParts(
  refs: SceneRefs,
  parts: readonly CreaturePartInstance[] | null,
  cursors: GenericCursors,
  parent: THREE.Matrix4,
  lift: number,
  color: THREE.Color,
  active: boolean,
  stats?: SceneRefs["creatureRenderStats"],
): void {
  if (!refs.genericMeshes || !active || !parts) return;
  for (const part of parts) {
    if (!part.visible) continue;
    const mesh = refs.genericMeshes[part.key];
    if (!mesh) continue;
    // Difesa residua: i piani validati hanno slot < requiredSlots <= limite.
    if (part.slot < 0 || part.slot >= RENDER_POOL_LIMITS[part.key]) {
      if (stats) stats.droppedParts = (stats.droppedParts ?? 0) + 1;
      continue;
    }
    const slot = cursors[part.key]++;
    tmpLocalPos.set(part.position[0], part.position[1] + lift, part.position[2]);
    tmpLocalScale.set(part.scale[0], part.scale[1], part.scale[2]);
    tmpGenericQuat.set(part.rotation[0], part.rotation[1], part.rotation[2], part.rotation[3]);
    commitPart(mesh, slot, parent, tmpGenericQuat);
    if (mesh.instanceColor) mesh.setColorAt(slot, color);
  }
}

/** Carica su GPU solo l'intervallo realmente scritto, non l'intera capacità del pool. */
function flagInstanceUpdates(mesh: THREE.InstancedMesh): void {
  mesh.instanceMatrix.clearUpdateRanges();
  if (mesh.count > 0) {
    mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
    mesh.instanceMatrix.needsUpdate = true;
  }
  const color = mesh.instanceColor;
  if (color) {
    color.clearUpdateRanges();
    if (mesh.count > 0) {
      color.addUpdateRange(0, mesh.count * 3);
      color.needsUpdate = true;
    }
  }
}

/**
 * G3.1 — Azzera tutte le istanze di una creatura uscita dalla visuale. Serve
 * perché i buffer sono persistenti: senza questo, le matrici del frame
 * precedente resterebbero disegnate come "fantasmi". Nessun dato biologico
 * viene toccato; gli slot sono quelli dell'ultimo frame della creatura.
 */
function zeroCreatureSlots(refs: SceneRefs, slot: number, track: CreatureTrack): void {
  refs.bodyMesh.setMatrixAt(slot, ZERO_MATRIX);
  refs.headMesh.setMatrixAt(slot, ZERO_MATRIX);
  refs.shadowMesh.setMatrixAt(slot, ZERO_MATRIX);
  if (refs.detail >= 2) {
    refs.eyeMesh.setMatrixAt(slot * 2, ZERO_MATRIX);
    refs.eyeMesh.setMatrixAt(slot * 2 + 1, ZERO_MATRIX);
    refs.tailMesh.setMatrixAt(slot, ZERO_MATRIX);
    refs.jawMesh.setMatrixAt(slot, ZERO_MATRIX);
    for (let n = 0; n < LEGS_PER_CREATURE; n++) refs.legMesh.setMatrixAt(slot * LEGS_PER_CREATURE + n, ZERO_MATRIX);
  }
  if (refs.detail >= 3) {
    for (let n = 0; n < 2; n++) refs.earMesh.setMatrixAt(slot * 2 + n, ZERO_MATRIX);
    for (let n = 0; n < MAX_SPIKES; n++) refs.spikeMesh.setMatrixAt(slot * MAX_SPIKES + n, ZERO_MATRIX);
  }
  if (refs.genericMeshes) {
    const ranges: readonly [CreatureRenderPartKey, number, number][] = [
      ["segment", track.gSegment, track.cSegment],
      ["appendage", track.gAppendage, track.cAppendage],
      ["eye", track.gEye, track.cEye],
    ];
    for (const [key, start, count] of ranges) {
      const mesh = refs.genericMeshes[key];
      if (!mesh) continue;
      for (let n = 0; n < count; n++) mesh.setMatrixAt(start + n, ZERO_MATRIX);
    }
  }
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
 * v1.10.5 — Contro-ombreggiamento ventre-dorso: colori per vertice che il materiale moltiplica
 * per il colore della specie. Ventre chiaro e caldo (come il sottopelo di mammiferi e
 * uccelli reali), dorso scuro e freddo. Stesso costo di prima: solo colori per vertice.
 */
export function addBellyGradient(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i); // sfera unitaria: -1 ventre, +1 dorso
    const t = (y + 1) / 2; // 0 ventre, 1 dorso
    colors[i * 3] = 1.08 - 0.34 * t; // ventre caldo e chiaro, dorso molto più scuro
    colors[i * 3 + 1] = 1.04 - 0.26 * t;
    colors[i * 3 + 2] = 0.96 - 0.12 * t; // il dorso raffredda (più blu), il ventre scalda
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * v1.10.6 — Cielo con gradiente: una grande sfera rovesciata con colori per vertice
 * (zenit più scuro, orizzonte chiaro, foschia sotto). Una sola draw call, niente luci:
 * MeshBasicMaterial. Segue la camera, così non se ne esce mai guardandosi intorno.
 */


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
  /** v1.10.1/2 — millisecondi dall'aggiornamento precedente: rotazione, velocità e inclinazione visive dipendono dal tempo. */
  dtMs = 100,
  /** v1.10.5 — posizione della camera nel mondo 3D: la distanza decide il dettaglio dell'animazione (LOD). Senza, tutto è al massimo dettaglio. */
  cameraPosition: THREE.Vector3 | null = null,
  /** G-REV-02 — sorgente G2 opzionale. Senza, il percorso legacy resta identico a prima. */
  sourceOverride: CreatureAnatomyRenderSource | null = null,
): number {
  const renderSource = sourceOverride ?? refs.renderSource ?? null;
  const genericActive = renderSource !== null && !!refs.genericMeshes;
  const genericCursors: GenericCursors = { segment: 0, appendage: 0, eye: 0 };
  const stats = refs.creatureRenderStats;
  if (stats) {
    stats.drawn = 0;
    stats.mapped = 0;
    stats.legacy = 0;
    stats.fallback = 0;
    stats.unsupported = 0;
    stats.fallbackReasons.length = 0;
    stats.droppedParts = 0;
    stats.sourceReason = null;
    if (!stats.poolCapacity) stats.poolCapacity = {};
    else for (const key of GENERIC_KEYS) delete stats.poolCapacity[key];
    if (!stats.poolGrowth) stats.poolGrowth = [];
    else stats.poolGrowth.length = 0;
  }

  // G3.1 — percorso adattivo OPT-IN: senza `refs.adaptive.enabled` questa
  // funzione resta byte-per-byte equivalente al percorso G3.
  const settings = refs.adaptive && refs.adaptive.enabled ? refs.adaptive : null;
  const adaptiveOn = settings !== null;
  const farStride = adaptiveOn ? Math.max(1, Math.min(16, Math.floor(settings!.farStride ?? DEFAULT_FAR_STRIDE))) : 1;
  const nearDistance = adaptiveOn ? Math.max(1, settings!.nearDistanceScales ?? DEFAULT_NEAR_DISTANCE_SCALES) : 0;
  const cullBehind = adaptiveOn && !!settings!.cullBehindCamera && !!refs.camera;
  const cullMargin = settings?.cullMarginUnits ?? DEFAULT_CULL_MARGIN_UNITS;
  const adaptiveState = refs.adaptiveState ?? (refs.adaptiveState = createAdaptiveState());
  adaptiveState.frame++;
  const viewKey = refs.camera ? refs.camera.aspect * 1000 + refs.camera.fov : 0;
  const refreshAll = adaptiveState.detail !== refs.detail || adaptiveState.capacity !== refs.capacity
    || adaptiveState.viewKey !== viewKey;
  if (refreshAll) {
    adaptiveState.detail = refs.detail;
    adaptiveState.capacity = refs.capacity;
    adaptiveState.viewKey = viewKey;
  }
  if (cullBehind) refs.camera.getWorldDirection(tmpCameraForward);
  let updatedCount = 0;
  let skippedCount = 0;
  let culledCount = 0;
  let nearCount = 0;
  let farCount = 0;

  if (renderSource) configureGenericPools(refs, renderSource, stats);
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
    organismsEnergyGain,
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
  const halfWidth = planetWidth / 2;
  const halfHeight = planetHeight / 2;
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
    // v1.9.1 — x, y: dove sta la creatura nella simulazione (serve a orientarla e a farla camminare);
    // drawX, drawY: dove la si disegna, che differisce solo se un tronco le sta in mezzo (gira intorno all'albero).
    const x = organismsX[i];
    const y = organismsY[i];
    let drawX = x;
    let drawY = y;
    const trunks = refs.local?.trunks;
    if (trunks && trunks.count > 0 && refs.local?.ground && groundContains(refs.local.ground, x, y)) {
      pushOutOfTrunks(trunks, x, y, bodyRadiusUnits(organismsSize[i]), tmpDrawn);
      drawX = tmpDrawn.x;
      drawY = tmpDrawn.y;
    }

    const restingR = restingRadius(refs, drawX, drawY, 0.02);
    const point = projectToSphereInto(tmpPoint, drawX, drawY, planetWidth, planetHeight, restingR);
    tmpPosition.set(point.x, point.y, point.z);
    tmpNormal.set(point.normalX, point.normalY, point.normalZ);

    // Heading: face the way this creature has moved since the last frame
    // (keeps its previous heading while it stands still; first sight of a
    // creature faces north until it moves).
    // v1.10.5 — la scala si calcola una volta per creatura (prima 5 volte) e le funzioni piccole del ciclo non
    // ricevono più numeri decimali "uno per uno" quando basta scriverli sul posto: meno oggetti temporanei per frame.
    const scaleI = creatureScale(organismsSize[i]);
    let track = refs.creatureTrack.get(id);
    if (track) {
      let dxCells = x - track.x;
      if (dxCells > halfWidth) dxCells -= planetWidth;
      else if (dxCells < -halfWidth) dxCells += planetWidth;
      let dyCells = y - track.y;
      if (dyCells > halfHeight) dyCells -= planetHeight;
      else if (dyCells < -halfHeight) dyCells += planetHeight;
      // v1.10.2 — rotazione graduale e velocità/inclinazione visive (la posizione resta quella interpolata)
      const travelledUnitsNow = Math.sqrt(dxCells * dxCells + dyCells * dyCells) * cellUnits;
      stepVisualMotion(track.motion, dxCells, dyCells, travelledUnitsNow, dtMs, organismsSize[i], scaleI);
      if (track.motion.hasYaw) {
        track.hx = Math.cos(track.motion.yaw);
        track.hy = Math.sin(track.motion.yaw);
        track.hasHeading = true;
      }
      // v1.10.3 — la fase del passo avanza con la velocità visualizzata: la cadenza è proporzionale alla velocità e, da ferma, si ferma
      track.phase = advancePhase(track.phase, track.motion.visSpeed, dtMs, scaleI);
      // v1.10.4 — respiro, sguardo, mangia, riposa: dallo stato reale (velocità visualizzata, energia guadagnata)
      stepLiving(track.living, dtMs, normalizedSpeed(track.motion.visSpeed, scaleI), organismsEnergyGain ? organismsEnergyGain[i] : 0);
      track.x = x;
      track.y = y;
    } else {
      track = {
        motion: createVisualMotion(), living: createLivingState(id), x, y, hasHeading: false, hx: 0, hy: -1,
        phase: 0, gen: 0, anatomy: null, aSpeed: 0, aCarnivory: 0, aVision: 0, aEvasion: 0, aHunting: 0,
        aSize: 0, aSpecies: 0, renderPlan: null, renderSource: null, wasNear: false, wasVisible: false,
        slotZeroed: false, gSegment: 0, gAppendage: 0, gEye: 0, cSegment: 0, cAppendage: 0, cEye: 0,
      };
      refs.creatureTrack.set(id, track);
    }
    track.gen = generation;

    // ---- G3.1 — decisione adattiva (solo grafica) ----
    if (adaptiveOn) {
      let near = true;
      if (cameraPosition) {
        const cameraDx = tmpPosition.x - cameraPosition.x;
        const cameraDy = tmpPosition.y - cameraPosition.y;
        const cameraDz = tmpPosition.z - cameraPosition.z;
        const distanceInScales = Math.sqrt(cameraDx * cameraDx + cameraDy * cameraDy + cameraDz * cameraDz) / Math.max(1e-6, scaleI);
        near = distanceInScales <= nearDistance;
      }
      if (near) nearCount++; else farCount++;

      let visible = true;
      if (cullBehind) {
        const vx = tmpPosition.x - refs.camera.position.x;
        const vy = tmpPosition.y - refs.camera.position.y;
        const vz = tmpPosition.z - refs.camera.position.z;
        visible = vx * tmpCameraForward.x + vy * tmpCameraForward.y + vz * tmpCameraForward.z > -cullMargin;
      }

      // Identity del piano: invalida subito i dati grafici se geni, MOR, specie,
      // taglia o sorgente cambiano — anche per una creatura che verrebbe saltata.
      const planCandidate = renderSource ? renderSource.planFor(id, frame.tick) : null;
      const dirty = refreshAll
        || refs.instanceOrganismId[writeIndex] !== id
        || track.wasNear !== near
        || track.wasVisible !== visible
        || track.renderSource !== renderSource
        || planCandidate !== track.renderPlan
        || (!renderSource && (
          organismsSize[i] !== track.aSize || organismsSpecies[i] !== track.aSpecies
          || organismsSpeed[i] !== track.aSpeed || organismsCarnivory[i] !== track.aCarnivory
          || organismsVision[i] !== track.aVision || organismsEvasion[i] !== track.aEvasion
          || organismsHuntingSkill[i] !== track.aHunting));
      const due = near || farUpdateDue(adaptiveState.frame, writeIndex, farStride);

      if (!visible) {
        // Il primo frame gli slot contengono matrici identità: vanno azzerati
        // anche se la creatura non era stata disegnata prima.
        if (!track.slotZeroed) {
          zeroCreatureSlots(refs, writeIndex, track);
          track.slotZeroed = true;
        }
        refs.instanceOrganismId[writeIndex] = 0;
        genericCursors.segment += track.cSegment;
        genericCursors.appendage += track.cAppendage;
        genericCursors.eye += track.cEye;
        track.wasVisible = false;
        track.wasNear = near;
        culledCount++;
        writeIndex++;
        continue;
      }
      if (!dirty && !due) {
        // Nessun arretrato: il dato dell'ultimo aggiornamento resta nei buffer.
        refs.instanceOrganismId[writeIndex] = id;
        genericCursors.segment += track.cSegment;
        genericCursors.appendage += track.cAppendage;
        genericCursors.eye += track.cEye;
        track.wasVisible = true;
        track.wasNear = near;
        track.slotZeroed = false;
        skippedCount++;
        writeIndex++;
        continue;
      }
      track.wasVisible = true;
      track.slotZeroed = false;
      track.wasNear = near;
      track.renderSource = renderSource;
      track.renderPlan = planCandidate;
    }

    const phase = track.phase;
    const ahead = projectToSphereInto(tmpAhead, drawX + (track.hasHeading ? track.hx : 0) * 0.5, drawY + (track.hasHeading ? track.hy : -1) * 0.5, planetWidth, planetHeight, restingR);
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
    // v1.10.2 — il corpo si inclina in curva (attorno all'asse di marcia) e in accelerazione/frenata (attorno a quello trasversale)
    if (track.motion.roll !== 0 || track.motion.pitch !== 0) {
      tmpLeanQuat.setFromEuler(tmpLeanEuler.set(track.motion.pitch, 0, track.motion.roll, "XYZ"));
      tmpQuaternion.multiply(tmpLeanQuat);
    }

    // G-REV-02 — un piano G2 utilizzabile vince; tutto il resto resta sulla via legacy.
    // La sorgente è lato renderer: nessun dato anatomico entra in RenderFrame o nei salvataggi.
    const gSpeed = organismsSpeed[i];
    const gCarnivory = organismsCarnivory[i];
    const gVision = organismsVision[i];
    const gEvasion = organismsEvasion[i];
    const gHunting = organismsHuntingSkill[i];
    let plan: AnatomyRenderPlan | null = null;
    if (renderSource) {
      // G3.1 — in modalità adattiva il piano è già stato letto per la verifica
      // di invalidazione: rileggerlo due volte per creatura sarebbe uno spreco.
      const candidate: AnatomyRenderPlan | null = adaptiveOn ? track.renderPlan : renderSource.planFor(id, frame.tick);
      const usable = isUsableAnatomyRenderPlanCached(candidate);
      if (candidate && usable) {
        plan = candidate;
        if (stats) stats.mapped++;
      } else if (stats) {
        stats.fallback++;
        if (!candidate || !candidate.support.supported) stats.unsupported++;
        const reason = candidate?.fallbackReason ?? (candidate ? "invalid-render-plan" : renderSource.fallbackReason?.() ?? "no-render-plan");
        if (stats.fallbackReasons.length < 8 && !stats.fallbackReasons.includes(reason)) stats.fallbackReasons.push(reason);
      }
    }

    let anatomy: CreatureAnatomy;
    if (plan?.geometry) {
      anatomy = plan.geometry;
    } else {
      // v1.9.0 — l'anatomia dipende solo dai geni: si ricalcola solo se sono cambiati.
      let legacy = track.anatomy;
      if (!legacy || track.aSpeed !== gSpeed || track.aCarnivory !== gCarnivory || track.aVision !== gVision || track.aEvasion !== gEvasion || track.aHunting !== gHunting) {
        legacy = computeCreatureAnatomy({ speed: gSpeed, carnivory: gCarnivory, vision: gVision, evasion: gEvasion, huntingSkill: gHunting });
        track.anatomy = legacy;
        track.aSpeed = gSpeed;
        track.aCarnivory = gCarnivory;
        track.aVision = gVision;
        track.aEvasion = gEvasion;
        track.aHunting = gHunting;
      }
      anatomy = legacy;
      if (stats) stats.legacy++;
    }
    if (adaptiveOn) {
      track.aSize = organismsSize[i];
      track.aSpecies = organismsSpecies[i];
    }

    // sizeScale di G2 è una scala di rappresentazione: si applica una volta sola,
    // moltiplicando la scala mondiale già usata dal renderer legacy.
    const baseScale = scaleI * (plan?.geometry?.sizeScale ?? 1);
    tmpScale.set(baseScale, baseScale, baseScale);
    tmpCreatureMatrix.compose(tmpPosition, tmpQuaternion, tmpScale);

    // Senza zampe (dettaglio 1) il torso è affondato di un quinto della sua altezza nel suolo, così una creatura non sembra
    // mai fluttuare sul terreno irregolare. Con le zampe (v1.8.0) il corpo sta alla loro altezza, con i piedi sul suolo.
    const hasLegs = refs.detail >= 2;
    const lift = hasLegs ? anatomy.legLength * 0.97 + anatomy.bodyHalfHeight * 0.4 : anatomy.bodyHalfHeight * 0.8;

    // v1.10.3 — posa del corpo in cammino: zampe, corpo, testa e coda (dallo stato visivo, vedi lib/bodyAnimation.ts)
    // v1.10.5 — LOD: il dettaglio dell'animazione dipende dalla distanza dalla camera (in scale della creatura), con pesi continui
    let detail = FULL_DETAIL;
    if (cameraPosition) {
      const cdx = tmpPosition.x - cameraPosition.x;
      const cdy = tmpPosition.y - cameraPosition.y;
      const cdz = tmpPosition.z - cameraPosition.z;
      lodWeights(Math.sqrt(cdx * cdx + cdy * cdy + cdz * cdz) / baseScale, tmpLodWeights);
      detail = lodDetail(tmpLodWeights, tmpLodDetail);
    }
    computeBodyPose(tmpPose, phase, track.motion, baseScale, anatomy, detail);
    applyLivingPose(tmpPose, track.living, detail);
    // La testa (con occhi, mandibola e orecchie) ruota attorno al collo e segue il corpo; se non c'è movimento si usa la matrice della creatura.
    let headParent = tmpCreatureMatrix;
    if (tmpPose.headPitch !== 0 || tmpPose.headYaw !== 0 || tmpPose.bobY !== 0 || tmpPose.swayX !== 0 || tmpPose.surgeZ !== 0) {
      const neckY = lift + anatomy.headY * 0.5;
      const neckZ = anatomy.bodyHalfLength * 0.85;
      tmpHeadQuat.setFromEuler(tmpPoseEuler.set(tmpPose.headPitch, tmpPose.headYaw, 0, "YXZ"));
      tmpHeadLocal.compose(tmpPoseVec.set(tmpPose.swayX, neckY + tmpPose.bobY, neckZ + tmpPose.surgeZ), tmpHeadQuat, ONE_VEC);
      tmpHeadLocal.multiply(tmpNeckBack.makeTranslation(0, -neckY, -neckZ));
      tmpHeadParent.multiplyMatrices(tmpCreatureMatrix, tmpHeadLocal);
      headParent = tmpHeadParent;
    }

    { tmpLocalPos.x = tmpPose.swayX; tmpLocalPos.y = lift + tmpPose.bobY; tmpLocalPos.z = tmpPose.surgeZ; tmpLocalScale.x = anatomy.bodyHalfWidth * (1 + tmpPose.breath); tmpLocalScale.y = anatomy.bodyHalfHeight * (1 + tmpPose.breath); tmpLocalScale.z = anatomy.bodyHalfLength * (1 + tmpPose.breath * 0.3); commitPart(refs.bodyMesh, writeIndex, tmpCreatureMatrix, Q_IDENTITY); }
    { tmpLocalPos.x = 0; tmpLocalPos.y = lift + anatomy.headY; tmpLocalPos.z = anatomy.headZ; tmpLocalScale.x = anatomy.headRadius; tmpLocalScale.y = anatomy.headRadius; tmpLocalScale.z = anatomy.headRadius; commitPart(refs.headMesh, writeIndex, headParent, Q_IDENTITY); }
    // v1.6.0 — lighter profiles skip the finer parts entirely: eyes, tail
    // and jaw from detail 2, dorsal spikes only at detail 3.
    if (refs.detail >= 2) {
      { tmpLocalPos.x = -anatomy.eyeX; tmpLocalPos.y = lift + anatomy.eyeY; tmpLocalPos.z = anatomy.eyeZ; tmpLocalScale.x = anatomy.eyeRadius; tmpLocalScale.y = anatomy.eyeRadius; tmpLocalScale.z = anatomy.eyeRadius; commitPart(refs.eyeMesh, writeIndex * 2, headParent, Q_IDENTITY); }
      { tmpLocalPos.x = anatomy.eyeX; tmpLocalPos.y = lift + anatomy.eyeY; tmpLocalPos.z = anatomy.eyeZ; tmpLocalScale.x = anatomy.eyeRadius; tmpLocalScale.y = anatomy.eyeRadius; tmpLocalScale.z = anatomy.eyeRadius; commitPart(refs.eyeMesh, writeIndex * 2 + 1, headParent, Q_IDENTITY); }
      // la coda oscilla col passo e fa da contrappeso in curva (la rotazione si compone con quella che la fa puntare indietro)
      tmpTailQuat.setFromEuler(tmpPoseEuler.set(tmpPose.tailPitch, tmpPose.tailYaw, 0, "YXZ")).multiply(Q_TIP_BACK);
      { tmpLocalPos.x = tmpPose.swayX; tmpLocalPos.y = lift + tmpPose.bobY; tmpLocalPos.z = anatomy.tailZ + tmpPose.surgeZ; tmpLocalScale.x = anatomy.tailRadius / CONE_BASE_RADIUS; tmpLocalScale.y = anatomy.tailLength; tmpLocalScale.z = anatomy.tailRadius / CONE_BASE_RADIUS; commitPart(refs.tailMesh, writeIndex, tmpCreatureMatrix, tmpTailQuat); }
      if (anatomy.jawVisible) {
        { tmpLocalPos.x = 0; tmpLocalPos.y = lift + anatomy.jawY; tmpLocalPos.z = anatomy.jawZ; tmpLocalScale.x = anatomy.jawRadius / CONE_BASE_RADIUS; tmpLocalScale.y = anatomy.jawLength; tmpLocalScale.z = anatomy.jawRadius / CONE_BASE_RADIUS; commitPart(refs.jawMesh, writeIndex, headParent, Q_TIP_FORWARD); }
      } else {
        refs.jawMesh.setMatrixAt(writeIndex, ZERO_MATRIX);
      }
    }

    if (hasLegs) {
      // quattro zampe che oscillano in diagonale (trotto) mentre la creatura si muove
      for (let n = 0; n < LEGS_PER_CREATURE; n++) {
        const side = n % 2 === 0 ? -1 : 1;
        const front = n < 2;
        // v1.10.3 — oscillazione dalla posa: andatura (passo, trotto, galoppo) e ampiezza che va a zero da ferma
        tmpLegQuat.setFromAxisAngle(AXIS_X, tmpPose.legSwing[n]);
        { tmpLocalPos.x = side * anatomy.legX; tmpLocalPos.y = anatomy.legLength * 0.97; tmpLocalPos.z = front ? anatomy.legFrontZ : anatomy.legBackZ; tmpLocalScale.x = anatomy.legRadius; tmpLocalScale.y = anatomy.legLength; tmpLocalScale.z = anatomy.legRadius; commitPart(refs.legMesh, writeIndex * LEGS_PER_CREATURE + n, tmpCreatureMatrix, tmpLegQuat); }
      }
      // ombra morbida sul suolo
      { tmpLocalPos.x = 0; tmpLocalPos.y = 0.05; tmpLocalPos.z = 0; tmpLocalScale.x = anatomy.bodyHalfWidth * 1.5; tmpLocalScale.y = 1; tmpLocalScale.z = anatomy.bodyHalfLength * 1.4; commitPart(refs.shadowMesh, writeIndex, tmpCreatureMatrix, Q_IDENTITY); }
    }
    if (refs.detail >= 3) {
      // orecchie per gli erbivori, più grandi con la vista migliore, inclinate verso l'esterno
      for (let n = 0; n < 2; n++) {
        const slot = writeIndex * 2 + n;
        if (anatomy.earVisible) {
          const side = n === 0 ? -1 : 1;
          tmpLegQuat.setFromAxisAngle(AXIS_Z, -side * 0.35);
          { tmpLocalPos.x = side * anatomy.earX; tmpLocalPos.y = lift + anatomy.earY; tmpLocalPos.z = anatomy.earZ; tmpLocalScale.x = anatomy.earRadius / CONE_BASE_RADIUS; tmpLocalScale.y = anatomy.earHeight; tmpLocalScale.z = anatomy.earRadius / CONE_BASE_RADIUS; commitPart(refs.earMesh, slot, headParent, tmpLegQuat); }
        } else {
          refs.earMesh.setMatrixAt(slot, ZERO_MATRIX);
        }
      }
    }

    // Species color, warmed toward red the more predatory the creature is.
    // vNext (graphics pass) — variazione deterministica per individuo: stesso
    // organismo, stesso aspetto a ogni frame (nessun random a runtime), così la
    // popolazione non è una fila di cloni dello stesso colore di specie.
    const jitter = stableVariation01(organismsId[i]);
    // setHSL applica già euclideanModulo(h, 1): niente modulo aggiuntivo qui.
    const baseHue = (speciesHue(organismsSpecies[i]) + hueShiftFromVariation(jitter)) / 360;
    const baseSat = Math.min(0.95, 0.7 + (1 - anatomy.aggression) * 0.14 + (jitter - 0.5) * 0.06);
    const baseLight = Math.min(0.72, Math.max(0.44, 0.6 + (jitter - 0.5) * 0.1));
    tmpColor.setHSL(baseHue, baseSat, baseLight);
    if (anatomy.aggression > AGGRESSION_VISIBLE_THRESHOLD) {
      tmpColor.lerp(AGGRO_TINT, anatomy.aggression * 0.35);
    }
    // G-REV-02 — i pool generici G2 ricevono la stessa posa e lo stesso colore,
    // ma restano vuoti (e invisibili) finché non viene fornita una sorgente.
    // G3.1 — memorizza l'intervallo scritto nei pool densi: serve per azzerare
    // solo questa creatura se esce dalla visuale e per mantenere allineati i
    // cursori delle creature saltate nei frame successivi.
    if (adaptiveOn) {
      track.gSegment = genericCursors.segment;
      track.gAppendage = genericCursors.appendage;
      track.gEye = genericCursors.eye;
    }
    writeGenericParts(refs, plan?.parts ?? null, genericCursors, tmpCreatureMatrix, lift, tmpColor, genericActive, stats);
    if (adaptiveOn) {
      track.cSegment = genericCursors.segment - track.gSegment;
      track.cAppendage = genericCursors.appendage - track.gAppendage;
      track.cEye = genericCursors.eye - track.gEye;
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
        { tmpLocalPos.x = tmpPose.swayX; tmpLocalPos.y = lift + tmpPose.bobY + anatomy.bodyHalfHeight * 0.95 + spike.height * 0.45; tmpLocalPos.z = spike.z + tmpPose.surgeZ; tmpLocalScale.x = spike.radius / CONE_BASE_RADIUS; tmpLocalScale.y = spike.height; tmpLocalScale.z = spike.radius / CONE_BASE_RADIUS; commitPart(refs.spikeMesh, slot, tmpCreatureMatrix, Q_IDENTITY); }
        refs.spikeMesh.setColorAt(slot, tmpColor2);
      } else {
        refs.spikeMesh.setMatrixAt(slot, ZERO_MATRIX);
      }
    }

    refs.instanceOrganismId[writeIndex] = id;
    writeIndex++;
    if (adaptiveOn) updatedCount++;
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

  if (refs.genericMeshes) {
    for (const key of GENERIC_KEYS) {
      const mesh = refs.genericMeshes[key];
      if (!mesh) continue;
      mesh.count = genericActive ? genericCursors[key] : 0;
      mesh.visible = mesh.count > 0;
      flagInstanceUpdates(mesh);
    }
  }

  for (const mesh of [refs.bodyMesh, refs.headMesh, refs.eyeMesh, refs.tailMesh, refs.jawMesh, refs.spikeMesh, refs.legMesh, refs.earMesh, refs.shadowMesh]) {
    flagInstanceUpdates(mesh);
  }
  if (stats) {
    stats.drawn = adaptiveOn ? writeIndex - culledCount : writeIndex;
    stats.sourceReason = renderSource?.fallbackReason?.() ?? null;
    if (adaptiveOn) {
      stats.adaptive = true;
      stats.updated = updatedCount;
      stats.skipped = skippedCount;
      stats.culled = culledCount;
      stats.lodNear = nearCount;
      stats.lodFar = farCount;
    } else if (stats.adaptive) {
      // Ritorno al percorso G3: i contatori adattivi non sono più validi.
      stats.adaptive = false;
      stats.updated = 0;
      stats.skipped = 0;
      stats.culled = 0;
      stats.lodNear = 0;
      stats.lodFar = 0;
    }
  }
  // v1.10.5 (consolidamento) — quante creature sono state disegnate: chi chiama sa se c'è una posa viva da far proseguire (pausa).
  return writeIndex;
}

