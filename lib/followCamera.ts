/**
 * v1.7.0 — Terza persona. Matematica pura della camera che segue un animale:
 * nessuna dipendenza da Three.js, così si può testare senza WebGL.
 *
 * La camera sta dietro e sopra la creatura, rispetto alla sua direzione di
 * movimento sulla superficie del pianeta, e guarda un punto appena davanti a
 * lei. Trascinando si può girare intorno alla creatura (yaw) e alzare o
 * abbassare il punto di vista (pitch); lasciando andare, la camera torna
 * lentamente dietro l'animale.
 */

export type Vec3 = [number, number, number];

export interface FollowPose {
  position: Vec3;
  target: Vec3;
  /** Direzione "su" della camera: la normale della superficie nel punto della creatura. */
  up: Vec3;
}

export interface FollowInput {
  /** Posizione della creatura sulla superficie. */
  point: Vec3;
  /** Normale uscente della superficie in quel punto (unitaria). */
  normal: Vec3;
  /** Direzione di marcia lungo la superficie (unitaria, perpendicolare alla normale). */
  forward: Vec3;
  /** Scala della creatura nel mondo 3D (size * 0.12, come in Planet3DView). */
  scale: number;
  /** Rotazione orizzontale attorno alla creatura, in radianti (0 = dietro di lei). */
  yaw: number;
  /** Variazione dell'inclinazione rispetto a quella di base, in radianti. */
  pitch: number;
}

/** Inclinazione di base della camera sopra l'orizzonte della creatura (circa 24 gradi). */
export const BASE_ELEVATION = 0.42;
export const MIN_ELEVATION = 0.08;
export const MAX_ELEVATION = 1.35;
/** Distanza minima e massima della camera dalla creatura, in unità del mondo 3D. */
export const MIN_FOLLOW_DISTANCE = 0.5;
export const MAX_FOLLOW_DISTANCE = 2.2;
/** Quanto la camera si allontana in proporzione alla scala della creatura. */
export const DISTANCE_PER_SCALE = 7;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

/** Distanza camera-creatura per una creatura di data scala (limitata, così una creatura minuscola o enorme resta inquadrabile). */
export function followDistance(scale: number): number {
  const s = Number.isFinite(scale) ? scale : 0;
  return Math.min(MAX_FOLLOW_DISTANCE, Math.max(MIN_FOLLOW_DISTANCE, s * DISTANCE_PER_SCALE));
}

/** Inclinazione effettiva (base + pitch), tenuta in un intervallo che non entra nel terreno né guarda dritto dall'alto. */
export function followElevation(pitch: number): number {
  const p = Number.isFinite(pitch) ? pitch : 0;
  return Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, BASE_ELEVATION + p));
}

/**
 * La posa della camera. Con yaw 0 la camera sta esattamente dietro la
 * creatura (lungo -forward); con yaw positivo si sposta verso il lato
 * sinistro della creatura, con yaw π passa davanti.
 */
export function computeFollowPose(input: FollowInput): FollowPose {
  const { point, normal, forward, scale, yaw, pitch } = input;
  const side = cross(normal, forward); // lato sinistro della creatura
  const distance = followDistance(scale);
  const elevation = followElevation(pitch);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const behind = add(mul(forward, -cosY), mul(side, sinY)); // direzione orizzontale dalla creatura alla camera
  const offset = add(mul(behind, distance * Math.cos(elevation)), mul(normal, distance * Math.sin(elevation)));
  const s = Number.isFinite(scale) ? scale : 0;
  const target = add(add(point, mul(normal, s * 1.1)), mul(forward, s * 1.2));
  return { position: add(point, offset), target, up: normal };
}

/** Se la camera finisce sotto la superficie, la spinge fuori lungo il raggio fino a `minRadius`. */
export function clampCameraRadius(position: Vec3, minRadius: number): Vec3 {
  const r = length(position);
  if (r < 1e-9 || r >= minRadius) return position;
  return mul(position, minRadius / r);
}

/** Margine tra terreno e camera: cresce con la creatura così le colline non coprono la vista. */
export function cameraClearance(scale: number): number {
  const s = Number.isFinite(scale) ? scale : 0;
  return 0.08 + s * 1.2;
}

/** Fattore di smorzamento esponenziale (0..1) per un passo di `dtMs`, indipendente dalla frequenza dei fotogrammi. */
export function dampingAlpha(dtMs: number, timeConstantMs: number): number {
  if (!(dtMs > 0)) return 0;
  if (!(timeConstantMs > 0)) return 1;
  return 1 - Math.exp(-dtMs / timeConstantMs);
}

/** Avvicina a zero un angolo (percorso più breve) di una frazione `alpha`. */
export function easeAngleToZero(angle: number, alpha: number): number {
  if (!Number.isFinite(angle)) return 0;
  const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle)); // in (-π, π]
  const next = wrapped * (1 - Math.min(1, Math.max(0, alpha)));
  return Math.abs(next) < 1e-4 ? 0 : next;
}

/**
 * Inversa di projectToSphere (lib/sphereProjection.ts) per un vettore diretto
 * dal centro del pianeta: restituisce le coordinate della griglia di
 * simulazione sotto quel punto. Serve a sapere quanto è alto il terreno sotto
 * la camera.
 */
export function directionToGrid(direction: Vec3, gridWidth: number, gridHeight: number): { x: number; y: number } {
  const len = length(direction) || 1;
  const dx = direction[0] / len;
  const dy = direction[1] / len;
  const dz = direction[2] / len;
  const phi = Math.acos(Math.max(-1, Math.min(1, dy)));
  let theta = Math.atan2(dz, -dx);
  if (theta < 0) theta += Math.PI * 2;
  return { x: (theta / (Math.PI * 2)) * gridWidth, y: (phi / Math.PI) * gridHeight };
}
