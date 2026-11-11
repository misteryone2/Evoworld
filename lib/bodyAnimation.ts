/**
 * v1.10.3 — Procedural Body Animation. Il movimento del corpo di una creatura in cammino, solo per il disegno.
 *
 * Dato lo stato visivo (velocità visualizzata, velocità di rotazione), la fase del passo e le proporzioni della
 * creatura, si calcolano: l'oscillazione di ciascuna delle quattro zampe (con un'andatura che cambia con la
 * velocità: passo, trotto, galoppo), il movimento del corpo (su e giù, laterale, avanti e indietro), quello della
 * testa (cenno col passo, sguardo verso la curva) e quello della coda (oscillazione col passo, contrappeso in curva).
 *
 * Regole:
 *  - Solo rendering: nessun gene nuovo, nessun sistema biologico parallelo. Le differenze tra creature vengono
 *    dall'anatomia che esiste già (lunghezza delle zampe e del corpo, della coda) e dalla taglia.
 *  - Ferma = zampe ferme: l'ampiezza del passo sale con la velocità visualizzata e va a zero quando la creatura è
 *    ferma; non ci sono "camminate sul posto".
 *  - Niente salti: tutto è una funzione continua della velocità, della fase e della velocità di rotazione.
 *  - Nessun generatore casuale, nessuno stato persistente: la pose si ricalcola a ogni frame dallo stato visivo.
 */
import { GRID_YAW_INCREASING_IS_LEFT } from "./naturalMotion";

export const TWO_PI = Math.PI * 2;

/** Ordine delle zampe: come nel disegno (n % 2 = lato: pari sinistra, dispari destra; n < 2 anteriori). */
export const LEG_FRONT_LEFT = 0;
export const LEG_FRONT_RIGHT = 1;
export const LEG_REAR_LEFT = 2;
export const LEG_REAR_RIGHT = 3;
export const LEG_COUNT = 4;

/** Sfasamento delle zampe in cicli, per andatura. Indici: FL, FR, RL, RR. */
export const GAIT_OFFSETS = {
  /** Passo: sequenza laterale (posteriore sinistra, anteriore sinistra, posteriore destra, anteriore destra). */
  walk: [0.25, 0.75, 0, 0.5],
  /** Trotto: diagonali insieme (anteriore sinistra con posteriore destra). */
  trot: [0, 0.5, 0.5, 0],
  /** Galoppo: le due anteriori quasi insieme, le due posteriori mezzo ciclo dopo. */
  gallop: [0, 0.08, 0.5, 0.58],
} as const;

/** Velocità normalizzata (lunghezze di corpo al secondo / 4) alle quali si passa da un'andatura all'altra. */
export const WALK_TO_TROT = [0.25, 0.5] as const;
export const TROT_TO_GALLOP = [0.9, 1.3] as const;
/** Sotto questa velocità normalizzata la creatura è ferma: ampiezza zero. */
export const MIN_ANIMATED_SPEED = 1e-4;
/** Velocità normalizzata a cui l'ampiezza del passo arriva al massimo. */
const FULL_STRIDE_SPEED = 0.25;
/** Velocità in unità di scala al secondo corrispondente a una velocità normalizzata 1. */
export const NORMAL_SPEED_BODIES_PER_S = 4;
export const MAX_NORMALIZED_SPEED = 1.5;

export interface LimbAnatomy {
  legLength: number;
  bodyHalfLength: number;
  tailLength: number;
}

export interface MotionInput {
  /** Velocità visualizzata, in unità del mondo 3D al secondo. */
  visSpeed: number;
  /** Velocità di rotazione lisciata, rad/s (positiva = angolo sulla griglia che cresce). */
  turnRate: number;
}

/** Posa calcolata. Gli spostamenti sono in unità della scala della creatura; gli angoli in radianti. */
export interface BodyPose {
  /** Oscillazione di ciascuna zampa attorno all'asse trasversale (rad). */
  legSwing: Float64Array;
  /** Peso delle tre andature (somma 1 quando la creatura si muove). */
  walkWeight: number;
  trotWeight: number;
  gallopWeight: number;
  /** Ampiezza del passo, 0..1 (0 = ferma). */
  stride: number;
  bobY: number;
  swayX: number;
  surgeZ: number;
  /** Testa: rotazione verticale (positiva = muso in giù) e orizzontale attorno al collo (rad). */
  headPitch: number;
  headYaw: number;
  /** Coda: oscillazione orizzontale e verticale (rad). */
  tailYaw: number;
  tailPitch: number;
  /** v1.10.4 — respirazione: variazione relativa della sezione del torace (0 = a riposo, ±0,03 circa). */
  breath: number;
}

export function createBodyPose(): BodyPose {
  return {
    legSwing: new Float64Array(LEG_COUNT),
    walkWeight: 0,
    trotWeight: 0,
    gallopWeight: 0,
    stride: 0,
    bobY: 0,
    swayX: 0,
    surgeZ: 0,
    headPitch: 0,
    headYaw: 0,
    tailYaw: 0,
    tailPitch: 0,
    breath: 0,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Velocità visualizzata normalizzata sulle dimensioni del corpo (0..1,5). */
export function normalizedSpeed(visSpeed: number, scale: number): number {
  return clamp(visSpeed / (Math.max(1e-6, scale) * NORMAL_SPEED_BODIES_PER_S), 0, MAX_NORMALIZED_SPEED);
}

/** Pesi di passo, trotto e galoppo per una velocità normalizzata: sempre non negativi, con somma 1, continui. */
export function gaitWeights(vn: number, out: { walk: number; trot: number; gallop: number }): void {
  const toTrot = smoothstep(WALK_TO_TROT[0], WALK_TO_TROT[1], vn);
  const toGallop = smoothstep(TROT_TO_GALLOP[0], TROT_TO_GALLOP[1], vn);
  out.walk = 1 - toTrot;
  out.gallop = toGallop * toTrot;
  out.trot = 1 - out.walk - out.gallop;
}

const weights = { walk: 0, trot: 0, gallop: 0 };

function clearPose(out: BodyPose): void {
  out.legSwing.fill(0);
  out.walkWeight = out.trotWeight = out.gallopWeight = 0;
  out.stride = 0;
  out.bobY = out.swayX = out.surgeZ = 0;
  out.headPitch = out.headYaw = 0;
  out.tailYaw = out.tailPitch = 0;
  out.breath = 0;
}

/**
 * Calcola la posa di una creatura.
 * @param phase fase del passo in radianti (un ciclo completo = 2π; avanza con la strada fatta, vedi `advancePhase`).
 * @param scale scala 3D della creatura (per normalizzare la velocità).
 */
export function computeBodyPose(out: BodyPose, phase: number, motion: MotionInput, scale: number, anatomy: LimbAnatomy): void {
  const vn = normalizedSpeed(motion.visSpeed, scale);
  const turning = motion.turnRate !== 0;
  if (vn < MIN_ANIMATED_SPEED && !turning) {
    clearPose(out);
    return;
  }

  // Ampiezza del passo: sale rapidamente con la velocità e va a zero da fermi.
  const stride = vn < MIN_ANIMATED_SPEED ? 0 : Math.pow(clamp(vn / FULL_STRIDE_SPEED, 0, 1), 0.6);
  out.stride = stride;
  gaitWeights(vn, weights);
  out.walkWeight = weights.walk;
  out.trotWeight = weights.trot;
  out.gallopWeight = weights.gallop;

  // Zampe: l'angolo massimo cresce con la lunghezza del passo (corpo lungo) e cala con la lunghezza della zampa.
  const maxSwing = clamp(0.42 * Math.sqrt(anatomy.bodyHalfLength / Math.max(0.2, anatomy.legLength)), 0.3, 0.8);
  const amplitude = maxSwing * stride * (0.7 + 0.3 * Math.min(1, vn));
  const cycle = phase / TWO_PI;
  for (let n = 0; n < LEG_COUNT; n++) {
    const offset = weights.walk * GAIT_OFFSETS.walk[n] + weights.trot * GAIT_OFFSETS.trot[n] + weights.gallop * GAIT_OFFSETS.gallop[n];
    out.legSwing[n] = amplitude * Math.sin(TWO_PI * (cycle + offset));
  }

  // Corpo: due rimbalzi per ciclo, ondeggiamento laterale a ogni passo, leggero avanti-indietro. Più marcati col trotto e il galoppo.
  const vigor = stride * (0.6 + 0.4 * Math.min(1, vn));
  out.bobY = 0.045 * vigor * Math.cos(2 * TWO_PI * cycle);
  out.swayX = 0.035 * vigor * Math.sin(TWO_PI * cycle);
  out.surgeZ = 0.03 * vigor * Math.cos(2 * TWO_PI * cycle + Math.PI / 2);

  // Testa: cenno al ritmo del passo; si volge verso la curva (il collo anticipa il corpo).
  const turnSign = GRID_YAW_INCREASING_IS_LEFT ? -1 : 1;
  out.headPitch = 0.08 * vigor * Math.sin(2 * TWO_PI * cycle + 0.8);
  out.headYaw = clamp(turnSign * motion.turnRate * 0.06, -0.4, 0.4) * Math.min(1, 0.4 + vn);

  // Coda: oscilla col passo (meno ampia se è lunga) e fa da contrappeso in curva, dalla parte opposta.
  const tailScale = 0.8 / Math.sqrt(Math.max(0.4, anatomy.tailLength));
  out.tailYaw = 0.22 * tailScale * vigor * Math.sin(TWO_PI * cycle + Math.PI) + clamp(turnSign * motion.turnRate * 0.05, -0.35, 0.35) * Math.min(1, 0.4 + vn);
  out.tailPitch = 0.1 * tailScale * vigor * Math.sin(2 * TWO_PI * cycle + Math.PI / 2);
  out.breath = 0;
}

/**
 * Fa avanzare la fase del passo in base alla strada percorsa a velocità visualizzata `visSpeed` per `dtMs`:
 * un ciclo completo (2π) ogni 3,2 lunghezze di scala, quindi la cadenza è proporzionale alla velocità e il passo
 * è più lungo per le creature più grosse. Da ferme la fase non avanza. Restituisce la nuova fase in [0, 2π).
 */
export function advancePhase(phase: number, visSpeed: number, dtMs: number, scale: number): number {
  const dt = Math.max(0, dtMs) / 1000;
  const next = phase + ((visSpeed * dt) / (Math.max(1e-6, scale) * 1.6)) * Math.PI;
  const wrapped = next % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}
