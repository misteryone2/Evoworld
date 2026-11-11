/**
 * v1.10.1 — Continuous Movement. La simulazione avanza a scatti (a velocità 1, un tick ogni 100 ms) e il mondo
 * manda un frame solo quando i tick sono cambiati. Disegnare le creature ferme in quelle posizioni le fa saltare a
 * 10 Hz. Qui si tiene, per ogni creatura, la posizione di partenza e quella di arrivo di un frame e si calcola, a
 * ogni frame di rendering, dove disegnarla in mezzo: un'interpolazione solo visiva.
 *
 * Regole:
 *  - Solo rendering. La posizione reale (quella del frame) non si tocca mai; i dati qui sono temporanei, non vengono
 *    salvati e non entrano nei salvataggi.
 *  - Il mondo è toroidale: l'interpolazione prende la via più corta anche attraverso il bordo.
 *  - Indipendente dal frame rate: dipende dal tempo trascorso, non dal numero di frame.
 *  - Continuità: se arriva un frame nuovo mentre la creatura è a metà strada, il nuovo tratto parte da dove la
 *    creatura è disegnata in quel momento, non da dove "doveva" essere arrivata. Niente salti.
 *  - Niente interpolazione dove non ha senso: nascita (appare nel suo punto), riposizionamenti e salti (si scatta),
 *    tanti tick in un frame (velocità alte), mondo diverso, sospensione della scheda.
 */
import { wrappedDelta } from "./creatureHeading";

/** Durata dell'interpolazione (ms) prima della prima misura: un tick a velocità 1. */
export const DEFAULT_INTERVAL_MS = 100;
/** Limiti della durata stimata. */
export const MIN_INTERVAL_MS = 16;
export const MAX_INTERVAL_MS = 250;
/** Se tra due frame con tick nuovi passa più di tanto, la scheda era sospesa o il browser bloccato: si scatta. */
export const SUSPENSION_GAP_MS = 1000;
/** Più di tanti tick in un frame (velocità alte): interpolare non si vedrebbe e la creatura "scivolerebbe": si scatta. */
export const MAX_INTERPOLATED_TICKS = 6;
/** Una creatura non si muove più di tante celle per tick; oltre (con un margine) è un riposizionamento, non un passo. */
export const MAX_CELLS_PER_TICK = 4;
export const JUMP_MARGIN_CELLS = 2;
/** Peso dell'ultima misura nella stima della durata. */
const INTERVAL_SMOOTHING = 0.3;

/** Punto di partenza e di arrivo di una creatura (coordinate di griglia). */
export interface MotionState {
  prevX: number;
  prevY: number;
  currX: number;
  currY: number;
  /** v1.10.4 — energia vista nell'ultimo frame e guadagno per tick rispetto al frame prima (0 se non c'è il dato). */
  energy: number;
  gain: number;
  /** Frame in cui la creatura è stata vista l'ultima volta (per scartare chi non c'è più). */
  gen: number;
}

export interface MotionBuffer {
  states: Map<number, MotionState>;
  /** Per indice di creatura nel frame più recente: evita di cercare nella mappa a ogni frame di rendering. */
  slots: MotionState[];
  hasFrame: boolean;
  lastTick: number;
  planetWidth: number;
  planetHeight: number;
  /** Quando (ms) è arrivato il frame con i tick più recenti. */
  arrivalMs: number;
  /** Quanto dura l'interpolazione verso l'ultima posizione (ms), stimata dai frame precedenti. */
  intervalMs: number;
  /** Cresce a ogni frame nuovo: chi disegna sa se c'è qualcosa di nuovo. */
  version: number;
  generation: number;
  outX: Float32Array;
  outY: Float32Array;
  viewX: Float32Array;
  viewY: Float32Array;
  outGain: Float32Array;
  viewGain: Float32Array;
}

export function createMotionBuffer(): MotionBuffer {
  return {
    states: new Map(),
    slots: [],
    hasFrame: false,
    lastTick: -1,
    planetWidth: 0,
    planetHeight: 0,
    arrivalMs: 0,
    intervalMs: DEFAULT_INTERVAL_MS,
    version: 0,
    generation: 0,
    outX: new Float32Array(0),
    outY: new Float32Array(0),
    viewX: new Float32Array(0),
    viewY: new Float32Array(0),
    outGain: new Float32Array(0),
    viewGain: new Float32Array(0),
  };
}

/** Dimentica tutto (cambio di mondo, caricamento, reset). */
export function resetMotion(buffer: MotionBuffer): void {
  buffer.states.clear();
  buffer.slots.length = 0;
  buffer.hasFrame = false;
  buffer.lastTick = -1;
  buffer.arrivalMs = 0;
  buffer.intervalMs = DEFAULT_INTERVAL_MS;
  buffer.version++;
}

function wrapInto(value: number, size: number): number {
  const v = value % size;
  return v < 0 ? v + size : v;
}

/** Punto a frazione `t` (0..1) tra `a` e `b` su un asse che si richiude, per la via più corta. Il risultato sta in [0, size). */
export function lerpWrapped(a: number, b: number, t: number, size: number): number {
  return wrapInto(a + wrappedDelta(a, b, size) * t, size);
}

/** Frazione di strada fatta (0..1) all'istante `nowMs`. Non estrapola mai oltre l'arrivo. */
export function motionAlpha(buffer: MotionBuffer, nowMs: number): number {
  if (!buffer.hasFrame) return 1;
  const a = (nowMs - buffer.arrivalMs) / buffer.intervalMs;
  return a <= 0 ? 0 : a >= 1 ? 1 : a;
}

export interface MotionFrameInput {
  tick: number;
  planetWidth: number;
  planetHeight: number;
  organismsId: ArrayLike<number>;
  organismsX: ArrayLike<number>;
  organismsY: ArrayLike<number>;
  /** v1.10.4 — facoltativa. */
  organismsEnergy?: ArrayLike<number>;
}

/**
 * Registra un frame del mondo. Restituisce true se le posizioni sono cambiate (frame con tick nuovi), false se è lo
 * stesso tick già visto (un frame ripetuto) e non c'è nulla da aggiornare.
 */
export function ingestMotionFrame(buffer: MotionBuffer, frame: MotionFrameInput, nowMs: number): boolean {
  const n = frame.organismsId.length;
  const W = frame.planetWidth;
  const H = frame.planetHeight;

  const sameWorld = buffer.hasFrame && buffer.planetWidth === W && buffer.planetHeight === H && frame.tick >= buffer.lastTick;
  if (sameWorld && frame.tick === buffer.lastTick) return false;
  if (buffer.hasFrame && !sameWorld) resetMotion(buffer);

  const tickAdvance = buffer.hasFrame ? frame.tick - buffer.lastTick : 0;
  const gap = buffer.hasFrame ? nowMs - buffer.arrivalMs : 0;
  const snapAll = !buffer.hasFrame || tickAdvance > MAX_INTERPOLATED_TICKS || gap > SUSPENSION_GAP_MS || gap < 0;
  const alphaNow = motionAlpha(buffer, nowMs); // dov'è disegnata ora ciascuna creatura, per ripartire da lì
  const jumpLimit = MAX_CELLS_PER_TICK * Math.max(1, tickAdvance) + JUMP_MARGIN_CELLS;

  const energies = frame.organismsEnergy;
  const generation = ++buffer.generation;
  if (buffer.slots.length < n) buffer.slots.length = n;
  else buffer.slots.length = n;

  for (let i = 0; i < n; i++) {
    const id = frame.organismsId[i];
    const x = frame.organismsX[i];
    const y = frame.organismsY[i];
    let state = buffer.states.get(id);
    if (!state) {
      // Nascita (o prima volta che si vede): compare dov'è, senza strada da fare.
      state = { prevX: x, prevY: y, currX: x, currY: y, energy: energies ? energies[i] : 0, gain: 0, gen: generation };
      buffer.states.set(id, state);
    } else if (snapAll) {
      state.prevX = x;
      state.prevY = y;
      state.currX = x;
      state.currY = y;
    } else {
      // Da dove è disegnata adesso a dove la simulazione l'ha portata.
      const startX = lerpWrapped(state.prevX, state.currX, alphaNow, W);
      const startY = lerpWrapped(state.prevY, state.currY, alphaNow, H);
      const dx = wrappedDelta(state.currX, x, W);
      const dy = wrappedDelta(state.currY, y, H);
      if (Math.hypot(dx, dy) > jumpLimit) {
        // Riposizionamento (non un passo): si scatta.
        state.prevX = x;
        state.prevY = y;
      } else {
        state.prevX = startX;
        state.prevY = startY;
      }
      state.currX = x;
      state.currY = y;
    }
    // v1.10.4 — energia guadagnata per tick tra l'ultimo frame e questo (solo per l'animazione: mangia / non mangia)
    if (energies) {
      const e = energies[i];
      state.gain = state.gen === generation - 1 && tickAdvance > 0 ? (e - state.energy) / tickAdvance : 0;
      state.energy = e;
    } else {
      state.gain = 0;
    }
    state.gen = generation;
    buffer.slots[i] = state;
  }

  // Chi non c'è più (morto) esce.
  if (buffer.states.size > n) {
    for (const [id, state] of buffer.states) if (state.gen !== generation) buffer.states.delete(id);
  }

  // Durata stimata dell'interpolazione: il ritmo con cui arrivano frame con tick nuovi, un po' lisciato.
  if (buffer.hasFrame && !snapAll) {
    const measured = Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, gap));
    buffer.intervalMs = buffer.intervalMs * (1 - INTERVAL_SMOOTHING) + measured * INTERVAL_SMOOTHING;
  }
  buffer.hasFrame = true;
  buffer.lastTick = frame.tick;
  buffer.planetWidth = W;
  buffer.planetHeight = H;
  buffer.arrivalMs = nowMs;
  buffer.version++;
  return true;
}

export interface InterpolatedPositions {
  x: Float32Array;
  y: Float32Array;
  /** v1.10.4 — energia guadagnata per tick (per l'animazione). */
  gain: Float32Array;
  alpha: number;
}

/**
 * Posizioni da disegnare all'istante `nowMs`, nello stesso ordine del frame registrato. Gli array sono riusati tra
 * una chiamata e l'altra: vanno usati subito, non conservati.
 */
export function interpolatedPositions(buffer: MotionBuffer, nowMs: number): InterpolatedPositions {
  const n = buffer.slots.length;
  if (buffer.outX.length < n) {
    const capacity = Math.max(n, buffer.outX.length * 2, 64);
    buffer.outX = new Float32Array(capacity);
    buffer.outY = new Float32Array(capacity);
    buffer.outGain = new Float32Array(capacity);
    buffer.viewX = buffer.outX.subarray(0, n);
    buffer.viewY = buffer.outY.subarray(0, n);
    buffer.viewGain = buffer.outGain.subarray(0, n);
  } else if (buffer.viewX.length !== n || buffer.viewX.buffer !== buffer.outX.buffer) {
    buffer.viewX = buffer.outX.subarray(0, n);
    buffer.viewY = buffer.outY.subarray(0, n);
    buffer.viewGain = buffer.outGain.subarray(0, n);
  }
  const alpha = motionAlpha(buffer, nowMs);
  const W = buffer.planetWidth;
  const H = buffer.planetHeight;
  const outX = buffer.outX;
  const outY = buffer.outY;
  const outGain = buffer.outGain;
  const slots = buffer.slots;
  for (let i = 0; i < n; i++) {
    const s = slots[i];
    outGain[i] = s.gain;
    if (alpha >= 1 || (s.prevX === s.currX && s.prevY === s.currY)) {
      outX[i] = s.currX;
      outY[i] = s.currY;
    } else {
      outX[i] = lerpWrapped(s.prevX, s.currX, alpha, W);
      outY[i] = lerpWrapped(s.prevY, s.currY, alpha, H);
    }
  }
  return { x: buffer.viewX, y: buffer.viewY, gain: buffer.viewGain, alpha };
}

/**
 * Una copia del frame con le posizioni interpolate al posto di quelle reali (gli altri dati restano gli stessi, per
 * riferimento). Il frame originale non si modifica. Se il buffer non corrisponde al frame (per esempio non è ancora
 * stato registrato) si restituisce il frame com'è: meglio posizioni a scatti che posizioni sbagliate.
 * `alpha` dice a che punto è l'interpolazione (1 = arrivata).
 */
export function interpolatedFrame<T extends MotionFrameInput>(frame: T, buffer: MotionBuffer, nowMs: number): { frame: T & { organismsEnergyGain?: Float32Array }; alpha: number } {
  if (!buffer.hasFrame || buffer.slots.length !== frame.organismsId.length || buffer.lastTick !== frame.tick) {
    return { frame, alpha: 1 };
  }
  const p = interpolatedPositions(buffer, nowMs);
  return { frame: { ...frame, organismsX: p.x, organismsY: p.y, organismsEnergyGain: p.gain }, alpha: p.alpha };
}
