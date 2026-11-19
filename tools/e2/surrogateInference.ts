/**
 * E2.2 — inferenza con surrogati temporali.
 *
 * Metodo scelto: IAAFT (iterative amplitude-adjusted Fourier transform) sui
 * residui di un detrendimento lineare. Rispetto a un test che tratta i tick
 * come indipendenti, IAAFT conserva approssimativamente lo spettro di
 * ampiezza (quindi l'autocorrelazione) e, per costruzione, la distribuzione
 * empirica dei valori. Fasi indipendenti per le due serie distruggono ogni
 * dipendenza cross-serie, fornendo un nullo per la sequenzialità osservata.
 *
 * Limiti: presuppone stazionarietà dei residui dopo detrendimento lineare;
 * conserva la struttura lineare di second'ordine, non dipendenze non lineari;
 * la cross-dipendenza è rimossa per costruzione (nullo "sharp"). La
 * significatività non implica causalità.
 */
import { summarize, type NumericSummary } from "../e1/statistics";
import { exactAmplitudeSpectrum, exactIfftReal, exactTransform, type Complex } from "./fourier";
import {
  bestCrossCorrelation,
  crossCorrelation,
  detrendLinear,
  lag1Autocorrelation,
  linearTrend,
  type Point,
} from "./timeseries";

export interface SurrogateConfig {
  enabled: boolean;
  /** Numero di surrogati per seed e per coppia. */
  surrogates: number;
  /** Iterazioni IAAFT per surrogato. */
  iterations: number;
  /** Seed base della procedura; viene derivato per coppia e corsa. */
  seed: number;
  /** Soglia di significatività per la combinazione cross-seed. */
  alpha: number;
  /** Minimo assoluto di osservazioni sovrapposte. */
  minOverlappingObservations: number;
  /** Limita i test statistici alle coppie elencate; vuoto = tutte. */
  pairIds: string[];
}

export const DEFAULT_SURROGATE_CONFIG: SurrogateConfig = {
  enabled: true,
  surrogates: 199,
  iterations: 12,
  seed: 0x5eed1234,
  alpha: 0.05,
  minOverlappingObservations: 30,
  pairIds: [],
};

export const DISABLED_SURROGATE_CONFIG: SurrogateConfig = {
  ...DEFAULT_SURROGATE_CONFIG,
  enabled: false,
};

/**
 * Criterio di convergenza IAAFT: dopo ogni rank-remapping si calcola
 * l'errore spettrale normalizzato
 * `sqrt(Σ(|FFT(surrogato)|−|FFT(serie)|)² / Σ|FFT(serie)|²)`.
 * Il surrogato si ferma quando l'errore è <= `IAAFT_AMPLITUDE_TOLERANCE`;
 * altrimenti esegue tutte le iterazioni richieste. Il numero effettivo di
 * iterazioni e l'errore finale sono registrati nei risultati.
 */
export const IAAFT_AMPLITUDE_TOLERANCE = 1e-3;

/** Lag minimi richiesti per la QA, più un lag lungo proporzionale a N. */
export const QA_BASE_AUTOCORRELATION_LAGS = [1, 2, 3, 5, 10, 20] as const;

export function qaAutocorrelationLags(length: number): number[] {
  return QA_BASE_AUTOCORRELATION_LAGS.filter((lag) => lag < length - 1) as number[];
}

/** Autocorrelazione normalizzata con lo stesso denominatore simmetrico del lag-1. */
export function autocorrelationAtLag(values: number[], lag: number): number | null {
  if (!Number.isInteger(lag) || lag < 1 || lag >= values.length) return null;
  if (!values.every(Number.isFinite)) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let currentSquares = 0;
  let laggedSquares = 0;
  for (let index = lag; index < values.length; index++) {
    const current = values[index] - average;
    const lagged = values[index - lag] - average;
    numerator += current * lagged;
    currentSquares += current * current;
    laggedSquares += lagged * lagged;
  }
  const denominator = Math.sqrt(currentSquares * laggedSquares);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  return Math.max(-1, Math.min(1, numerator / denominator));
}

export interface IAAFTSurrogateQaRecord {
  index: number;
  n: number;
  iterations: number;
  converged: boolean;
  finalSpectralError: number;
  bestSpectralError: number;
  finite: boolean;
  exactLength: boolean;
  empiricalDistributionPreserved: boolean;
  maximumSortedDeviation: number;
  numericValid: boolean;
  invalidationReasons: string[];
  autocorrelations: Array<{
    lag: number;
    observed: number | null;
    surrogate: number | null;
    absoluteError: number | null;
  }>;
}

export interface IAAFTQaOptions {
  autocorrelationLags?: number[];
  distributionTolerance?: number;
  /** false mantiene il comportamento storico (throw); true registra il surrogato come invalido. */
  allowInvalidSurrogates?: boolean;
}

export interface IAAFTConvergenceSummary {
  criterion: string;
  tolerance: number;
  maxIterations: number;
  iterations: { min: number; mean: number; max: number };
  finalRelativeSpectralError: { mean: number; max: number };
  bestRelativeSpectralError: { mean: number; max: number };
  convergedSurrogates: number;
  totalSurrogates: number;
}

export interface IAAFTSurrogateResult {
  surrogates: number[][];
  convergence: IAAFTConvergenceSummary;
  /** Metadati QA per singolo surrogato; nessun surrogato viene scartato qui. */
  qa: IAAFTSurrogateQaRecord[];
}

export interface SurrogateNullTest {
  method: "IAAFT";
  pairId: string;
  seed: number;
  maxLag: number;
  rngSeed: number;
  surrogates: number;
  iterations: number;
  alpha: number;
  minOverlappingObservations: number;
  lagsAttempted: number;
  lagsAccepted: number;
  observedCorrelation: number | null;
  observedLag: number | null;
  observedMaxAbs: number | null;
  nullMaxAbs: NumericSummary;
  /** Criterio, tolleranza e numero effettivo di iterazioni dell'IAAFT a lunghezza esatta. */
  convergence: IAAFTConvergenceSummary;
  /** p = (1 + #{nullMaxAbs >= observedMaxAbs}) / (B + 1): corretto per la ricerca su tutti i lag. */
  pValue: number;
  significantWithinRun: boolean;
  properties: {
    originalTrendR2: { a: number | null; b: number | null };
    residualTrendR2: { a: number | null; b: number | null };
    surrogateResidualTrendR2: { mean: number; max: number };
    lag1Autocorrelation: {
      observedA: number | null;
      observedB: number | null;
      surrogateMeanA: number | null;
      surrogateMeanB: number | null;
      absoluteErrorA: number | null;
      absoluteErrorB: number | null;
    };
    valueDistribution: {
      preservedByRankRemapping: boolean;
      maximumSortedDeviation: number;
    };
  };
  note: string;
}

export interface CombinedSurrogateEvidence {
  method: "Fisher";
  tests: number;
  fisherP: number;
  significant: boolean;
  alpha: number;
  minPValue: number;
  note: string;
}

const round = (value: number, digits = 6): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * Arrotonda mantenendo cifre significative: un p-value combinato può essere
 * molto minore di 1e-6 e un arrotondamento decimale fisso lo convertirebbe in 0.
 */
export const roundProbability = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  const clamped = Math.max(0, Math.min(1, value));
  if (clamped === 0 || clamped === 1 || clamped < 1e-300) return clamped;
  const magnitude = Math.floor(Math.log10(clamped));
  const factor = 10 ** (5 - magnitude);
  return Math.round(clamped * factor) / factor;
};

/** PRNG deterministico: lo stesso seed riproduce esattamente i surrogati. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const hashText = (text: string): number => {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const deriveSurrogateSeed = (base: number, pairId: string, seed: number, salt: number): number =>
  (hashText(`${pairId}|${seed}|${salt}`) ^ (base >>> 0)) >>> 0;

/** Soglia E2.2: almeno 30 campioni e almeno il 25% della serie più corta. */
export function minimumOverlapFor(seriesA: Point[], seriesB: Point[], requested: number): number {
  const shortest = Math.min(seriesA.length, seriesB.length);
  return Math.max(
    Math.max(3, Math.floor(requested)),
    Math.ceil(shortest * 0.25),
  );
}

/**
 * Genera surrogati IAAFT alla lunghezza esatta e registra la convergenza.
 *
 * Lo spettro di ampiezza target è quello della serie originale; ogni
 * iterazione usa la DFT esatta su N campioni, conserva le fasi, applica
 * l'anti-trasformata esatta e riordina i valori secondo la distribuzione
 * empirica originale. Non esiste padding, troncamento o cambio di lunghezza.
 */
export function iaaftSurrogatesDetailed(
  values: number[],
  count: number,
  rng: () => number,
  iterations = DEFAULT_SURROGATE_CONFIG.iterations,
  qaOptions: IAAFTQaOptions = {},
): IAAFTSurrogateResult {
  const n = values.length;
  const maxIterations = Math.max(1, Math.floor(iterations));
  const qaLags = qaOptions.autocorrelationLags ?? qaAutocorrelationLags(n);
  const distributionTolerance = qaOptions.distributionTolerance ?? 1e-9;
  const allowInvalid = qaOptions.allowInvalidSurrogates ?? false;
  const emptyConvergence = (): IAAFTConvergenceSummary => ({
    criterion: "relative amplitude-spectrum error after rank remapping",
    tolerance: IAAFT_AMPLITUDE_TOLERANCE,
    maxIterations,
    iterations: { min: 0, mean: 0, max: 0 },
    finalRelativeSpectralError: { mean: 0, max: 0 },
    bestRelativeSpectralError: { mean: 0, max: 0 },
    convergedSurrogates: 0,
    totalSurrogates: 0,
  });
  const invalidAutocorrelations = qaLags.map((lag) => ({
    lag, observed: null, surrogate: null, absoluteError: null,
  }));
  const invalidRecords = (reason: string): IAAFTSurrogateQaRecord[] =>
    Array.from({ length: Math.max(0, Math.floor(count)) }, (_, index) => ({
      index,
      n,
      iterations: 0,
      converged: false,
      finalSpectralError: Number.POSITIVE_INFINITY,
      bestSpectralError: Number.POSITIVE_INFINITY,
      finite: false,
      exactLength: false,
      empiricalDistributionPreserved: false,
      maximumSortedDeviation: Number.POSITIVE_INFINITY,
      numericValid: false,
      invalidationReasons: [reason],
      autocorrelations: invalidAutocorrelations,
    }));
  if (count <= 0 || n < 4) return { surrogates: [], convergence: emptyConvergence(), qa: [] };
  if (!values.every((value) => Number.isFinite(value))) {
    if (!allowInvalid) throw new Error("IAAFT requires finite input values");
    return { surrogates: [], convergence: emptyConvergence(), qa: invalidRecords("non-finite input") };
  }

  const targetAmplitude = exactAmplitudeSpectrum(values);
  const targetEnergy = targetAmplitude.reduce((sum, value) => sum + value * value, 0);
  const sorted = [...values].sort((a, b) => a - b);
  const allEqual = sorted.every((value) => value === sorted[0]);
  const observedAutocorrelation = new Map(qaLags.map((lag) => [lag, autocorrelationAtLag(values, lag)]));
  const sortedDeviationForQa = (candidate: number[]): number => {
    const candidateSorted = [...candidate].sort((a, b) => a - b);
    return sorted.reduce((maximum, value, index) =>
      Math.max(maximum, Math.abs(value - candidateSorted[index])), 0);
  };

  /** Errore calcolato dallo spettro già disponibile, senza una seconda DFT. */
  const relativeSpectralError = (spectrum: Complex[]): number => {
    if (targetEnergy === 0) return 0;
    let errorEnergy = 0;
    for (let index = 0; index < n; index++) {
      const delta = Math.hypot(spectrum[index].re, spectrum[index].im) - targetAmplitude[index];
      errorEnergy += delta * delta;
    }
    return Math.sqrt(errorEnergy / targetEnergy);
  };

  /** Riordina sempre esattamente N valori: nessun taglio della ricostruzione. */
  const remapRanks = (series: number[]): number[] => {
    const order = series.map((_, index) => index).sort((a, b) => series[a] - series[b] || a - b);
    const result = new Array<number>(n);
    for (let rank = 0; rank < n; rank++) result[order[rank]] = sorted[rank];
    return result;
  };

  const surrogates: number[][] = [];
  const qa: IAAFTSurrogateQaRecord[] = [];
  const usedIterations: number[] = [];
  const finalErrors: number[] = [];
  const bestErrors: number[] = [];
  let convergedSurrogates = 0;

  const recordQa = (
    surrogate: number[],
    used: number,
    finalError: number,
    bestError: number,
    converged: boolean,
    extraReasons: string[] = [],
  ): void => {
    const exactLength = surrogate.length === n;
    const finite = exactLength && surrogate.every((value) => Number.isFinite(value));
    const maximumSortedDeviation = finite ? sortedDeviationForQa(surrogate) : Number.POSITIVE_INFINITY;
    const empiricalDistributionPreserved = finite && maximumSortedDeviation <= distributionTolerance;
    const reasons = [...extraReasons];
    if (!finite) reasons.push(exactLength ? "non-finite surrogate" : "length mismatch");
    if (!empiricalDistributionPreserved) reasons.push("empirical distribution not preserved");
    qa.push({
      index: surrogates.length,
      n,
      iterations: used,
      converged,
      finalSpectralError: finalError,
      bestSpectralError: bestError,
      finite,
      exactLength,
      empiricalDistributionPreserved,
      maximumSortedDeviation,
      numericValid: finite && empiricalDistributionPreserved,
      invalidationReasons: reasons,
      autocorrelations: qaLags.map((lag) => {
        const observed = observedAutocorrelation.get(lag) ?? null;
        const candidate = finite ? autocorrelationAtLag(surrogate, lag) : null;
        return {
          lag,
          observed,
          surrogate: candidate,
          absoluteError: observed === null || candidate === null ? null : Math.abs(observed - candidate),
        };
      }),
    });
  };

  for (let replicate = 0; replicate < count; replicate++) {
    const shuffled = [...values];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (allEqual) {
      surrogates.push(shuffled);
      recordQa(shuffled, 0, 0, 0, true);
      usedIterations.push(0);
      finalErrors.push(0);
      bestErrors.push(0);
      convergedSurrogates++;
      continue;
    }

    let current = shuffled;
    let spectrum = exactTransform(current);
    let used = maxIterations;
    let finalError = Number.POSITIVE_INFINITY;
    let bestError = Number.POSITIVE_INFINITY;
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const shaped = spectrum.map((value, index) => {
        const magnitude = Math.hypot(value.re, value.im);
        const phase = magnitude === 0 ? 0 : Math.atan2(value.im, value.re);
        return {
          re: targetAmplitude[index] * Math.cos(phase),
          im: targetAmplitude[index] * Math.sin(phase),
        };
      });
      current = remapRanks(exactIfftReal(shaped));
      spectrum = exactTransform(current);
      finalError = relativeSpectralError(spectrum);
      bestError = Math.min(bestError, finalError);
      if (finalError <= IAAFT_AMPLITUDE_TOLERANCE) {
        used = iteration;
        convergedSurrogates++;
        break;
      }
    }
    const nonFinite = !current.every((value) => Number.isFinite(value));
    if (nonFinite && !allowInvalid) throw new Error("IAAFT produced a non-finite surrogate");
    surrogates.push(current);
    recordQa(current, used, finalError, bestError, finalError <= IAAFT_AMPLITUDE_TOLERANCE,
      nonFinite ? ["non-finite surrogate"] : []);
    usedIterations.push(used);
    finalErrors.push(finalError);
    bestErrors.push(bestError);
  }

  const average = (entries: number[]): number =>
    entries.length === 0 ? 0 : entries.reduce((sum, value) => sum + value, 0) / entries.length;
  return {
    surrogates,
    convergence: {
      criterion: "relative amplitude-spectrum error after rank remapping",
      tolerance: IAAFT_AMPLITUDE_TOLERANCE,
      maxIterations,
      iterations: {
        min: usedIterations.length ? Math.min(...usedIterations) : 0,
        mean: average(usedIterations),
        max: usedIterations.length ? Math.max(...usedIterations) : 0,
      },
      finalRelativeSpectralError: {
        mean: average(finalErrors),
        max: finalErrors.length ? Math.max(...finalErrors) : 0,
      },
      bestRelativeSpectralError: {
        mean: average(bestErrors),
        max: bestErrors.length ? Math.max(...bestErrors) : 0,
      },
      convergedSurrogates,
      totalSurrogates: surrogates.length,
    },
    qa,
  };
}

/** Compatibilità con i chiamanti esistenti: restituisce solo i surrogati. */
export function iaaftSurrogates(
  values: number[],
  count: number,
  rng: () => number,
  iterations = DEFAULT_SURROGATE_CONFIG.iterations,
): number[][] {
  return iaaftSurrogatesDetailed(values, count, rng, iterations).surrogates;
}

const meanOrNull = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

const trendR2 = (points: Point[]): number | null => linearTrend(points).r2;

const sortedDeviation = (reference: number[], candidate: number[]): number => {
  const a = [...reference].sort((x, y) => x - y);
  const b = [...candidate].sort((x, y) => x - y);
  return a.reduce((maximum, value, index) => Math.max(maximum, Math.abs(value - b[index])), 0);
};

/** Null per una singola coppia/seed, con massimo statistico su tutti i lag accettati. */
export function runSurrogateNullTest(
  pairId: string,
  seed: number,
  a: Point[],
  b: Point[],
  maxLag: number,
  config: SurrogateConfig,
): SurrogateNullTest {
  const minimum = minimumOverlapFor(a, b, config.minOverlappingObservations);
  const detrendedA = detrendLinear(a);
  const detrendedB = detrendLinear(b);
  const observedCurve = crossCorrelation(detrendedA.residuals, detrendedB.residuals, maxLag, minimum);
  const observedPeak = bestCrossCorrelation(observedCurve);
  const observedMaxAbs = observedPeak?.correlation === null || observedPeak?.correlation === undefined
    ? null
    : Math.abs(observedPeak.correlation as number);

  const rngA = mulberry32(deriveSurrogateSeed(config.seed, pairId, seed, 1));
  const rngB = mulberry32(deriveSurrogateSeed(config.seed, pairId, seed, 2));
  const detailedA = iaaftSurrogatesDetailed(detrendedA.residuals.map((p) => p.value), config.surrogates, rngA, config.iterations);
  const detailedB = iaaftSurrogatesDetailed(detrendedB.residuals.map((p) => p.value), config.surrogates, rngB, config.iterations);
  const surrogatesA = detailedA.surrogates;
  const surrogatesB = detailedB.surrogates;
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

  const nullMaxima: number[] = [];
  const surrogateTrendR2: number[] = [];
  const surrogateAutocorrA: number[] = [];
  const surrogateAutocorrB: number[] = [];
  let maximumSortedDeviation = 0;
  for (let index = 0; index < Math.min(surrogatesA.length, surrogatesB.length); index++) {
    const surrogatePointsA = detrendedA.residuals.map((point, pointIndex) => ({
      tick: point.tick,
      value: surrogatesA[index][pointIndex],
    }));
    const surrogatePointsB = detrendedB.residuals.map((point, pointIndex) => ({
      tick: point.tick,
      value: surrogatesB[index][pointIndex],
    }));
    const peak = bestCrossCorrelation(crossCorrelation(surrogatePointsA, surrogatePointsB, maxLag, minimum));
    if (peak?.correlation !== null && peak?.correlation !== undefined) {
      nullMaxima.push(Math.abs(peak.correlation as number));
    }
    surrogateTrendR2.push(trendR2(surrogatePointsA.map((point, pointIndex) => ({
      tick: pointIndex,
      value: point.value,
    }))) ?? 0);
    const autocorrA = lag1Autocorrelation(surrogatesA[index]);
    const autocorrB = lag1Autocorrelation(surrogatesB[index]);
    if (autocorrA !== null) surrogateAutocorrA.push(autocorrA);
    if (autocorrB !== null) surrogateAutocorrB.push(autocorrB);
    maximumSortedDeviation = Math.max(
      maximumSortedDeviation,
      sortedDeviation(detrendedA.residuals.map((point) => point.value), surrogatesA[index]),
      sortedDeviation(detrendedB.residuals.map((point) => point.value), surrogatesB[index]),
    );
  }

  const hits = observedMaxAbs === null
    ? 0
    : nullMaxima.filter((value) => value >= observedMaxAbs).length;
  const pValue = observedMaxAbs === null ? 1 : (1 + hits) / (nullMaxima.length + 1);
  const observedAutocorrA = lag1Autocorrelation(detrendedA.residuals.map((point) => point.value));
  const observedAutocorrB = lag1Autocorrelation(detrendedB.residuals.map((point) => point.value));
  const meanAutocorrA = meanOrNull(surrogateAutocorrA);
  const meanAutocorrB = meanOrNull(surrogateAutocorrB);

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
    observedMaxAbs: observedMaxAbs === null ? null : round(observedMaxAbs),
    nullMaxAbs: summarize(nullMaxima),
    convergence,
    pValue: roundProbability(pValue),
    significantWithinRun: pValue < config.alpha,
    properties: {
      originalTrendR2: {
        a: trendR2(a),
        b: trendR2(b),
      },
      residualTrendR2: {
        a: trendR2(detrendedA.residuals),
        b: trendR2(detrendedB.residuals),
      },
      surrogateResidualTrendR2: {
        mean: round(meanOrNull(surrogateTrendR2) ?? 0),
        max: round(surrogateTrendR2.length ? Math.max(...surrogateTrendR2) : 0),
      },
      lag1Autocorrelation: {
        observedA: observedAutocorrA,
        observedB: observedAutocorrB,
        surrogateMeanA: meanAutocorrA === null ? null : round(meanAutocorrA),
        surrogateMeanB: meanAutocorrB === null ? null : round(meanAutocorrB),
        absoluteErrorA: observedAutocorrA === null || meanAutocorrA === null
          ? null
          : round(Math.abs(observedAutocorrA - meanAutocorrA)),
        absoluteErrorB: observedAutocorrB === null || meanAutocorrB === null
          ? null
          : round(Math.abs(observedAutocorrB - meanAutocorrB)),
      },
      valueDistribution: {
        preservedByRankRemapping: maximumSortedDeviation < 1e-6,
        maximumSortedDeviation: round(maximumSortedDeviation),
      },
    },
    note: "p two-sided del massimo |r| su tutti i lag accettati, con surrogati IAAFT a lunghezza esatta e fasi indipendenti per le due serie; non è una prova causale.",
  };
}

/** Survivor function di chi-quadro con df=2k: forma chiusa per k intero. */
export function chiSquareUpper(df: number, x: number): number {
  const k = df / 2;
  if (!Number.isInteger(k) || k <= 0) return 1;
  if (x <= 0) return 1;
  let term = 1;
  let sum = 1;
  for (let j = 1; j < k; j++) {
    term *= x / j;
    sum += term;
  }
  return Math.max(0, Math.min(1, Math.exp(-x + Math.log(sum))));
}

/** Combinazione di p-values indipendenti di seed/corse con metodo di Fisher. */
export function combineSurrogatePValues(pValues: number[], alpha = DEFAULT_SURROGATE_CONFIG.alpha): CombinedSurrogateEvidence {
  const finite = pValues.filter((value) => Number.isFinite(value) && value > 0 && value <= 1);
  if (finite.length === 0) {
    return {
      method: "Fisher",
      tests: 0,
      fisherP: 1,
      significant: false,
      alpha,
      minPValue: 1,
      note: "Nessun test surrogato valido: evidenza statistica non valutabile.",
    };
  }
  const statistic = -2 * finite.reduce((sum, value) => sum + Math.log(value), 0);
  const fisherP = chiSquareUpper(2 * finite.length, statistic);
  return {
    method: "Fisher",
    tests: finite.length,
    fisherP: roundProbability(fisherP),
    significant: fisherP < alpha,
    alpha,
    minPValue: roundProbability(Math.min(...finite)),
    note: "Fisher combina i p-values delle corse/seed (unità statistica); la direzione è valutata separatamente dal segno di r e del lag.",
  };
}
