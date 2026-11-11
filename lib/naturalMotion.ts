/**
 * v1.10.2 — Natural Acceleration & Turning. Rotazione e velocità visive delle creature, solo per il disegno.
 *
 * La simulazione muove una creatura a passi costanti e la ferma o la fa girare da un tick all'altro. Qui si
 * calcola come appare quel movimento: la creatura gira verso la direzione di marcia in modo graduale (con un
 * limite alla velocità di rotazione, più lento per chi è più grosso), la velocità visualizzata segue quella reale
 * con una salita e una discesa progressive, e il corpo si inclina un poco in curva e in accelerazione/frenata.
 *
 * Regole:
 *  - La velocità visualizzata segue quella reale, non la sostituisce, e la posizione disegnata non ha inerzia
 *    (resta quella interpolata della v1.10.1): un'inerzia sulla posizione farebbe sovrapporre corpi che le
 *    collisioni tengono separati.
 *  - Tutto dipende dal tempo trascorso, non dal numero di frame.
 *  - Gli angoli si gestiscono sempre per la via più corta (nessun salto attraversando ±π).
 *  - Nessun generatore casuale, nessuno stato persistente.
 */

export const TWO_PI = Math.PI * 2;

/** Porta un angolo in (−π, π]. */
export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  let a = angle % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  else if (a <= -Math.PI) a += TWO_PI;
  return a;
}

/** Rotazione più corta da `from` a `to`, in (−π, π]. */
export function shortestAngleDelta(from: number, to: number): number {
  return normalizeAngle(to - from);
}

// ---- Parametri (tarati a occhio per uno stile "naturale": gradualità senza effetto elastico né ritardi evidenti) ----

/** Costante di tempo della rotazione per una creatura di taglia 1 (ms); cresce con la radice della taglia. */
export const TURN_TAU_MS = 140;
/** Velocità massima di rotazione (rad/s) per una creatura di taglia 1; cala per le più grosse. */
export const TURN_MAX_RATE = 5;
/** Costanti di tempo della velocità visualizzata (ms): salita (accelera) e discesa (frena). */
export const SPEED_ACCEL_TAU_MS = 150;
export const SPEED_DECEL_TAU_MS = 110;
/** Costante di tempo con cui si liscia la velocità di rotazione (ms), per l'inclinazione in curva. */
export const TURN_RATE_SMOOTHING_MS = 100;
/** Sotto questa velocità visualizzata (unità/s) la creatura si considera ferma. */
export const SPEED_EPSILON = 1e-3;
/** Inclinazione massima in curva e di beccheggio (rad). */
export const MAX_ROLL = 0.17;
export const MAX_PITCH = 0.08;
/** Guadagni dell'inclinazione. */
const ROLL_GAIN = 0.08;
const PITCH_GAIN = 0.012;
/** Velocità (in lunghezze di corpo al secondo, con scala = taglia · 0,12) oltre cui l'inclinazione non cresce più. */
const NORMAL_SPEED_BODIES_PER_S = 4;
const MAX_NORMALIZED_SPEED = 1.5;
/** Tempo massimo (ms) di un aggiornamento: dopo una sospensione non si simula un salto enorme. */
export const MAX_STEP_MS = 250;

/**
 * Sulla griglia l'angolo atan2(dy, dx) cresce da est verso sud. Nella vista 3D, guardando verso est, il sud è
 * a SINISTRA (verificato con la proiezione reale nei test): un angolo che cresce è una svolta a sinistra.
 */
export const GRID_YAW_INCREASING_IS_LEFT = true;

/** Stato visivo di una creatura: temporaneo, non persistente, non fa parte della simulazione. */
export interface VisualMotion {
  hasYaw: boolean;
  /** Direzione verso cui è girata (angolo sulla griglia, atan2(dy, dx)). */
  yaw: number;
  /** Velocità di rotazione lisciata (rad/s, positiva = angolo che cresce). */
  turnRate: number;
  /** Velocità visualizzata (unità del mondo 3D al secondo). */
  visSpeed: number;
  /** Variazione della velocità visualizzata (unità/s²), lisciata dal calcolo stesso. */
  visAccel: number;
  /** Inclinazione laterale (rad, positiva = verso sinistra) e beccheggio (rad, positivo = muso in giù). */
  roll: number;
  pitch: number;
}

export function createVisualMotion(): VisualMotion {
  return { hasYaw: false, yaw: -Math.PI / 2, turnRate: 0, visSpeed: 0, visAccel: 0, roll: 0, pitch: 0 };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Fattore di agilità: le creature più grosse girano più lentamente. */
function sizeFactor(size: number): number {
  return Math.sqrt(clamp(size, 0.4, 3));
}

/**
 * Un passo di rotazione verso `target`, di `dtMs`. Avvicinamento esponenziale (nessun overshoot, nessuna oscillazione)
 * con un tetto alla velocità angolare. Restituisce il nuovo angolo, in (−π, π].
 */
export function stepAngle(current: number, target: number, dtMs: number, size = 1): number {
  const dt = clamp(dtMs, 0, MAX_STEP_MS) / 1000;
  if (dt <= 0) return current;
  const f = sizeFactor(size);
  const delta = shortestAngleDelta(current, target);
  const tau = (TURN_TAU_MS * f) / 1000;
  let step = delta * (1 - Math.exp(-dt / tau));
  const maxStep = (TURN_MAX_RATE / f) * dt;
  if (step > maxStep) step = maxStep;
  else if (step < -maxStep) step = -maxStep;
  return normalizeAngle(current + step);
}

/** Un passo della velocità visualizzata verso la velocità reale `target`, con salita e discesa diverse. Mai negativa. */
export function stepSpeed(current: number, target: number, dtMs: number): number {
  const dt = clamp(dtMs, 0, MAX_STEP_MS) / 1000;
  if (dt <= 0) return current;
  const tau = (target > current ? SPEED_ACCEL_TAU_MS : SPEED_DECEL_TAU_MS) / 1000;
  const next = current + (target - current) * (1 - Math.exp(-dt / tau));
  return next < SPEED_EPSILON && target < SPEED_EPSILON ? 0 : Math.max(0, next);
}

/**
 * Aggiorna lo stato visivo di una creatura dopo `dtMs`, dato lo spostamento reale (interpolato) in questo intervallo:
 * `dx`, `dy` in celle (per la direzione), `travelledUnits` in unità del mondo 3D (per la velocità), `size` e `scale`
 * (taglia genetica e scala 3D) per l'agilità e per normalizzare le inclinazioni.
 */
export function stepVisualMotion(state: VisualMotion, dx: number, dy: number, travelledUnits: number, dtMs: number, size: number, scale: number, minMovement = 1e-3): void {
  const dt = clamp(dtMs, 0, MAX_STEP_MS);
  if (dt <= 0) return;
  const dtSec = dt / 1000;

  // Rotazione: verso la direzione di marcia solo se la creatura si è mossa davvero; da ferma mantiene l'orientamento.
  let previousYaw = state.yaw;
  if (Math.hypot(dx, dy) >= minMovement) {
    const target = Math.atan2(dy, dx);
    if (!state.hasYaw) {
      state.yaw = target; // la prima direzione si prende subito, come prima della v1.10.2
      state.hasYaw = true;
      previousYaw = target; // ...e non è una svolta: nessuna velocità di rotazione, quindi nessuna inclinazione
    } else {
      state.yaw = stepAngle(state.yaw, target, dt, size);
    }
  }
  const rawRate = shortestAngleDelta(previousYaw, state.yaw) / dtSec;
  const kRate = 1 - Math.exp(-dt / TURN_RATE_SMOOTHING_MS);
  state.turnRate += (rawRate - state.turnRate) * kRate;
  if (Math.abs(state.turnRate) < 1e-4) state.turnRate = 0;

  // Velocità visualizzata: segue quella reale con salita e discesa progressive.
  const realSpeed = travelledUnits / dtSec;
  const previousSpeed = state.visSpeed;
  state.visSpeed = stepSpeed(previousSpeed, realSpeed, dt);
  state.visAccel = (state.visSpeed - previousSpeed) / dtSec;

  // Inclinazione: in curva verso l'interno, in accelerazione muso su, in frenata muso giù. Più forte con la velocità.
  const bodyLength = Math.max(1e-6, scale);
  const normalizedSpeed = clamp(state.visSpeed / (bodyLength * NORMAL_SPEED_BODIES_PER_S), 0, MAX_NORMALIZED_SPEED);
  const sign = GRID_YAW_INCREASING_IS_LEFT ? 1 : -1;
  const targetRoll = clamp(sign * state.turnRate * normalizedSpeed * ROLL_GAIN, -MAX_ROLL, MAX_ROLL);
  const normalizedAccel = state.visAccel / (bodyLength * NORMAL_SPEED_BODIES_PER_S);
  const targetPitch = clamp(-normalizedAccel * PITCH_GAIN * NORMAL_SPEED_BODIES_PER_S, -MAX_PITCH, MAX_PITCH);
  const kLean = 1 - Math.exp(-dt / 90);
  state.roll += (targetRoll - state.roll) * kLean;
  state.pitch += (targetPitch - state.pitch) * kLean;
  if (Math.abs(state.roll) < 1e-5) state.roll = 0;
  if (Math.abs(state.pitch) < 1e-5) state.pitch = 0;
}
