/**
 * E2 — revisione della correlazione preda-predatore.
 *
 * La classificazione trofica usa i tratti E1 (`carnivoreFraction`/
 * `herbivoreFraction`) e non identifica il ruolo effettivo in un attacco.
 * Ogni correlazione e' descrittiva: non implica causalita'.
 */
import type { RunResult } from "../e1/runner";
import { summarize, type NumericSummary } from "../e1/statistics";
import {
  compareCrossCorrelations,
  type CrossCorrelationEntry,
  type LagSensitivityEntry,
  type Point,
} from "./timeseries";

export interface TrophicSeries {
  herbivore: Point[];
  carnivore: Point[];
}

export interface TrophicCorrelationSeed {
  seed: number;
  originalAtLagZero: number | null;
  detrendedAtLagZero: number | null;
  deltaAtLagZero: number | null;
  originalPeak: CrossCorrelationEntry | null;
  detrendedPeak: CrossCorrelationEntry | null;
  commonTrendDetected: boolean;
  spuriousTrendRisk: boolean;
  lagSensitivity: LagSensitivityEntry[];
}

export interface LagAggregate {
  lag: number;
  validSeeds: number;
  originalMean: number | null;
  detrendedMean: number | null;
  deltaMean: number | null;
}

export interface TrophicCorrelationReview {
  scenario: string;
  maxLag: number;
  seeds: TrophicCorrelationSeed[];
  originalAtLagZero: NumericSummary;
  detrendedAtLagZero: NumericSummary;
  originalPeakLag: NumericSummary;
  detrendedPeakLag: NumericSummary;
  spuriousTrendRiskSeeds: number;
  lagAggregates: LagAggregate[];
  note: string;
}

const finite = (values: Array<number | null | undefined>): number[] =>
  values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));

const meanOrNull = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

/** Conteggi trofici derivati dalle frazioni di tratto E1. */
export function trophicSeries(result: RunResult): TrophicSeries {
  return {
    herbivore: result.samples
      .filter((sample) => Number.isFinite(sample.herbivoreFraction))
      .map((sample) => ({ tick: sample.tick, value: sample.population * sample.herbivoreFraction })),
    carnivore: result.samples
      .filter((sample) => Number.isFinite(sample.carnivoreFraction))
      .map((sample) => ({ tick: sample.tick, value: sample.population * sample.carnivoreFraction })),
  };
}

/** Analisi per seed e aggregazione cross-seed delle correlazioni. */
export function analyzeTrophicCorrelation(
  results: RunResult[],
  maxLag: number,
  scenario = "S06_predator_prey_mixed",
): TrophicCorrelationReview {
  const seeds = results
    .slice()
    .sort((a, b) => a.seed - b.seed)
    .map((result) => {
      const series = trophicSeries(result);
      const comparison = compareCrossCorrelations(series.herbivore, series.carnivore, maxLag);
      return {
        seed: result.seed,
        originalAtLagZero: comparison.originalAtLagZero,
        detrendedAtLagZero: comparison.detrendedAtLagZero,
        deltaAtLagZero: comparison.deltaAtLagZero,
        originalPeak: comparison.originalPeak,
        detrendedPeak: comparison.detrendedPeak,
        commonTrendDetected: comparison.commonTrendDetected,
        spuriousTrendRisk: comparison.spuriousTrendRisk,
        lagSensitivity: comparison.lagSensitivity,
      };
    });

  const lags = Array.from({ length: 2 * Math.max(0, maxLag) + 1 }, (_, i) => i - maxLag);
  const lagAggregates = lags.map((lag): LagAggregate => {
    const original = finite(seeds.map((s) => s.lagSensitivity.find((e) => e.lag === lag)?.original));
    const detrended = finite(seeds.map((s) => s.lagSensitivity.find((e) => e.lag === lag)?.detrended));
    const delta = finite(seeds.map((s) => s.lagSensitivity.find((e) => e.lag === lag)?.delta));
    return {
      lag,
      validSeeds: Math.max(original.length, detrended.length),
      originalMean: meanOrNull(original),
      detrendedMean: meanOrNull(detrended),
      deltaMean: meanOrNull(delta),
    };
  });

  return {
    scenario,
    maxLag,
    seeds,
    originalAtLagZero: summarize(finite(seeds.map((s) => s.originalAtLagZero))),
    detrendedAtLagZero: summarize(finite(seeds.map((s) => s.detrendedAtLagZero))),
    originalPeakLag: summarize(finite(seeds.map((s) => s.originalPeak?.lag))),
    detrendedPeakLag: summarize(finite(seeds.map((s) => s.detrendedPeak?.lag))),
    spuriousTrendRiskSeeds: seeds.filter((s) => s.spuriousTrendRisk).length,
    lagAggregates,
    note: "Correlazioni descrittive su 12 seed non randomizzati; l'unita' e' la corsa/seed. Un lag non dimostra causalita' e una correlazione residua non dimostra dipendenza trofica.",
  };
}
