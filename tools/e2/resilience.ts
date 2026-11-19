/**
 * E2 — valutazione additiva della resilienza confrontando la corsa perturbata
 * con il controllo appaiato per seed.
 *
 * Il modulo non modifica il motore: usa solo serie campionate E1. Distinguere
 * il recupero assoluto da quello relativo al controllo evita di interpretare
 * come "mancato recupero" un semplice declino comune a entrambe le corse.
 */
import type { Point, ReturnTime } from "./timeseries";
import { baselineBefore, returnTime } from "./timeseries";

export type RecoveryOutcome =
  | "absolute_recovery"
  | "control_relative_recovery"
  | "partial_recovery"
  | "no_observed_recovery";

export interface RecoveryThresholds {
  /** Banda di tolleranza come frazione della popolazione pre-perturbazione. */
  toleranceFraction: number;
  /** Campioni consecutivi richiesti dentro la banda. */
  minStablePoints: number;
  /** Frazione minima del divario massimo chiusa per parlare di recupero parziale. */
  partialRecoveryFraction: number;
  /** Numero di campioni prima della perturbazione usati come baseline. */
  baselineWindow: number;
}

export const DEFAULT_RECOVERY_THRESHOLDS: RecoveryThresholds = {
  toleranceFraction: 0.2,
  minStablePoints: 3,
  partialRecoveryFraction: 0.5,
  baselineWindow: 5,
};

export interface PairedRecoveryAssessment {
  seed: number;
  perturbationTick: number;
  absoluteBaseline: number | null;
  controlBaseline: number | null;
  preShockGap: number | null;
  tolerance: number | null;
  absolute: ReturnTime;
  controlRelative: ReturnTime;
  absoluteRecovered: boolean;
  controlRelativeRecovered: boolean;
  partialRecoveryObserved: boolean;
  finalGap: number | null;
  maxPostShockGap: number | null;
  gapClosureFraction: number | null;
  outcome: RecoveryOutcome;
}

const round = (value: number, digits = 6): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const valueAt = (points: Point[], tick: number): number | null => {
  const found = points.find((p) => p.tick === tick);
  return found ? found.value : null;
};

/**
 * Valuta il recupero di una corsa perturbata rispetto a un controllo appaiato.
 *
 * - assoluto: ritorno alla popolazione pre-perturbazione entro la tolleranza;
 * - relativo: ritorno del divario perturbed−control al divario pre-shock;
 * - parziale: chiusura di almeno `partialRecoveryFraction` del divario massimo
 *   post-shock, senza soddisfare i criteri precedenti;
 * - nessun recupero osservato: nessuno dei criteri precedenti entro l'orizzonte.
 */
export function assessPairedRecovery(
  perturbed: Point[],
  control: Point[],
  perturbationTick: number,
  seed: number,
  thresholds: RecoveryThresholds = DEFAULT_RECOVERY_THRESHOLDS,
): PairedRecoveryAssessment {
  const toleranceFraction = Math.max(0, thresholds.toleranceFraction);
  const absoluteBaseline = baselineBefore(perturbed, perturbationTick, thresholds.baselineWindow);
  const controlBaseline = baselineBefore(control, perturbationTick, thresholds.baselineWindow);

  const preShockTicks = perturbed
    .filter((p) => p.tick < perturbationTick)
    .map((p) => p.tick);
  const gaps = preShockTicks
    .map((tick) => {
      const a = valueAt(perturbed, tick);
      const b = valueAt(control, tick);
      return a !== null && b !== null ? a - b : null;
    })
    .filter((gap): gap is number => gap !== null);
  const preShockGap = gaps.length > 0
    ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
    : null;

  const tolerance = absoluteBaseline === null
    ? null
    : Math.max(1e-9, Math.abs(absoluteBaseline) * toleranceFraction);

  const absolute = returnTime(
    perturbed,
    perturbationTick,
    absoluteBaseline ?? 0,
    tolerance ?? 0,
    thresholds.minStablePoints,
  );

  const controlByTick = new Map(control.map((p) => [p.tick, p.value]));
  const relativeSeries: Point[] = perturbed
    .filter((p) => p.tick > perturbationTick)
    .map((p) => ({ tick: p.tick, value: p.value - (controlByTick.get(p.tick) ?? 0) }));
  const relativeTarget = preShockGap ?? 0;
  const controlRelative = returnTime(
    relativeSeries,
    perturbationTick,
    relativeTarget,
    tolerance ?? 0,
    thresholds.minStablePoints,
  );

  const postShockGaps = relativeSeries.map((p) => Math.abs(p.value - relativeTarget));
  const maxPostShockGap = postShockGaps.length > 0 ? Math.max(...postShockGaps) : null;
  const finalGap = postShockGaps.length > 0 ? postShockGaps[postShockGaps.length - 1] : null;
  const gapClosureFraction = maxPostShockGap === null || maxPostShockGap === 0 || finalGap === null
    ? null
    : round(Math.max(0, 1 - finalGap / maxPostShockGap));

  const absoluteRecovered = absolute.returnTick !== null;
  const controlRelativeRecovered = controlRelative.returnTick !== null;
  const partialRecoveryObserved = gapClosureFraction !== null
    && gapClosureFraction >= thresholds.partialRecoveryFraction;

  let outcome: RecoveryOutcome = "no_observed_recovery";
  if (absoluteRecovered) outcome = "absolute_recovery";
  else if (controlRelativeRecovered) outcome = "control_relative_recovery";
  else if (partialRecoveryObserved) outcome = "partial_recovery";

  return {
    seed,
    perturbationTick,
    absoluteBaseline: absoluteBaseline === null ? null : round(absoluteBaseline),
    controlBaseline: controlBaseline === null ? null : round(controlBaseline),
    preShockGap: preShockGap === null ? null : round(preShockGap),
    tolerance: tolerance === null ? null : round(tolerance),
    absolute,
    controlRelative,
    absoluteRecovered,
    controlRelativeRecovered,
    partialRecoveryObserved,
    finalGap: finalGap === null ? null : round(finalGap),
    maxPostShockGap: maxPostShockGap === null ? null : round(maxPostShockGap),
    gapClosureFraction,
    outcome,
  };
}
