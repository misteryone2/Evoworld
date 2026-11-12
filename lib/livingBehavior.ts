/**
 * v1.10.4 — Living Behaviors. Una creatura ferma non è un oggetto fermo: respira, si guarda attorno, mangia, riposa.
 * Solo per il disegno.
 *
 * Da dove viene lo stato: la simulazione non ha stati "mangia" o "riposa" da mostrare, e non se ne aggiungono. Gli stati
 * visivi si ricavano da dati reali già disponibili, senza memoria persistente:
 *  - cammina: la velocità visualizzata (dal movimento reale);
 *  - mangia: ferma e con l'energia che sale più di quanto consuma (guadagno per tick tra gli ultimi frame del mondo,
 *    dato reale di sola lettura): mangia, o ha appena mangiato;
 *  - riposa: ferma da un po' (più di qualche secondo di rendering) e non sta mangiando;
 *  - idle: ferma da poco.
 * Limite dichiarato: una creatura con l'energia già al massimo che mangia non guadagna e quindi appare "ferma".
 *
 * Regole: transizioni sempre graduali (i pesi degli stati si avvicinano al bersaglio in modo esponenziale), tutto
 * dipende dal tempo di rendering, nessun generatore casuale (la variazione tra creature viene da un valore derivato
 * dall'id), nessuno stato persistente, nessun salvataggio.
 */
import type { BodyPose } from "./bodyAnimation";
import { FULL_DETAIL, type LodDetail } from "./animationLod";

/** Guadagno di energia per tick oltre il quale una creatura ferma si considera "a mangiare". */
export const EAT_GAIN_PER_TICK = 0.05;
/** Dopo l'ultimo guadagno si resta "a mangiare" ancora per tanto (ms): evita lo sfarfallio tra un frame e l'altro. */
export const EAT_HOLD_MS = 900;
/** Una creatura si considera ferma sotto questa velocità normalizzata. */
export const STILL_SPEED = 0.03;
/** Da ferma, dopo quanto (ms) comincia a riposare e quando è del tutto a riposo. */
export const REST_START_MS = 4000;
export const REST_FULL_MS = 8000;
/** Costante di tempo con cui i pesi degli stati seguono il bersaglio (ms). */
export const STATE_TAU_MS = 250;
/** Frequenza del respiro (Hz): da attiva e a riposo. */
export const BREATH_HZ_IDLE = 0.32;
export const BREATH_HZ_REST = 0.2;
/** Tempo massimo di un aggiornamento (ms): dopo una sospensione non si simula un salto enorme. */
export const MAX_STEP_MS = 250;

export interface LivingState {
  /** 0..1, derivato dall'id: sfasa le creature tra loro senza usare il generatore casuale della simulazione. */
  seed: number;
  /** Tempo accumulato (s), per le variazioni lente dell'idle. */
  clock: number;
  /** Fase del respiro (rad). */
  breathPhase: number;
  /** Da quanto è ferma (ms) e quanto resta "a mangiare" dopo l'ultimo guadagno (ms). */
  stillMs: number;
  eatHoldMs: number;
  /** Pesi lisciati degli stati, 0..1. Sommano al massimo 1; il resto è "cammina". */
  idle: number;
  eat: number;
  rest: number;
}

/** Valore stabile in [0, 1) dall'id (hash di Knuth). */
export function seedFromId(id: number): number {
  return ((Math.imul(id | 0, 2654435761) >>> 0) % 1000003) / 1000003;
}

export function createLivingState(id: number): LivingState {
  return { seed: seedFromId(id), clock: 0, breathPhase: seedFromId(id) * Math.PI * 2, stillMs: 0, eatHoldMs: 0, idle: 0, eat: 0, rest: 0 };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Aggiorna lo stato dopo `dtMs`. `vn` è la velocità visualizzata normalizzata (0 = ferma), `gainPerTick` il guadagno
 * di energia per tick (0 se non c'è il dato).
 */
export function stepLiving(state: LivingState, dtMs: number, vn: number, gainPerTick: number): void {
  const dt = clamp(dtMs, 0, MAX_STEP_MS);
  if (dt <= 0) return;
  const still = vn < STILL_SPEED;

  if (still) state.stillMs += dt;
  else state.stillMs = 0;
  if (gainPerTick > EAT_GAIN_PER_TICK) state.eatHoldMs = EAT_HOLD_MS;
  else state.eatHoldMs = Math.max(0, state.eatHoldMs - dt);

  // Bersagli degli stati. Camminando sono tutti zero (e "cammina" è il resto).
  let idleT = 0;
  let eatT = 0;
  let restT = 0;
  if (still) {
    if (state.eatHoldMs > 0) {
      eatT = 1;
    } else {
      restT = smoothstep(REST_START_MS, REST_FULL_MS, state.stillMs);
      idleT = 1 - restT;
    }
  }
  const k = 1 - Math.exp(-dt / STATE_TAU_MS);
  state.idle += (idleT - state.idle) * k;
  state.eat += (eatT - state.eat) * k;
  state.rest += (restT - state.rest) * k;
  if (state.idle < 1e-4) state.idle = 0;
  if (state.eat < 1e-4) state.eat = 0;
  if (state.rest < 1e-4) state.rest = 0;

  const dtSec = dt / 1000;
  state.clock += dtSec;
  const hz = BREATH_HZ_IDLE + (BREATH_HZ_REST - BREATH_HZ_IDLE) * state.rest;
  state.breathPhase = (state.breathPhase + Math.PI * 2 * hz * dtSec) % (Math.PI * 2);
}

/** Quanto la creatura è "viva da ferma" (somma dei pesi degli stati ferma): 0 se cammina. */
export function livingPresence(state: LivingState): number {
  return state.idle + state.eat + state.rest;
}

/**
 * Aggiunge alla posa del corpo (già calcolata per il cammino) i movimenti da ferma: respiro, sguardo che vaga e
 * qualche assestamento poco frequente (idle); testa giù con piccoli morsi (mangia); postura più bassa e rilassata
 * con respiro lento (riposa). Tutte le ampiezze sono piccole e proporzionate al peso dello stato.
 */
export function applyLivingPose(out: BodyPose, state: LivingState, detail: Readonly<LodDetail> = FULL_DETAIL): void {
  const presence = livingPresence(state);
  if (presence <= 0) return;
  const t = state.clock + state.seed * 100;
  const TWO_PI = Math.PI * 2;
  const s = state.seed;

  // Respiro: la sezione del torace pulsa; più lento e profondo a riposo. Non cambia mentre mangia (resta lieve).
  const breathAmp = (0.022 * (state.idle + state.eat * 0.7) + 0.032 * state.rest) * detail.breath;
  out.breath += breathAmp * Math.sin(state.breathPhase);

  // Idle: lo sguardo vaga a tratti (un inviluppo lento lo accende solo ogni tanto), un lieve cenno, un assestamento di peso.
  if (state.idle > 0 && detail.living > 0) {
    const lookEnvelope = Math.pow(Math.max(0, Math.sin(TWO_PI * (t / 19 + s))), 3);
    out.headYaw += 0.4 * state.idle * detail.living * lookEnvelope * Math.sin(TWO_PI * (t / 5.3) + s * 6);
    out.headPitch += 0.05 * state.idle * detail.living * Math.sin(TWO_PI * (t / 7.1) + s * 3);
    out.swayX += 0.012 * state.idle * detail.living * Math.sin(TWO_PI * (t / 11.3) + s * 5);
    const twitchEnvelope = Math.pow(Math.max(0, Math.sin(TWO_PI * (t / 13 + s * 2))), 6);
    out.tailYaw += 0.15 * state.idle * detail.living * twitchEnvelope * Math.sin(TWO_PI * t * 1.7);
  }

  // Mangia: la testa scende (muso in giù) con piccoli morsi ripetuti e un lieve spostamento laterale.
  if (state.eat > 0 && (detail.head > 0 || detail.body > 0)) {
    const bite = Math.abs(Math.sin(TWO_PI * 1.4 * t + s * 4));
    out.headPitch += state.eat * (0.5 + 0.12 * bite) * detail.head;
    out.headYaw += 0.1 * state.eat * detail.living * Math.sin(TWO_PI * (t / 3.7) + s * 2);
    out.bobY -= 0.012 * state.eat * bite * detail.body;
  }

  // Riposa: corpo più basso, testa e coda abbandonate, quasi nessun altro movimento.
  if (state.rest > 0) {
    out.bobY -= 0.07 * state.rest * detail.body;
    out.headPitch += 0.22 * state.rest * detail.head;
    out.tailPitch += 0.18 * state.rest * detail.tail;
  }
}
