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
import { amplitudeSpectrum, fft, ifftReal } from "./fourier";
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
 * Genera surrogati IAAFT: lo spettro di ampiezza target è quello dei valori
 * originali; il rank-remapping finale conserva esattamente la distribuzione.
 */
export function iaaftSurrogates(
  values: number[],
  count: number,
  rng: () => number,
  iterations = 12,
): number[][] {
  const n = values.length;
  if (count <= 0 || n < 4) return [];
  const targetAmplitude = amplitudeSpectrum(values);
  const sorted = [...values].sort((a, b) => a - b);
  const allEqual = sorted.every((value) => value === sorted[0]);

  const remapRanks = (series: number[]): number[] => {
    const truncated = series.slice(0, n);
    const order = truncated.map((_, index) => index).sort((a, b) => truncated[a] - truncated[b] || a - b);
    const result = new Array<number>(n);
    for (let rank = 0; rank < n; rank++) result[order[rank]] = sorted[rank];
    return result;
  };

  const surrogates: number[][] = [];
  for (let replicate = 0; replicate < count; replicate++) {
    const shuffled = [...values];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (allEqual) {
      surrogates.push(shuffled);
      continue;
    }
    let current = shuffled;
    for (let iteration = 0; iteration < Math.max(1, iterations); iteration++) {
      const spectrum = fft(current);
      const shaped = spectrum.map((value, index) => {
        const magnitude = Math.hypot(value.re, value.im);
        const phase = magnitude === 0 ? 0 : Math.atan2(value.im, value.re);
        return {
          re: targetAmplitude[index] * Math.cos(phase),
          im: targetAmplitude[index] * Math.sin(phase),
        };
      });
      current = remapRanks(ifftReal(shaped));
    }
    surrogates.push(current);
  }
  return surrogates;
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
  const surrogatesA = iaaftSurrogates(detrendedA.residuals.map((p) => p.value), config.surrogates, rngA, config.iterations);
  const surrogatesB = iaaftSurrogates(detrendedB.residuals.map((p) => p.value), config.surrogates, rngB, config.iterations);

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
    note: "p two-sided del massimo |r| su tutti i lag accettati, con surrogati IAAFT indipendenti per le due serie; non è una prova causale.",
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
