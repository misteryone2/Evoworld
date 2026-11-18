/**
 * E2 — revisione della resilienza con controllo appaiato per seed.
 *
 * Il confronto con S01 evita di confondere il declino comune del sistema con
 * un effetto della perturbazione. Tutte le classi sono descrittive entro
 * l'orizzonte osservato e non implicano meccanismi causali.
 */
import type { RunResult } from "../e1/runner";
import { summarize, type NumericSummary } from "../e1/statistics";
import {
  assessPairedRecovery,
  DEFAULT_RECOVERY_THRESHOLDS,
  type PairedRecoveryAssessment,
  type RecoveryOutcome,
  type RecoveryThresholds,
} from "./resilience";
import { sampleSeries } from "./timeseries";

export interface ResilienceReview {
  scenarioPerturbed: string;
  scenarioControl: string;
  perturbationTick: number;
  thresholds: RecoveryThresholds;
  assessments: PairedRecoveryAssessment[];
  outcomeCounts: Record<RecoveryOutcome, number>;
  absoluteRecoverySeeds: number;
  controlRelativeRecoverySeeds: number;
  partialRecoverySeeds: number;
  noObservedRecoverySeeds: number;
  gapClosureFraction: NumericSummary;
  finalGap: NumericSummary;
  note: string;
}

const finite = (values: Array<number | null | undefined>): number[] =>
  values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));

const emptyCounts = (): Record<RecoveryOutcome, number> => ({
  absolute_recovery: 0,
  control_relative_recovery: 0,
  partial_recovery: 0,
  no_observed_recovery: 0,
});

/** Costruisce le coppie S08/S01 per seed e sintetizza gli esiti di recupero. */
export function analyzePairedResilience(
  perturbed: RunResult[],
  control: RunResult[],
  thresholds: RecoveryThresholds = DEFAULT_RECOVERY_THRESHOLDS,
): ResilienceReview {
  const perturbationTick = perturbed[0]?.perturbation?.atTick;
  if (!Number.isFinite(perturbationTick)) {
    throw new Error("Resilience review requires a perturbation.atTick on perturbed runs");
  }

  const controlBySeed = new Map(control.map((result) => [result.seed, result]));
  const assessments = perturbed
    .slice()
    .sort((a, b) => a.seed - b.seed)
    .map((result) => {
      const controlResult = controlBySeed.get(result.seed);
      if (!controlResult) throw new Error(`Missing paired control for seed ${result.seed}`);
      return assessPairedRecovery(
        sampleSeries(result, "population"),
        sampleSeries(controlResult, "population"),
        perturbationTick as number,
        result.seed,
        thresholds,
      );
    });

  const outcomeCounts = emptyCounts();
  for (const assessment of assessments) outcomeCounts[assessment.outcome]++;

  return {
    scenarioPerturbed: perturbed[0]?.scenario ?? "",
    scenarioControl: control[0]?.scenario ?? "",
    perturbationTick: perturbationTick as number,
    thresholds,
    assessments,
    outcomeCounts,
    absoluteRecoverySeeds: outcomeCounts.absolute_recovery,
    controlRelativeRecoverySeeds: outcomeCounts.control_relative_recovery,
    partialRecoverySeeds: outcomeCounts.partial_recovery,
    noObservedRecoverySeeds: outcomeCounts.no_observed_recovery,
    gapClosureFraction: summarize(finite(assessments.map((a) => a.gapClosureFraction))),
    finalGap: summarize(finite(assessments.map((a) => a.finalGap))),
    note: "Recupero assoluto, relativo al controllo appaiato, parziale e non osservato sono categorie descrittive entro l'orizzonte di 900 tick; non dimostrano irreversibilita' ne' meccanismi causali.",
  };
}
