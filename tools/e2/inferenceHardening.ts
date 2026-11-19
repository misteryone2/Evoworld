/**
 * E2.2.1 — hardening inferenziale indipendente.
 *
 * Questo modulo è additivo: non cambia il motore, non cambia la trasformata
 * IAAFT esatta e non cambia la regola p=(1+hits)/(B+1). Aggiunge QA per
 * singolo surrogato, gestione esplicita degli surrogati inadeguati,
 * calibrazione binomiale, correzione per confronti multipli e conversione
 * esplicita a NON_VALUTABILE quando la qualità non basta.
 */
import { summarize, type NumericSummary } from "../e1/statistics";
import {
  autocorrelationAtLag,
  deriveSurrogateSeed,
  iaaftSurrogatesDetailed,
  minimumOverlapFor,
  mulberry32,
  roundProbability,
  type IAAFTConvergenceSummary,
  type SurrogateConfig,
  type SurrogateNullTest,
} from "./surrogateInference";
import {
  bestCrossCorrelation,
  crossCorrelation,
  detrendLinear,
  linearTrend,
  type Point,
} from "./timeseries";
import type {
  DependenceAssessment,
  FoodWebReport,
  FoodWebScenarioReport,
  SequencingVerdict,
} from "./foodWebReport";

export const HARDENING_SCHEMA = "evoworld.e2.foodweb-inference-hardening.v1";

/**
 * Soglie pre-registrate dopo lo sweep di sensibilità: errore spettrale <=0.05
 * ed errore medio ensemble dell'autocorrelazione <=0.15. I casi ad alta
 * autocorrelazione che superano il vincolo vengono degradati a NON_VALUTABILE.
 */
export const QA_ACCEPTANCE = {
  spectralErrorMax: 0.05,
  autocorrelationErrorMax: 0.15,
  distributionErrorMax: 1e-9,
  nearConstantRelativeStd: 1e-9,
  minimumValidFraction: 0.5,
  minimumValidAbsolute: 30,
  manyTiesWarnFraction: 0.5,
  alpha: 0.05,
} as const;

export type EvaluabilityStatus = "VALUTABILE" | "NON_VALUTABILE";
export type AdjustmentMethod = "holm" | "bh" | "by";

export interface SeriesDiagnostics {
  n: number;
  finite: boolean;
  uniqueValues: number;
  tieFraction: number;
  manyTies: boolean;
  mean: number | null;
  standardDeviation: number | null;
  relativeStandardDeviation: number | null;
  degenerate: boolean;
  nearConstant: boolean;
  invalidationReasons: string[];
}

export interface HardenedSurrogateQaPair {
  index: number;
  valid: boolean;
  reasons: string[];
  convergedA: boolean;
  convergedB: boolean;
  iterationsA: number;
  iterationsB: number;
  finalSpectralErrorA: number;
  finalSpectralErrorB: number;
  maximumSortedDeviationA: number;
  maximumSortedDeviationB: number;
  maximumAutocorrelationErrorA: number | null;
  maximumAutocorrelationErrorB: number | null;
  finiteA: boolean;
  finiteB: boolean;
  distributionPreservedA: boolean;
  distributionPreservedB: boolean;
  autocorrelations: {
    a: Array<{ lag: number; observed: number | null; surrogate: number | null; absoluteError: number | null }>;
    b: Array<{ lag: number; observed: number | null; surrogate: number | null; absoluteError: number | null }>;
  };
}

export interface HardenedQualitySummary {
  policy: typeof QA_ACCEPTANCE;
  observed: { a: SeriesDiagnostics; b: SeriesDiagnostics };
  requestedSurrogates: number;
  validSurrogates: number;
  invalidSurrogates: number;
  minimumValidSurrogates: number;
  nonConvergedAccepted: number;
  invalidReasonCounts: Array<{ reason: string; count: number }>;
  ensembleAutocorrelation: Array<{
    lag: number;
    observedA: number | null;
    meanA: number | null;
    absoluteErrorA: number | null;
    observedB: number | null;
    meanB: number | null;
    absoluteErrorB: number | null;
  }>;
  surrogates: HardenedSurrogateQaPair[];
}

export interface HardenedSurrogateNullTest extends SurrogateNullTest {
  status: EvaluabilityStatus;
  quality: HardenedQualitySummary;
}

export interface HardenedCombinedEvidence {
  method: "Fisher";
  tests: number;
  fisherP: number;
  significant: boolean;
  alpha: number;
  minPValue: number;
  note: string;
  status: EvaluabilityStatus;
  validTests: number;
  invalidTests: number;
}

const round = (value: number, digits = 6): number => {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const maximumOrNull = (values: Array<number | null>): number | null => {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return finite.length === 0 ? null : Math.max(...finite);
};

export function diagnoseSeries(values: number[]): SeriesDiagnostics {
  const n = values.length;
  const finite = n > 0 && values.every(Number.isFinite);
  const invalidationReasons: string[] = [];
  if (!finite) invalidationReasons.push("non-finite observed series");
  if (n < 4) invalidationReasons.push("series shorter than four observations");
  const clean = finite ? values : values.filter(Number.isFinite);
  const mean = clean.length === 0 ? null : clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance = mean === null || clean.length < 2
    ? null
    : clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (clean.length - 1);
  const standardDeviation = variance === null ? null : Math.sqrt(variance);
  const scale = clean.length === 0 ? 1 : Math.max(1, ...clean.map((value) => Math.abs(value)));
  const relativeStandardDeviation = standardDeviation === null ? null : standardDeviation / scale;
  const uniqueValues = new Set(clean).size;
  const tieFraction = clean.length === 0 ? 1 : 1 - uniqueValues / clean.length;
  const degenerate = finite && (uniqueValues < 2 || standardDeviation === 0);
  const nearConstant = finite && !degenerate
    && relativeStandardDeviation !== null
    && relativeStandardDeviation <= QA_ACCEPTANCE.nearConstantRelativeStd;
  if (degenerate) invalidationReasons.push("degenerate series");
  if (nearConstant) invalidationReasons.push("near-constant series");
  return {
    n,
    finite,
    uniqueValues,
    tieFraction: round(tieFraction),
    manyTies: tieFraction > QA_ACCEPTANCE.manyTiesWarnFraction,
    mean: mean === null ? null : round(mean),
    standardDeviation: standardDeviation === null ? null : round(standardDeviation, 12),
    relativeStandardDeviation: relativeStandardDeviation === null ? null : round(relativeStandardDeviation, 12),
    degenerate,
    nearConstant,
    invalidationReasons,
  };
}

export function minimumValidSurrogates(requested: number): number {
  return Math.max(
    QA_ACCEPTANCE.minimumValidAbsolute,
    Math.ceil(QA_ACCEPTANCE.minimumValidFraction * Math.max(1, requested)),
  );
}

const trendR2 = (points: Point[]): number | null => linearTrend(points).r2;

function nonEvaluableTest(
  pairId: string,
  seed: number,
  a: Point[],
  b: Point[],
  maxLag: number,
  config: SurrogateConfig,
  quality: HardenedQualitySummary,
  note: string,
): HardenedSurrogateNullTest {
  return {
    method: "IAAFT",
    pairId,
    seed,
    maxLag,
    rngSeed: deriveSurrogateSeed(config.seed, pairId, seed, 0),
    surrogates: 0,
    iterations: config.iterations,
    alpha: config.alpha,
    minOverlappingObservations: config.minOverlappingObservations,
    lagsAttempted: 2 * maxLag + 1,
    lagsAccepted: 0,
    observedCorrelation: null,
    observedLag: null,
    observedMaxAbs: null,
    nullMaxAbs: summarize([]),
    convergence: {
      criterion: "relative amplitude-spectrum error after rank remapping",
      tolerance: 1e-3,
      maxIterations: config.iterations,
      iterations: { min: 0, mean: 0, max: 0 },
      finalRelativeSpectralError: { mean: 0, max: 0 },
      bestRelativeSpectralError: { mean: 0, max: 0 },
      convergedSurrogates: 0,
      totalSurrogates: 0,
    },
    pValue: 1,
    significantWithinRun: false,
    properties: {
      originalTrendR2: { a: trendR2(a), b: trendR2(b) },
      residualTrendR2: { a: null, b: null },
      surrogateResidualTrendR2: { mean: 0, max: 0 },
      lag1Autocorrelation: {
        observedA: autocorrelationAtLag(a.map((point) => point.value), 1),
        observedB: autocorrelationAtLag(b.map((point) => point.value), 1),
        surrogateMeanA: null,
        surrogateMeanB: null,
        absoluteErrorA: null,
        absoluteErrorB: null,
      },
      valueDistribution: { preservedByRankRemapping: false, maximumSortedDeviation: Number.POSITIVE_INFINITY },
    },
    note,
    status: "NON_VALUTABILE",
    quality,
  };
}

function countReasons(reasons: string[]): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([reason, count]) => ({ reason, count }));
}

/**
 * Null test con QA esplicita. La metodologia IAAFT e la statistica del test
 * restano identiche a runSurrogateNullTest: cambia solo cosa viene accettato
 * e come viene segnalata l'assenza di evidenza sufficiente.
 */
export function runHardenedSurrogateNullTest(
  pairId: string,
  seed: number,
  a: Point[],
  b: Point[],
  maxLag: number,
  config: SurrogateConfig,
): HardenedSurrogateNullTest {
  const minimum = minimumOverlapFor(a, b, config.minOverlappingObservations);
  const detrendedA = detrendLinear(a);
  const detrendedB = detrendLinear(b);
  const valuesA = detrendedA.residuals.map((point) => point.value);
  const valuesB = detrendedB.residuals.map((point) => point.value);
  const diagnosticsA = diagnoseSeries(valuesA);
  const diagnosticsB = diagnoseSeries(valuesB);
  const observedCurve = crossCorrelation(detrendedA.residuals, detrendedB.residuals, maxLag, minimum);
  const observedPeak = bestCrossCorrelation(observedCurve);
  const observedMaxAbs = observedPeak?.correlation === null || observedPeak?.correlation === undefined
    ? null
    : Math.abs(observedPeak.correlation as number);
  const requested = Math.max(0, Math.floor(config.surrogates));
  const minValid = minimumValidSurrogates(requested);
  const baseQuality = (): HardenedQualitySummary => ({
    policy: QA_ACCEPTANCE,
    observed: { a: diagnosticsA, b: diagnosticsB },
    requestedSurrogates: requested,
    validSurrogates: 0,
    invalidSurrogates: 0,
    minimumValidSurrogates: minValid,
    nonConvergedAccepted: 0,
    invalidReasonCounts: [],
    ensembleAutocorrelation: [],
    surrogates: [],
  });

  if (diagnosticsA.invalidationReasons.length > 0 || diagnosticsB.invalidationReasons.length > 0) {
    const reasons = [
      ...diagnosticsA.invalidationReasons.map((reason) => `A: ${reason}`),
      ...diagnosticsB.invalidationReasons.map((reason) => `B: ${reason}`),
    ];
    const quality = baseQuality();
    quality.invalidReasonCounts = countReasons(reasons);
    return nonEvaluableTest(pairId, seed, a, b, maxLag, config, quality,
      `NON_VALUTABILE: serie inadeguate (${reasons.join("; ")}).`);
  }
  if (observedMaxAbs === null) {
    const quality = baseQuality();
    quality.invalidReasonCounts = [{ reason: "observed cross-correlation not estimable", count: 1 }];
    return nonEvaluableTest(pairId, seed, a, b, maxLag, config, quality,
      "NON_VALUTABILE: correlazione osservata non stimabile sui lag accettati.");
  }

  const rngA = mulberry32(deriveSurrogateSeed(config.seed, pairId, seed, 1));
  const rngB = mulberry32(deriveSurrogateSeed(config.seed, pairId, seed, 2));
  const qaOptions = { allowInvalidSurrogates: true } as const;
  const detailedA = iaaftSurrogatesDetailed(valuesA, requested, rngA, config.iterations, qaOptions);
  const detailedB = iaaftSurrogatesDetailed(valuesB, requested, rngB, config.iterations, qaOptions);

  const nullMaxima: number[] = [];
  const surrogateTrendR2: number[] = [];
  const surrogateRecords: HardenedSurrogateQaPair[] = [];
  const allReasons: string[] = [];
  let nonConvergedAccepted = 0;

  for (let index = 0; index < Math.min(detailedA.surrogates.length, detailedB.surrogates.length); index++) {
    const qaA = detailedA.qa[index];
    const qaB = detailedB.qa[index];
    const reasons: string[] = [];
    const maxErrorA = maximumOrNull(qaA.autocorrelations.map((entry) => entry.absoluteError));
    const maxErrorB = maximumOrNull(qaB.autocorrelations.map((entry) => entry.absoluteError));

    for (const [label, record] of [
      ["A", qaA],
      ["B", qaB],
    ] as const) {
      for (const reason of record.invalidationReasons) reasons.push(`${label}: ${reason}`);
      if (!record.numericValid) reasons.push(`${label}: numeric QA failed`);
      if (record.finalSpectralError > QA_ACCEPTANCE.spectralErrorMax) {
        reasons.push(`${label}: spectral error ${round(record.finalSpectralError)} > ${QA_ACCEPTANCE.spectralErrorMax}`);
      }
    }

    const valid = reasons.length === 0;
    if (!valid) allReasons.push(...reasons);
    if (valid && (!qaA.converged || !qaB.converged)) nonConvergedAccepted++;

    surrogateRecords.push({
      index,
      valid,
      reasons,
      convergedA: qaA.converged,
      convergedB: qaB.converged,
      iterationsA: qaA.iterations,
      iterationsB: qaB.iterations,
      finalSpectralErrorA: qaA.finalSpectralError,
      finalSpectralErrorB: qaB.finalSpectralError,
      maximumSortedDeviationA: qaA.maximumSortedDeviation,
      maximumSortedDeviationB: qaB.maximumSortedDeviation,
      maximumAutocorrelationErrorA: maxErrorA,
      maximumAutocorrelationErrorB: maxErrorB,
      finiteA: qaA.finite,
      finiteB: qaB.finite,
      distributionPreservedA: qaA.empiricalDistributionPreserved,
      distributionPreservedB: qaB.empiricalDistributionPreserved,
      autocorrelations: { a: qaA.autocorrelations, b: qaB.autocorrelations },
    });

    if (!valid) continue;
    const surrogatePointsA = detrendedA.residuals.map((point, pointIndex) => ({
      tick: point.tick,
      value: detailedA.surrogates[index][pointIndex],
    }));
    const surrogatePointsB = detrendedB.residuals.map((point, pointIndex) => ({
      tick: point.tick,
      value: detailedB.surrogates[index][pointIndex],
    }));
    const peak = bestCrossCorrelation(crossCorrelation(surrogatePointsA, surrogatePointsB, maxLag, minimum));
    if (peak?.correlation !== null && peak?.correlation !== undefined) {
      nullMaxima.push(Math.abs(peak.correlation as number));
    }
    surrogateTrendR2.push(trendR2(surrogatePointsA.map((point, pointIndex) => ({
      tick: pointIndex,
      value: point.value,
    }))) ?? 0);
  }

  const validSurrogates = surrogateRecords.filter((record) => record.valid).length;
  const validIndices = surrogateRecords.filter((record) => record.valid).map((record) => record.index);
  const lagList = surrogateRecords[0]?.autocorrelations.a.map((entry) => entry.lag) ?? [];
  const ensembleAutocorrelation = lagList.map((lag) => {
    const meanFor = (side: "a" | "b"): { observed: number | null; mean: number | null; error: number | null } => {
      const entries = validIndices.flatMap((index) => {
        const record = surrogateRecords[index];
        const match = record.autocorrelations[side].find((entry) => entry.lag === lag);
        return match?.surrogate === null || match?.surrogate === undefined
          ? []
          : [{ observed: match.observed, surrogate: match.surrogate as number }];
      });
      const observed = entries[0]?.observed ?? autocorrelationAtLag(side === "a" ? valuesA : valuesB, lag);
      const mean = entries.length === 0 ? null
        : entries.reduce((sum, entry) => sum + entry.surrogate, 0) / entries.length;
      return {
        observed,
        mean,
        error: observed === null || mean === null ? null : Math.abs(observed - mean),
      };
    };
    const a = meanFor("a");
    const b = meanFor("b");
    return {
      lag,
      observedA: a.observed,
      meanA: a.mean,
      absoluteErrorA: a.error,
      observedB: b.observed,
      meanB: b.mean,
      absoluteErrorB: b.error,
    };
  });
  const ensembleError = maximumOrNull(ensembleAutocorrelation.flatMap((entry) => [entry.absoluteErrorA, entry.absoluteErrorB]));
  const quality: HardenedQualitySummary = {
    ...baseQuality(),
    validSurrogates,
    invalidSurrogates: surrogateRecords.length - validSurrogates,
    nonConvergedAccepted,
    invalidReasonCounts: countReasons(allReasons),
    ensembleAutocorrelation,
    surrogates: surrogateRecords,
  };
  if (ensembleError !== null && ensembleError > QA_ACCEPTANCE.autocorrelationErrorMax) {
    quality.invalidReasonCounts = countReasons([...allReasons,
      `ensemble autocorrelation error ${round(ensembleError)} > ${QA_ACCEPTANCE.autocorrelationErrorMax}`]);
    return nonEvaluableTest(pairId, seed, a, b, maxLag, config, quality,
      `NON_VALUTABILE: errore ACF ensemble ${round(ensembleError)} oltre ${QA_ACCEPTANCE.autocorrelationErrorMax}.`);
  }
  if (validSurrogates < minValid) {
    return nonEvaluableTest(pairId, seed, a, b, maxLag, config, quality,
      `NON_VALUTABILE: ${validSurrogates} surrogati validi su ${requested} richiesti, minimo ${minValid}.`);
  }

  const pValue = (1 + nullMaxima.filter((value) => value >= (observedMaxAbs as number)).length) / (nullMaxima.length + 1);
  const observedAutocorrA = autocorrelationAtLag(valuesA, 1);
  const observedAutocorrB = autocorrelationAtLag(valuesB, 1);
  const meanAutocorr = (records: typeof detailedA.qa): number | null => {
    const entries = records.flatMap((record) => record.autocorrelations
      .filter((entry) => entry.lag === 1 && entry.surrogate !== null)
      .map((entry) => entry.surrogate as number));
    return entries.length === 0 ? null : entries.reduce((sum, value) => sum + value, 0) / entries.length;
  };
  const meanA = meanAutocorr(detailedA.qa);
  const meanB = meanAutocorr(detailedB.qa);
  const maximumSortedDeviation = Math.max(
    ...detailedA.qa.map((record) => record.maximumSortedDeviation),
    ...detailedB.qa.map((record) => record.maximumSortedDeviation),
  );
  const convergence: IAAFTConvergenceSummary = {
    criterion: detailedA.convergence.criterion,
    tolerance: detailedA.convergence.tolerance,
    maxIterations: detailedA.convergence.maxIterations,
    iterations: {
      min: Math.min(detailedA.convergence.iterations.min, detailedB.convergence.iterations.min),
      mean: (detailedA.convergence.iterations.mean + detailedB.convergence.iterations.mean) / 2,
      max: Math.max(detailedA.convergence.iterations.max, detailedB.convergence.iterations.max),
    },
    finalRelativeSpectralError: {
      mean: (detailedA.convergence.finalRelativeSpectralError.mean + detailedB.convergence.finalRelativeSpectralError.mean) / 2,
      max: Math.max(detailedA.convergence.finalRelativeSpectralError.max, detailedB.convergence.finalRelativeSpectralError.max),
    },
    bestRelativeSpectralError: {
      mean: (detailedA.convergence.bestRelativeSpectralError.mean + detailedB.convergence.bestRelativeSpectralError.mean) / 2,
      max: Math.max(detailedA.convergence.bestRelativeSpectralError.max, detailedB.convergence.bestRelativeSpectralError.max),
    },
    convergedSurrogates: detailedA.convergence.convergedSurrogates + detailedB.convergence.convergedSurrogates,
    totalSurrogates: detailedA.convergence.totalSurrogates + detailedB.convergence.totalSurrogates,
  };

  return {
    method: "IAAFT",
    pairId,
    seed,
    maxLag,
    rngSeed: deriveSurrogateSeed(config.seed, pairId, seed, 0),
    surrogates: nullMaxima.length,
    iterations: config.iterations,
    alpha: config.alpha,
    minOverlappingObservations: minimum,
    lagsAttempted: observedCurve.lagSearch.lagsAttempted,
    lagsAccepted: observedCurve.lagSearch.lagsAccepted,
    observedCorrelation: observedPeak?.correlation ?? null,
    observedLag: observedPeak?.lag ?? null,
    observedMaxAbs: round(observedMaxAbs),
    nullMaxAbs: summarize(nullMaxima),
    convergence,
    pValue: roundProbability(pValue),
    significantWithinRun: pValue < config.alpha,
    properties: {
      originalTrendR2: { a: trendR2(a), b: trendR2(b) },
      residualTrendR2: { a: trendR2(detrendedA.residuals), b: trendR2(detrendedB.residuals) },
      surrogateResidualTrendR2: {
        mean: round(surrogateTrendR2.length === 0 ? 0
          : surrogateTrendR2.reduce((sum, value) => sum + value, 0) / surrogateTrendR2.length),
        max: round(surrogateTrendR2.length === 0 ? 0 : Math.max(...surrogateTrendR2)),
      },
      lag1Autocorrelation: {
        observedA: observedAutocorrA,
        observedB: observedAutocorrB,
        surrogateMeanA: meanA === null ? null : round(meanA),
        surrogateMeanB: meanB === null ? null : round(meanB),
        absoluteErrorA: observedAutocorrA === null || meanA === null ? null : round(Math.abs(observedAutocorrA - meanA)),
        absoluteErrorB: observedAutocorrB === null || meanB === null ? null : round(Math.abs(observedAutocorrB - meanB)),
      },
      valueDistribution: {
        preservedByRankRemapping: maximumSortedDeviation <= QA_ACCEPTANCE.distributionErrorMax,
        maximumSortedDeviation: round(maximumSortedDeviation, 12),
      },
    },
    note: "p two-sided del massimo |r| sui lag accettati, con surrogati IAAFT a lunghezza esatta e QA esplicita; la significatività non implica causalità.",
    status: "VALUTABILE",
    quality,
  };
}

export function combineHardenedEvidence(
  tests: HardenedSurrogateNullTest[],
  alpha: number = QA_ACCEPTANCE.alpha,
): HardenedCombinedEvidence {
  const evaluable = tests.filter((test) => test.status === "VALUTABILE");
  const usable = evaluable
    .map((test) => test.pValue)
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 1);
  const invalidTests = tests.length - evaluable.length;
  if (usable.length === 0 || usable.length < evaluable.length) {
    return {
      method: "Fisher",
      tests: 0,
      fisherP: 1,
      significant: false,
      alpha,
      minPValue: 1,
      note: "Nessun test surrogato valutabile: evidenza statistica NON_VALUTABILE.",
      status: "NON_VALUTABILE",
      validTests: 0,
      invalidTests: tests.length,
    };
  }
  const statistic = -2 * usable.reduce((sum, value) => sum + Math.log(value), 0);
  const degrees = 2 * usable.length;
  const k = degrees / 2;
  let term = 1;
  let sum = 1;
  for (let j = 1; j < k; j++) {
    term *= statistic / j;
    sum += term;
  }
  const fisherP = Math.max(0, Math.min(1, Math.exp(-statistic + Math.log(sum))));
  return {
    method: "Fisher",
    tests: usable.length,
    fisherP: roundProbability(fisherP),
    significant: fisherP < alpha,
    alpha,
    minPValue: roundProbability(Math.min(...usable)),
    note: "Fisher combina corse/seed valutabili; unità statistica = corsa/seed, non tick.",
    status: "VALUTABILE",
    validTests: usable.length,
    invalidTests,
  };
}

/** Intervallo di Wilson per una proporzione binomiale. */
export function wilsonInterval(successes: number, trials: number, z = 1.96): { low: number; high: number } {
  if (trials <= 0) return { low: 0, high: 1 };
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const centre = (p + z2 / (2 * trials)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials)) / denominator;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

export interface FprSummary {
  alpha: number;
  tests: number;
  rejections: number;
  falsePositiveRate: number;
  ci95: { low: number; high: number };
  meanPValue: number;
  medianPValue: number;
  nonEvaluableRate: number;
  ksDistanceUniform: number;
  quantiles: Record<string, number>;
}

const quantile = (sorted: number[], fraction: number): number => {
  if (sorted.length === 0) return 1;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

/** KS against the exact discrete null grid (1+h)/(B+1), not a continuous uniform. */
export function ksDistanceDiscrete(pValues: number[], surrogatesPerTest: number): number {
  const b = Math.max(1, Math.floor(surrogatesPerTest));
  if (pValues.length === 0) return 1;
  const counts = new Array<number>(b + 1).fill(0);
  for (const value of pValues) {
    const level = Math.round(value * (b + 1)) - 1;
    if (level >= 0 && level <= b) counts[level]++;
  }
  let cumulative = 0;
  let distance = 0;
  for (let level = 0; level <= b; level++) {
    cumulative += counts[level];
    distance = Math.max(distance, Math.abs(cumulative / pValues.length - (level + 1) / (b + 1)));
  }
  return distance;
}

export function summarizeFpr(
  pValues: number[],
  alpha: number = QA_ACCEPTANCE.alpha,
  nonEvaluable = 0,
  surrogatesPerTest: number | null = null,
): FprSummary {
  const sorted = [...pValues].sort((a, b) => a - b);
  const n = sorted.length;
  const ks = surrogatesPerTest === null
    ? (() => {
      let distance = 0;
      for (let index = 0; index < n; index++) {
        distance = Math.max(distance, (index + 1) / n - sorted[index], sorted[index] - index / n);
      }
      return distance;
    })()
    : ksDistanceDiscrete(sorted, surrogatesPerTest);
  const rejections = sorted.filter((value) => value < alpha).length;
  return {
    alpha,
    tests: n,
    rejections,
    falsePositiveRate: n === 0 ? 0 : rejections / n,
    ci95: wilsonInterval(rejections, n),
    meanPValue: n === 0 ? 1 : sorted.reduce((sum, value) => sum + value, 0) / n,
    medianPValue: quantile(sorted, 0.5),
    nonEvaluableRate: nonEvaluable + n === 0 ? 1 : nonEvaluable / (nonEvaluable + n),
    ksDistanceUniform: n === 0 ? 1 : ks,
    quantiles: {
      p05: quantile(sorted, 0.05),
      p25: quantile(sorted, 0.25),
      p50: quantile(sorted, 0.5),
      p75: quantile(sorted, 0.75),
      p95: quantile(sorted, 0.95),
    },
  };
}

/** Limiti di accettazione pre-registrati, applicati prima di qualunque interpretazione. */
export const FPR_ACCEPTANCE = {
  alpha: 0.05,
  maximumPointEstimate: 0.065,
  maximumUpperCi95: 0.075,
  minimumMeanPValue: 0.45,
  maximumMeanPValue: 0.55,
  maximumKsDistance: 0.045,
  maximumNonEvaluableRate: 0.05,
} as const;

export function evaluateFprCell(summary: FprSummary): {
  accepted: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (summary.falsePositiveRate > FPR_ACCEPTANCE.maximumPointEstimate) reasons.push("FPR puntuale oltre il limite");
  if (summary.ci95.high > FPR_ACCEPTANCE.maximumUpperCi95) reasons.push("limite superiore CI95 oltre il limite");
  if (summary.meanPValue < FPR_ACCEPTANCE.minimumMeanPValue) reasons.push("media p troppo bassa");
  if (summary.meanPValue > FPR_ACCEPTANCE.maximumMeanPValue) reasons.push("media p troppo alta");
  if (summary.ksDistanceUniform > FPR_ACCEPTANCE.maximumKsDistance) reasons.push("p-value non uniforme (KS)");
  if (summary.nonEvaluableRate > FPR_ACCEPTANCE.maximumNonEvaluableRate) reasons.push("tasso NON_VALUTABILE eccessivo");
  return { accepted: reasons.length === 0, reasons };
}

export interface AdjustedPValue {
  id: string;
  rawP: number;
  adjustedP: number;
  rejected: boolean;
}

const clampP = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));

export function holmAdjust(values: number[]): number[] {
  const n = values.length;
  const order = values.map((value, index) => ({ value: clampP(value), index }))
    .sort((a, b) => a.value - b.value);
  const adjusted = new Array<number>(n).fill(1);
  let running = 0;
  for (let rank = 0; rank < n; rank++) {
    running = Math.max(running, (n - rank) * order[rank].value);
    adjusted[order[rank].index] = clampP(running);
  }
  return adjusted;
}

export function benjaminiHochbergAdjust(values: number[]): number[] {
  const n = values.length;
  const order = values.map((value, index) => ({ value: clampP(value), index }))
    .sort((a, b) => a.value - b.value);
  const adjusted = new Array<number>(n).fill(1);
  let running = 1;
  for (let rank = n - 1; rank >= 0; rank--) {
    const candidate = (n / (rank + 1)) * order[rank].value;
    running = Math.min(running, candidate);
    adjusted[order[rank].index] = clampP(running);
  }
  return adjusted;
}

export function benjaminiYekutieliAdjust(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const correction = Array.from({ length: n }, (_, index) => 1 / (index + 1))
    .reduce((sum, value) => sum + value, 0);
  return benjaminiHochbergAdjust(values.map((value) => clampP(value) * correction));
}

export function adjustFamily(
  entries: Array<{ id: string; rawP: number }>,
  method: AdjustmentMethod,
  alpha: number = QA_ACCEPTANCE.alpha,
): AdjustedPValue[] {
  const raw = entries.map((entry) => entry.rawP);
  const adjusted = method === "holm"
    ? holmAdjust(raw)
    : method === "bh"
      ? benjaminiHochbergAdjust(raw)
      : benjaminiYekutieliAdjust(raw);
  return entries.map((entry, index) => ({
    id: entry.id,
    rawP: roundProbability(entry.rawP),
    adjustedP: roundProbability(adjusted[index]),
    rejected: adjusted[index] < alpha,
  }));
}

export const PRIMARY_PAIR_IDS = ["herbivore_carnivore", "herbivore_kills"] as const;
export const PRIMARY_FAMILY = {
  id: "primary_s06_sequencing",
  method: "holm" as AdjustmentMethod,
  alpha: 0.05,
  pairs: [...PRIMARY_PAIR_IDS],
  declaration: "Dichiarata prima dell'analisi: sequenzialità positiva erbivoro→carnivoro e erbivoro→kills in S06, in tutti e quattro i blocchi. Holm FWER perché i blocchi riutilizzano le stesse 120 corse e non sono indipendenti.",
} as const;
export const EXPLORATORY_FAMILY = {
  id: "exploratory_s06_remaining_pairs",
  method: "bh" as AdjustmentMethod,
  alpha: 0.05,
  pairs: ["carnivore_kills", "vegetation_herbivore", "vegetation_carnivore"] as const,
  declaration: "Famiglia esplorativa: tre coppie restanti in S06 nei quattro blocchi. BH FDR alpha=0.05 con analisi di sensibilità BY; dipendenza positiva plausibile ma non dimostrata.",
} as const;

export interface FamilyDefinition {
  id: string;
  method: AdjustmentMethod;
  alpha: number;
  pairs: readonly string[];
  declaration: string;
}

export interface HardeningAssessment {
  id: string;
  block: string;
  scenario: string;
  pairId: string;
  familyId: string;
  method: AdjustmentMethod;
  alpha: number;
  rawP: number | null;
  adjustedP: number | null;
  byAdjustedP: number | null;
  evaluable: boolean;
  verdictBefore: SequencingVerdict | null;
  verdictAfter: SequencingVerdict | null;
  lostSignificance: boolean;
}

export interface HardeningSummary {
  schema: typeof HARDENING_SCHEMA;
  families: FamilyDefinition[];
  assessments: HardeningAssessment[];
  lostSignificanceCount: number;
  nonEvaluableCount: number;
  note: string;
}

export type HardenedReport = FoodWebReport & {
  inferenceHardening: {
    block: string;
    schema: typeof HARDENING_SCHEMA;
    families: FamilyDefinition[];
    assessments: HardeningAssessment[];
  };
};

const revisedVerdict = (
  assessment: DependenceAssessment,
  adjustedP: number | null,
  alpha: number,
): SequencingVerdict => {
  if (assessment.statistical.classification === "NON_VALUTABILE" || adjustedP === null) return "NON_VALUTABILE";
  const direction = assessment.sequencing.direction;
  const descriptive = assessment.descriptive.classification;
  if (adjustedP < alpha && descriptive === "CONSISTENTE" && (direction === "POSITIVA" || direction === "NEGATIVA")) {
    return direction === "POSITIVA"
      ? "EVIDENZA_SEQUENZIALITA_POSITIVA"
      : "EVIDENZA_SEQUENZIALITA_NEGATIVA";
  }
  if (descriptive !== "INCONSISTENTE") {
    return direction === "POSITIVA"
      ? "INDICATIVO_POSITIVO"
      : direction === "NEGATIVA"
        ? "INDICATIVO_NEGATIVO"
        : "INDICATIVO_MISTO";
  }
  return "NON_DIMOSTRATO";
};

/** Applica le famiglie pre-dichiarate a più blocchi e restituisce report aggiornati. */
export function hardenFoodWebReports(
  inputs: Array<{ block: string; report: FoodWebReport }>,
): { reports: HardenedReport[]; summary: HardeningSummary } {
  const families: FamilyDefinition[] = [PRIMARY_FAMILY, EXPLORATORY_FAMILY];
  const rows: Array<HardeningAssessment & { pairAssessment: DependenceAssessment; scenarioReport: FoodWebScenarioReport }> = [];
  for (const { block, report } of inputs) {
    for (const scenario of report.byScenario) {
      for (const [pairId, pairAssessment] of Object.entries(scenario.sequencingByPair ?? {})) {
        const family = families.find((candidate) => (candidate.pairs as readonly string[]).includes(pairId));
        if (!family) continue;
        const rawP = pairAssessment.statistical.combinedP;
        rows.push({
          id: `${block}|${scenario.scenario}|${pairId}`,
          block,
          scenario: scenario.scenario,
          pairId,
          familyId: family.id,
          method: family.method,
          alpha: family.alpha,
          rawP,
          adjustedP: null,
          byAdjustedP: null,
          evaluable: pairAssessment.statistical.classification !== "NON_VALUTABILE"
            && rawP !== null && Number.isFinite(rawP),
          verdictBefore: pairAssessment.sequencing.verdict,
          verdictAfter: pairAssessment.sequencing.verdict,
          lostSignificance: false,
          pairAssessment,
          scenarioReport: scenario,
        });
      }
    }
  }

  for (const family of families) {
    const members = rows.filter((row) => row.familyId === family.id && row.evaluable && row.rawP !== null);
    const adjusted = adjustFamily(members.map((row) => ({ id: row.id, rawP: row.rawP as number })), family.method, family.alpha);
    const by = adjustFamily(members.map((row) => ({ id: row.id, rawP: row.rawP as number })), "by", family.alpha);
    const adjustedMap = new Map(adjusted.map((entry) => [entry.id, entry]));
    const byMap = new Map(by.map((entry) => [entry.id, entry]));
    for (const row of members) {
      const entry = adjustedMap.get(row.id);
      if (!entry) continue;
      row.adjustedP = entry.adjustedP;
      row.byAdjustedP = byMap.get(row.id)?.adjustedP ?? null;
      row.verdictAfter = revisedVerdict(row.pairAssessment, entry.adjustedP, family.alpha);
      row.lostSignificance = Boolean(row.verdictBefore?.startsWith("EVIDENZA") && !row.verdictAfter.startsWith("EVIDENZA"));
    }
    for (const row of rows.filter((candidate) => candidate.familyId === family.id && !candidate.evaluable)) {
      row.verdictAfter = "NON_VALUTABILE";
    }
  }

  const assessments = rows.map(({ pairAssessment: _pairAssessment, scenarioReport: _scenarioReport, ...row }) => row);
  const summary: HardeningSummary = {
    schema: HARDENING_SCHEMA,
    families,
    assessments,
    lostSignificanceCount: assessments.filter((row) => row.lostSignificance).length,
    nonEvaluableCount: assessments.filter((row) => !row.evaluable).length,
    note: "Le ipotesi primarie usano Holm FWER; la famiglia esplorativa usa BH FDR con BY come sensibilità. I blocchi non sono repliche indipendenti. La significatività resta separata dalla direzione e la causalità resta NON_IDENTIFICABILE.",
  };

  const reports = inputs.map(({ block, report }) => {
    const clone = JSON.parse(JSON.stringify(report)) as HardenedReport;
    const blockAssessments = assessments.filter((row) => row.block === block);
    const byKey = new Map(blockAssessments.map((row) => [`${row.scenario}|${row.pairId}`, row]));
    for (const scenario of clone.byScenario) {
      for (const [pairId, pairAssessment] of Object.entries(scenario.sequencingByPair ?? {})) {
        const row = byKey.get(`${scenario.scenario}|${pairId}`);
        if (!row) continue;
        const statistical = pairAssessment.statistical as typeof pairAssessment.statistical & {
          rawP: number | null;
          adjustedP: number | null;
          byAdjustedP: number | null;
          adjustmentMethod: AdjustmentMethod;
          familyId: string;
          verdictBefore: SequencingVerdict | null;
          verdictAfter: SequencingVerdict | null;
        };
        statistical.rawP = row.rawP;
        statistical.adjustedP = row.adjustedP;
        statistical.byAdjustedP = row.byAdjustedP;
        statistical.adjustmentMethod = row.method;
        statistical.familyId = row.familyId;
        statistical.verdictBefore = row.verdictBefore;
        statistical.verdictAfter = row.verdictAfter;
        pairAssessment.sequencing.verdict = row.verdictAfter ?? pairAssessment.sequencing.verdict;
        pairAssessment.rationale = `${pairAssessment.rationale} Correzione ${row.method} nella famiglia ${row.familyId}: p grezzo=${row.rawP}, p aggiustato=${row.adjustedP}; verdict prima=${row.verdictBefore}, dopo=${row.verdictAfter}.`;
      }
    }
    clone.inferenceHardening = {
      block,
      schema: HARDENING_SCHEMA,
      families,
      assessments: blockAssessments,
    };
    return clone;
  });
  return { reports, summary };
}

/** Riduce i dettagli per-surrogato nei report biologici mantenendo tutti i conteggi e i motivi. */
export function compactQualityForReport(test: HardenedSurrogateNullTest): HardenedSurrogateNullTest {
  return {
    ...test,
    quality: {
      ...test.quality,
      surrogates: [],
    },
  };
}
