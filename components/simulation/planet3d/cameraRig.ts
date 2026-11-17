import * as THREE from "three";
import type { RenderFrame } from "../../../types";
import { headingBlendForDt, nextHeading, wrappedDelta, type Heading } from "../../../lib/creatureHeading";
import { cameraClearance, clampCameraRadius, computeFollowPose, dampingAlpha, directionToGrid, easeAngleToZero, type Vec3 } from "../../../lib/followCamera";
import { nearestOrganismId } from "../../../lib/followTarget";
import { projectToSphere } from "../../../lib/sphereProjection";
import { creatureScale } from "../../../lib/worldScale";
import { PLANET_RADIUS } from "./constants";
import { restingRadius } from "./terrainSampling";
import type { SceneRefs } from "./types";

/** v1.7.0 — costante di tempo (ms) dello smorzamento della camera: abbastanza alta da assorbire i salti tra un frame e l'altro. */
const FOLLOW_SMOOTHING_MS = 140;
/** v1.7.0 — dopo quanto tempo senza tocchi la camera torna dietro l'animale, e con che costante di tempo. */
const FOLLOW_RECENTER_DELAY_MS = 2500;
const FOLLOW_RECENTER_TIME_MS = 600;
/** v1.7.0 — se l'animale seguito sparisce (morto) per più di così, si passa al più vicino. */
const FOLLOW_LOST_TARGET_MS = 1500;
/** v1.7.0 — se la nuova posa dista più di così dalla camera attuale (altro animale lontano), la camera salta invece di attraversare il pianeta. */
const FOLLOW_SNAP_DISTANCE = 2.5;

/** v1.7.0 — radianti per pixel trascinato. */
const FOLLOW_YAW_PER_PX = 0.006;
const FOLLOW_PITCH_PER_PX = 0.004;
const FOLLOW_PITCH_MIN = -0.3;
const FOLLOW_PITCH_MAX = 1.0;

/**
 * v1.10.8 — Camera libera: velocità del punto d'osservazione verso il punto toccato (unità del mondo
 * al secondo). v1.10.8b — la "scala" qui sotto non è quella di una creatura: decide distanza E punto
 * guardato (target a scala*1.1 dal suolo). Con 2.2 la camera guardava un punto a 2,4 unità d'altezza:
 * solo cielo. Con 0.55 la distanza resta al massimo (2,2 unità, vista panoramica) e il punto guardato
 * sta a ~0,6 dal suolo: si vede il terreno e le creature attorno.
 */
const FREE_MOVE_UNITS_PER_SEC = 2.4;
const FREE_CAMERA_SCALE = 0.55;
/**
 * v1.10.9 — movimento fluido in vista libera: il punto d'osservazione non parte e non arriva più a scatto.
 * Accelera dolcemente (unità/s²) e frena in proporzionalità inversa alla distanza che resta (v = √(2·a·d)),
 * così l'arrivo è morbido qualunque sia la lunghezza del viaggio.
 */
const FREE_ACCEL_UNITS_PER_S2 = 3;
const FREE_BRAKE_UNITS_PER_S2 = 3.5;
/**
 * v1.10.10 — SCORRIMENTO: in vista libera trascinare (mouse premuto su PC, dito su telefono) sposta il
 * punto d'osservazione nella direzione del gesto, come su una mappa. Quanti unità del mondo per pixel
 * trascinati (a ~2,2 unità di distanza della camera, mezzo schermo ≈ qualche unità di terreno).
 */
const FREE_DRAG_UNITS_PER_PX = 0.014;

// Scratch della camera: condivisi tra terza persona, vista libera e scorrimento.
const UP = new THREE.Vector3(0, 1, 0);
const tmpRight = new THREE.Vector3(1, 0, 0);

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
  /** v1.10.8 — camera libera: punto della superficie verso cui il punto d'osservazione sta andando (coordinate griglia). */
  goalX: number;
  goalY: number;
  hasGoal: boolean;
  /** v1.10.9 — camera libera: velocità attuale del punto d'osservazione (unità del mondo al secondo), per accelerare e frenare dolcemente. */
  freeSpeed: number;
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
    goalX: 0,
    goalY: 0,
    hasGoal: false,
    freeSpeed: 0,
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
  state.hasGoal = false;
  state.freeSpeed = 0;
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
// v1.10.10 — temporanei dello scorrimento in vista libera (panFreeCamera).
const panRight = new THREE.Vector3();
const panWorld = new THREE.Vector3();

/**
 * Posiziona la camera dietro e sopra l'animale `selectedId`, guardando
 * leggermente davanti a lui. Va chiamata a ogni frame di rendering mentre la
 * modalità è "terza persona". Restituisce l'id di un altro animale se quello
 * seguito è sparito (morto) da troppo tempo — il chiamante lo seleziona —,
 * altrimenti null. Finché l'animale manca la camera resta dove l'ha visto.
 */
export function updateFollowCamera(
  refs: Pick<SceneRefs, "camera" | "heightmap"> & Partial<Pick<SceneRefs, "local" | "creatureTrack">>,
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
        state.heading = nextHeading(state.heading, wrappedDelta(state.x, x, planetWidth), wrappedDelta(state.y, y, planetHeight), headingBlendForDt(dtMs));
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

  // v1.10.2 — la camera guarda dove è girata la creatura (la sua rotazione visiva graduale), non una direzione propria
  // più veloce: altrimenti la creatura sembrerebbe ruotare rispetto alla camera.
  const visual = refs.creatureTrack?.get(selectedId)?.motion;
  if (visual && visual.hasYaw) {
    if (state.heading) {
      state.heading.hx = Math.cos(visual.yaw);
      state.heading.hy = Math.sin(visual.yaw);
    } else {
      state.heading = { hx: Math.cos(visual.yaw), hy: Math.sin(visual.yaw) };
    }
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
 * v1.10.8 — Camera libera: terza persona slegata dagli esseri. Il punto d'osservazione è un punto
 * qualunque della superficie (non un animale): avanza da solo verso il punto toccato (state.hasGoal)
 * e la camera lo incornicia da dietro, con la stessa matematica di posa, smorzamento e collisione
 * col terreno della terza persona (computeFollowPose, clampCameraRadius). Trascinando si guarda
 * intorno come in "follow"; senza tocchi la camera torna dietro il punto d'osservazione.
 * Scrive anche state.x/y, così il terreno locale ad alto dettaglio segue il punto d'osservazione.
 */
export function updateFreeCamera(
  refs: Pick<SceneRefs, "camera" | "heightmap"> & Partial<Pick<SceneRefs, "local">>,
  frame: RenderFrame,
  state: FollowState,
  nowMs: number,
  dtMs: number,
): void {
  const { planetWidth, planetHeight } = frame;

  // All'ingresso (o al cambio di mondo) il punto d'osservazione parte dal centro della mappa, guardando nord.
  if (!state.hasPosition) {
    state.x = planetWidth / 2;
    state.y = planetHeight / 2;
    state.hasPosition = true;
    state.heading = { hx: 0, hy: -1 };
    state.hasGoal = false;
  }

  // Avanza verso il punto toccato (se c'è), lungo la griglia con wrap.
  // v1.10.9 — partenza e arrivo morbidi: la velocità sale con un'accelerazione limitata e scende
  // secondo la frenata necessaria a fermarsi sul punto (v = √(2·a·d)), qualunque sia la distanza.
  if (state.hasGoal) {
    const dx = wrappedDelta(state.x, state.goalX, planetWidth);
    const dy = wrappedDelta(state.y, state.goalY, planetHeight);
    const distCells = Math.hypot(dx, dy);
    const cellUnits = (2 * Math.PI * PLANET_RADIUS) / Math.max(1, planetWidth);
    const remainingUnits = distCells * cellUnits;
    const step = dtMs / 1000;
    const brakeSpeed = Math.sqrt(2 * FREE_BRAKE_UNITS_PER_S2 * Math.max(0, remainingUnits));
    const targetSpeed = Math.min(FREE_MOVE_UNITS_PER_SEC, brakeSpeed);
    const diff = targetSpeed - state.freeSpeed;
    const maxDelta = (diff > 0 ? FREE_ACCEL_UNITS_PER_S2 : FREE_BRAKE_UNITS_PER_S2) * step;
    state.freeSpeed += Math.max(-maxDelta, Math.min(maxDelta, diff));
    const stepUnits = state.freeSpeed * step;
    if (remainingUnits <= stepUnits || remainingUnits < 1e-9) {
      state.x = state.goalX;
      state.y = state.goalY;
      state.hasGoal = false;
      state.freeSpeed = 0;
    } else {
      const k = stepUnits / cellUnits / distCells;
      state.x += dx * k;
      state.y += dy * k;
      // mentre va, la camera guarda dove sta andando
      state.heading = nextHeading(state.heading, dx * k, dy * k, headingBlendForDt(dtMs));
    }
  } else {
    state.freeSpeed = 0;
  }

  // Dopo un po' senza tocchi la camera torna dietro il punto d'osservazione (come in follow).
  if (!state.dragging && nowMs - state.lastInteractAt > FOLLOW_RECENTER_DELAY_MS && (state.yaw !== 0 || state.pitch !== 0)) {
    const a = dampingAlpha(dtMs, FOLLOW_RECENTER_TIME_MS);
    state.yaw = easeAngleToZero(state.yaw, a);
    state.pitch = Math.abs(state.pitch * (1 - a)) < 1e-4 ? 0 : state.pitch * (1 - a);
  }

  const restingR = restingRadius(refs, state.x, state.y, 0.02);
  const point = projectToSphere(state.x, state.y, planetWidth, planetHeight, restingR);
  fcNormal.set(point.normalX, point.normalY, point.normalZ);
  const hx = state.heading?.hx ?? 0;
  const hy = state.heading?.hy ?? -1;
  const ahead = projectToSphere(state.x + hx * 0.5, state.y + hy * 0.5, planetWidth, planetHeight, restingR);
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
    scale: FREE_CAMERA_SCALE,
    yaw: state.yaw,
    pitch: state.pitch,
  });

  // La camera non deve finire dentro una collina (come in follow).
  const grid = directionToGrid(pose.position, planetWidth, planetHeight);
  const minRadius = restingRadius(refs, grid.x, grid.y, 0) + cameraClearance(FREE_CAMERA_SCALE);
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
}

/**
 * v1.10.10 — SCORRIMENTO in vista libera: un gesto di trascinamento (dx, dy in pixel) sposta il punto
 * d'osservazione SULLA SUPERFICIE nella direzione del gesto, come si scorre una mappa: dito/mouse su =
 * avanti, giù = indietro, destra/sinistra = laterale. La direzione è relativa a dove sta guardando la
 * camera (avanti = la direzione di marcia corrente, proiettata sul piano tangente); il nuovo punto si
 * ottiene proiettando lo spostamento sulla sfera (directionToGrid normalizza da sola). La direzione di
 * marcia segue il movimento, così la camera si gira dolcemente verso dove si sta andando.
 * Il tocco secco resta per "vacci da solo" (hasGoal + frenata dolce di updateFreeCamera).
 */
export function panFreeCamera(
  refs: Pick<SceneRefs, "camera" | "heightmap"> & Partial<Pick<SceneRefs, "local">>,
  frame: RenderFrame,
  state: FollowState,
  dxPx: number,
  dyPx: number,
): void {
  if (!state.hasPosition) return;
  const { planetWidth, planetHeight } = frame;

  const restingR = restingRadius(refs, state.x, state.y, 0.02);
  const point = projectToSphere(state.x, state.y, planetWidth, planetHeight, restingR);
  fcNormal.set(point.normalX, point.normalY, point.normalZ);
  const hx = state.heading?.hx ?? 0;
  const hy = state.heading?.hy ?? -1;
  const ahead = projectToSphere(state.x + hx * 0.5, state.y + hy * 0.5, planetWidth, planetHeight, restingR);
  fcTangent.set(ahead.x - point.x, ahead.y - point.y, ahead.z - point.z);
  fcTangent.addScaledVector(fcNormal, -fcTangent.dot(fcNormal));
  if (fcTangent.lengthSq() < 1e-12) {
    fcTangent.crossVectors(fcNormal, Math.abs(fcNormal.y) < 0.9 ? UP : tmpRight.set(1, 0, 0));
  }
  fcTangent.normalize();

  // Avanti/indietro lungo la direzione di marcia, destra/sinistra lungo il suo perpendicolare.
  // (cross(normal, forward) è il lato SINISTRO: per il destro si inverte il verso del prodotto.)
  panRight.copy(fcTangent).cross(fcNormal);
  const du = -dyPx * FREE_DRAG_UNITS_PER_PX; // dito/mouse su = avanti
  const dv = dxPx * FREE_DRAG_UNITS_PER_PX; // destra = destra
  panWorld.copy(point).addScaledVector(fcTangent, du).addScaledVector(panRight, dv);

  const prevX = state.x;
  const prevY = state.y;
  const grid = directionToGrid([panWorld.x, panWorld.y, panWorld.z], planetWidth, planetHeight);
  state.x = grid.x;
  state.y = grid.y;
  state.hasGoal = false;
  state.freeSpeed = 0;
  // La direzione di marcia segue il movimento: la camera si gira verso dove si sta andando.
  state.heading = nextHeading(state.heading, wrappedDelta(prevX, state.x, planetWidth), wrappedDelta(prevY, state.y, planetHeight), 1);
  state.lastInteractAt = performance.now();
}
