/**
 * v1.10.5 (consolidamento) — Quando ridisegnare le creature. Solo rendering.
 *
 * Prima il ridisegno avveniva solo con un frame nuovo del mondo o con un'interpolazione in corso. In pausa (il
 * worker non manda frame) e a velocità molto basse le creature restavano congelate a metà passo, senza respiro, senza
 * idle e senza riposo. La pausa deve fermare la simulazione, non la rappresentazione: finché ci sono creature
 * disegnate, la posa viva continua ad avanzare, ma a una frequenza ridotta (nessun tick artificiale, nessun dato
 * della simulazione toccato).
 */

/** Intervallo minimo (ms) tra due ridisegni "solo animazione" (nessun dato nuovo): circa 30 Hz. */
export const ANIMATION_ONLY_MIN_INTERVAL_MS = 33;

export interface DrawDecisionInput {
  /** C'è un frame nuovo, un'interpolazione in corso, un cambio di camera o di selezione. */
  dataDirty: boolean;
  /** Quante creature sono state disegnate l'ultima volta (0 = niente da animare). */
  drawnCount: number;
  /** Istante corrente e istante dell'ultimo ridisegno (ms). */
  nowMs: number;
  lastDrawAt: number;
  /** Intervallo minimo imposto dal costo misurato (0 o 33 ms). */
  costIntervalMs: number;
}

export function shouldDrawCreatures(input: DrawDecisionInput): boolean {
  const elapsed = input.nowMs - input.lastDrawAt;
  if (input.dataDirty) return elapsed >= input.costIntervalMs;
  if (input.drawnCount > 0) return elapsed >= Math.max(input.costIntervalMs, ANIMATION_ONLY_MIN_INTERVAL_MS);
  return false;
}
