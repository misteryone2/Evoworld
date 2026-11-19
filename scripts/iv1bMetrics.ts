/**
 * IV1-B-R1 — aritmetica delle metriche con finestre temporali esplicite.
 *
 * Modulo puro (nessun I/O, nessuna simulazione): usato dal benchmark e dai test.
 * Ogni funzione riceve esplicitamente la finestra a cui si riferisce, così non
 * è possibile mescolare contatori di warm-up con denominatori misurati.
 */

import type { EventSinkSummary } from "../simulation/ecology/observability";

/** Stato dei contatori evento in un istante. */
export interface CounterSnapshot {
  attempted: number;
  recorded: number;
  sampled: number;
  droppedNonCritical: number;
  criticalDropped: number;
  lostByTypeSum: number;
  flushedBatches: number;
  flushedEvents: number;
  flushErrors: number;
  byType: Record<string, number>;
  attemptsByType: Record<string, number>;
  lostByType: Record<string, number>;
}

const sumValues = (record: Record<string, number>): number =>
  Object.values(record).reduce((a, b) => a + b, 0);

export function counterLost(s: Pick<CounterSnapshot, "droppedNonCritical" | "criticalDropped" | "lostByTypeSum">): number {
  return s.droppedNonCritical + s.criticalDropped + s.lostByTypeSum;
}

export function snapshotCounters(summary: EventSinkSummary): CounterSnapshot {
  return {
    attempted: sumValues(summary.attemptsByType),
    recorded: summary.total,
    sampled: summary.sampled,
    droppedNonCritical: summary.droppedNonCritical,
    criticalDropped: summary.criticalDropped,
    lostByTypeSum: sumValues(summary.lostByType),
    flushedBatches: summary.flushedBatches,
    flushedEvents: summary.flushedEvents,
    flushErrors: summary.flushErrors,
    byType: { ...summary.byType },
    attemptsByType: { ...summary.attemptsByType },
    lostByType: { ...summary.lostByType },
  };
}

/** Delta per mappa chiave → conteggio. Chiavi presenti solo in `current` restano incluse. */
export function deltaMap(current: Record<string, number>, baseline: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(current)) {
    const delta = value - (baseline[key] ?? 0);
    if (delta !== 0) out[key] = delta;
  }
  return out;
}

/**
 * Differenza tra due snapshot: `current` deve essere successivo a `baseline`.
 * I valori negativi sono preservati (segnale di contatori incoerenti).
 */
export function deltaCounters(current: CounterSnapshot, baseline: CounterSnapshot): CounterSnapshot {
  return {
    attempted: current.attempted - baseline.attempted,
    recorded: current.recorded - baseline.recorded,
    sampled: current.sampled - baseline.sampled,
    droppedNonCritical: current.droppedNonCritical - baseline.droppedNonCritical,
    criticalDropped: current.criticalDropped - baseline.criticalDropped,
    lostByTypeSum: current.lostByTypeSum - baseline.lostByTypeSum,
    flushedBatches: current.flushedBatches - baseline.flushedBatches,
    flushedEvents: current.flushedEvents - baseline.flushedEvents,
    flushErrors: current.flushErrors - baseline.flushErrors,
    byType: deltaMap(current.byType, baseline.byType),
    attemptsByType: deltaMap(current.attemptsByType, baseline.attemptsByType),
    lostByType: deltaMap(current.lostByType, baseline.lostByType),
  };
}

/** Istante di riferimento per una finestra: tempo, CPU (µs) e heap (byte). */
export interface WindowPoint {
  wallMs: number;
  cpuUs: number;
  heapBytes: number;
}

/** Risultati della finestra misurata: differenza tra due istanti. */
export interface WindowDelta {
  wallMs: number;
  cpuMs: number;
  heapGrowthKB: number;
}

export function deltaWindow(afterWarmup: WindowPoint, afterMeasured: WindowPoint): WindowDelta {
  return {
    wallMs: afterMeasured.wallMs - afterWarmup.wallMs,
    cpuMs: (afterMeasured.cpuUs - afterWarmup.cpuUs) / 1000,
    heapGrowthKB: (afterMeasured.heapBytes - afterWarmup.heapBytes) / 1024,
  };
}

/** Eventi registrati per tick: denominatore = SOLI tick misurati della stessa cella. */
export function eventsPerTick(recorded: number, measuredTicks: number): number | null {
  if (!Number.isFinite(recorded) || !Number.isFinite(measuredTicks) || measuredTicks <= 0) return null;
  return recorded / measuredTicks;
}

/** Eventi/s: entrambi i valori si riferiscono alla stessa finestra misurata. */
export function eventsPerSecond(recorded: number, measuredWallMs: number): number | null {
  if (!Number.isFinite(recorded) || !Number.isFinite(measuredWallMs) || measuredWallMs <= 0) return null;
  return (recorded / measuredWallMs) * 1000;
}

/**
 * Costo per evento in microsecondi.
 * `stepOverheadMs` è l'extra `world.step()` per tick della configurazione con
 * observability rispetto alla configurazione senza, nella STESSA popolazione.
 * Il denominatore è il numero di eventi per tick della configurazione con
 * observability, non il totale di tutti i seed.
 */
export function microsecondsPerEvent(stepOverheadMs: number, recorded: number, measuredTicks: number): number | null {
  const perTick = eventsPerTick(recorded, measuredTicks);
  if (perTick === null || perTick <= 0 || !Number.isFinite(stepOverheadMs)) return null;
  return (stepOverheadMs * 1000) / perTick;
}

/** Media aritmetica esplicita: usata per le aggregazioni tra seed. */
export function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/** Somma esplicita: usata per i totali tra seed. */
export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
