/**
 * E2 — analisi additiva di serie temporali.
 *
 * E1 emette gia' campioni per tick (o alla cadenza richiesta), ma non calcola
 * autocorrelazione, trend, oscillazioni o tempi di recupero. Questo modulo
 * lavora solo sui `RunResult` di E1: non tocca il motore ne' le metriche E1.
 */
import type { E1Sample } from "../e1/metrics";
import type { RunResult } from "../e1/runner";
import { mean, sampleSd } from "../e1/statistics";
import { fft, ifftReal, nextPowerOfTwo } from "./fourier";

/** Campi numerici di un campione E1 utilizzabili come serie. */
export type NumericSampleField = {
  [K in keyof E1Sample]: E1Sample[K] extends number ? K : never;
}[keyof E1Sample];

export interface Point {
  tick: number;
  value: number;
}

export interface Trend {
  n: number;
  slope: number;
  intercept: number;
  r2: number | null;
}

export interface OscillationMetrics {
  n: number;
  min: number;
  max: number;
  minTick: number;
  maxTick: number;
  range: number;
  amplitude: number;
  directionChanges: number;
  peakCount: number;
  troughCount: number;
  meanPeakInterval: number | null;
}

export interface CrossCorrelationEntry {
  lag: number;
  pairs: number;
  correlation: number | null;
}

/**
 * Soglia minima storica di coppie sovrapposte. I report E2.2 usano una soglia
 * più severa (almeno 30 campioni e almeno il 25% della serie più corta), ma le
 * primitive restano compatibili con le serie sintetiche brevi.
 */
export const MIN_OVERLAPPING_OBSERVATIONS = 3;

/** Diagnostica esplicita della ricerca del massimo sui lag. */
export interface LagSearchDiagnostics {
  maxLagTicks: number;
  /** Passo della griglia di campionamento; 0 se la griglia non è regolare. */
  tickStep: number;
  /** Tutti i lag nominali `-maxLag..+maxLag`, inclusi quelli senza coppie. */
  lagsAttempted: number;
  /** Lag cadenti sulla griglia di campionamento (unici con coppie potenziali). */
  lagsOnGrid: number;
  /** Lag sulla griglia con zero coppie osservative. */
  lagsWithoutPairs: number;
  /** Lag con coppie ma sotto la soglia minima dichiarata. */
  lagsBelowMinimumOverlap: number;
  /** Lag con correlazione stimabile e accettata. */
  lagsAccepted: number;
  minimumOverlappingObservations: number;
  /** Minimo di coppie tra i lag con almeno una coppia. */
  minimumPairsOnGrid: number;
  maximumPairsObserved: number;
  /** Coppie ai lag estremi e frazione di coppie persa rispetto al picco. */
  extremeLagPairs: {
    negative: number;
    positive: number;
    lossFraction: number;
  };
}

export interface DetrendedSeries {
  original: Point[];
  trend: Trend;
  residuals: Point[];
}

export interface LagSensitivityEntry {
  lag: number;
  original: number | null;
  detrended: number | null;
  delta: number | null;
}

export interface CorrelationComparison {
  originalAtLagZero: number | null;
  detrendedAtLagZero: number | null;
  deltaAtLagZero: number | null;
  originalPeak: CrossCorrelationEntry | null;
  detrendedPeak: CrossCorrelationEntry | null;
  lagSensitivity: LagSensitivityEntry[];
  lagSearch: LagSearchDiagnostics;
  commonTrendDetected: boolean;
  spuriousTrendRisk: boolean;
}

export interface ReturnTime {
  baseline: number;
  tolerance: number;
  returnTick: number | null;
  returnValue: number | null;
  checkedFromTick: number;
}

const round = (value: number, digits = 6): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Estrae una serie ordinata per tick da un risultato E1. */
export function sampleSeries(result: RunResult, field: NumericSampleField): Point[] {
  return result.samples
    .map((sample) => ({ tick: sample.tick, value: sample[field] as number }))
    .filter((point) => Number.isFinite(point.value))
    .sort((a, b) => a.tick - b.tick);
}

/** Media di una serie, a partire dai punti. */
export function seriesMean(points: Point[]): number | null {
  if (points.length === 0) return null;
  return mean(points.map((p) => p.value));
}

/** Deviazione standard campionaria di una serie. */
export function seriesSd(points: Point[]): number | null {
  if (points.length < 2) return null;
  return sampleSd(points.map((p) => p.value));
}

/**
 * Autocorrelazione lag-1. `null` se la serie e' troppo corta o costante.
 *
 * Il denominatore usa la radice delle due somme dei quadrati (ossia le parti
 * "corrente" e "precedente" della stessa serie): per il Cauchy-Schwarz il
 * risultato resta sempre in [-1, 1], anche in presenza di trend. Usare solo
 * la somma dei quadrati correnti produrrebbe valori > 1 e non interpretabili.
 */
export function lag1Autocorrelation(values: number[]): number | null {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 3) return null;
  const m = mean(finite);
  let numerator = 0;
  let currentSquares = 0;
  let previousSquares = 0;
  for (let i = 1; i < finite.length; i++) {
    const previous = finite[i - 1] - m;
    const current = finite[i] - m;
    numerator += current * previous;
    currentSquares += current * current;
    previousSquares += previous * previous;
  }
  const denominator = Math.sqrt(currentSquares * previousSquares);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  return round(numerator / denominator);
}

/** Regressione lineare dei valori rispetto al tick. */
export function linearTrend(points: Point[]): Trend {
  if (points.length < 2) return { n: points.length, slope: 0, intercept: 0, r2: null };
  const xs = points.map((p) => p.tick);
  const ys = points.map((p) => p.value);
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < points.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return { n: points.length, slope: 0, intercept: my, r2: null };
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let ssRes = 0;
  for (let i = 0; i < points.length; i++) {
    const residual = ys[i] - (intercept + slope * xs[i]);
    ssRes += residual * residual;
  }
  const r2 = syy === 0 ? null : round(1 - ssRes / syy);
  return { n: points.length, slope: round(slope), intercept: round(intercept), r2 };
}

/**
 * Rimuove una tendenza lineare e restituisce i residui sugli stessi tick.
 * I residui sono serie additive: non modificano la fonte E1 ne' i dati grezzi.
 */
export function detrendLinear(points: Point[]): DetrendedSeries {
  const trend = linearTrend(points);
  const residuals = points.map((point) => ({
    tick: point.tick,
    value: round(point.value - (trend.intercept + trend.slope * point.tick)),
  }));
  return { original: points, trend, residuals };
}

/** Correlazione di Pearson sui tick presenti in entrambe le serie. */
export function pearsonCorrelation(a: Point[], b: Point[]): number | null {
  const bByTick = new Map(b.map((p) => [p.tick, p.value]));
  const pairs: Array<[number, number]> = [];
  for (const point of a) {
    const other = bByTick.get(point.tick);
    if (other !== undefined && Number.isFinite(point.value) && Number.isFinite(other)) {
      pairs.push([point.value, other]);
    }
  }
  if (pairs.length < 3) return null;
  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < pairs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? round(sxy / Math.sqrt(sxx * syy)) : null;
}

/** Cross-correlazione calcolata sui residui di due serie detrendizzate. */
export function detrendedCrossCorrelation(
  a: Point[],
  b: Point[],
  maxLag: number,
  minOverlappingObservations = MIN_OVERLAPPING_OBSERVATIONS,
): CrossCorrelationEntry[] {
  return crossCorrelation(detrendLinear(a).residuals, detrendLinear(b).residuals, maxLag, minOverlappingObservations);
}

const isNonZeroFinite = (value: number): boolean => Number.isFinite(value) && value !== 0;

/**
 * Confronta correlazioni originali e detrendizzate su piu' lag.
 *
 * `spuriousTrendRisk` e' un'euristica descrittiva: trend lineari forti e
 * concordi, correlazione originale alta e correlazione residua debole o
 * assente. Non dimostra casualita' ne' assenza di relazione.
 */
export function compareCrossCorrelations(
  a: Point[],
  b: Point[],
  maxLag: number,
  minOverlappingObservations = MIN_OVERLAPPING_OBSERVATIONS,
): CorrelationComparison {
  const original = crossCorrelation(a, b, maxLag, minOverlappingObservations);
  const detrended = detrendedCrossCorrelation(a, b, maxLag, minOverlappingObservations);
  const detrendedByLag = new Map(detrended.map((entry) => [entry.lag, entry.correlation]));

  const lagSensitivity = original.map((entry) => {
    const detrendedCorrelation = detrendedByLag.get(entry.lag) ?? null;
    const delta = entry.correlation !== null && detrendedCorrelation !== null
      ? round(detrendedCorrelation - entry.correlation)
      : null;
    return {
      lag: entry.lag,
      original: entry.correlation,
      detrended: detrendedCorrelation,
      delta,
    };
  });

  const trendA = linearTrend(a);
  const trendB = linearTrend(b);
  const commonTrendDetected = trendA.r2 !== null
    && trendB.r2 !== null
    && trendA.r2 >= 0.5
    && trendB.r2 >= 0.5
    && isNonZeroFinite(trendA.slope)
    && isNonZeroFinite(trendB.slope)
    && Math.sign(trendA.slope) === Math.sign(trendB.slope);

  const originalAtLagZero = original.find((entry) => entry.lag === 0)?.correlation ?? null;
  const detrendedAtLagZero = detrended.find((entry) => entry.lag === 0)?.correlation ?? null;
  const strongOriginal = originalAtLagZero !== null && Math.abs(originalAtLagZero) >= 0.8;
  const weakDetrended = detrendedAtLagZero === null || Math.abs(detrendedAtLagZero) <= 0.3;
  const spuriousTrendRisk = commonTrendDetected && strongOriginal && weakDetrended;

  return {
    originalAtLagZero,
    detrendedAtLagZero,
    deltaAtLagZero: originalAtLagZero !== null && detrendedAtLagZero !== null
      ? round(detrendedAtLagZero - originalAtLagZero)
      : null,
    originalPeak: bestCrossCorrelation(original),
    detrendedPeak: bestCrossCorrelation(detrended),
    lagSensitivity,
    lagSearch: original.lagSearch,
    commonTrendDetected,
    spuriousTrendRisk,
  };
}

/**
 * Metriche di oscillazione. I picchi e i minimi sono contati solo se superano
 * una frazione `prominenceFraction` dell'escursazione globale, per evitare di
 * interpretare il rumore come ciclo.
 */
export function oscillationMetrics(
  points: Point[],
  prominenceFraction = 0.1,
): OscillationMetrics {
  if (points.length === 0) {
    return {
      n: 0, min: 0, max: 0, minTick: 0, maxTick: 0, range: 0, amplitude: 0,
      directionChanges: 0, peakCount: 0, troughCount: 0, meanPeakInterval: null,
    };
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const minIndex = values.indexOf(min);
  const maxIndex = values.indexOf(max);
  const range = max - min;
  const prominence = range * Math.max(0, Math.min(1, prominenceFraction));

  let directionChanges = 0;
  let lastDirection = 0;
  for (let i = 1; i < values.length; i++) {
    const direction = Math.sign(values[i] - values[i - 1]);
    if (direction === 0) continue;
    if (lastDirection !== 0 && direction !== lastDirection) directionChanges++;
    lastDirection = direction;
  }

  const peakTicks: number[] = [];
  const troughTicks: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const v = values[i];
    if (v >= values[i - 1] && v >= values[i + 1] && v - min >= prominence) peakTicks.push(points[i].tick);
    if (v <= values[i - 1] && v <= values[i + 1] && max - v >= prominence) troughTicks.push(points[i].tick);
  }
  const peakIntervals = peakTicks.slice(1).map((tick, i) => tick - peakTicks[i]);

  return {
    n: points.length,
    min: round(min),
    max: round(max),
    minTick: points[minIndex].tick,
    maxTick: points[maxIndex].tick,
    range: round(range),
    amplitude: round(range / 2),
    directionChanges,
    peakCount: peakTicks.length,
    troughCount: troughTicks.length,
    meanPeakInterval: peakIntervals.length ? round(mean(peakIntervals)) : null,
  };
}

/** Passo della griglia solo se tutti i tick di una serie sono regolari. */
const regularStep = (points: Point[]): number | null => {
  if (points.length < 2) return null;
  const step = points[1].tick - points[0].tick;
  if (!Number.isInteger(step) || step <= 0) return null;
  for (let i = 2; i < points.length; i++) {
    if (points[i].tick - points[i - 1].tick !== step) return null;
  }
  return step;
};

const cumulative = (values: Float64Array): Float64Array => {
  const result = new Float64Array(values.length + 1);
  for (let i = 0; i < values.length; i++) result[i + 1] = result[i] + values[i];
  return result;
};

const segmentSum = (prefix: Float64Array, from: number, to: number): number =>
  prefix[to] - prefix[from];

const correlationFromSums = (
  pairs: number,
  sumX: number,
  sumY: number,
  sumXX: number,
  sumYY: number,
  sumXY: number,
): number | null => {
  if (pairs < MIN_OVERLAPPING_OBSERVATIONS) return null;
  const centeredXX = sumXX - (sumX * sumX) / pairs;
  const centeredYY = sumYY - (sumY * sumY) / pairs;
  if (centeredXX <= 0 || centeredYY <= 0) return null;
  const centeredXY = sumXY - (sumX * sumY) / pairs;
  const raw = centeredXY / Math.sqrt(centeredXX * centeredYY);
  return round(Math.max(-1, Math.min(1, raw)));
};

const lagSearchFromEntries = (
  entries: CrossCorrelationEntry[],
  maxLagTicks: number,
  tickStep: number,
  minimumOverlappingObservations: number,
): LagSearchDiagnostics => {
  const withPairs = entries.filter((entry) => entry.pairs > 0);
  const onGrid = tickStep > 0 ? entries.filter((entry) => entry.lag % tickStep === 0) : [];
  const onGridWithPairs = onGrid.filter((entry) => entry.pairs > 0);
  const pairCounts = withPairs.map((entry) => entry.pairs);
  const maximumPairsObserved = pairCounts.length ? Math.max(...pairCounts) : 0;
  const extremeLag = tickStep > 0 ? Math.floor(maxLagTicks / tickStep) * tickStep : maxLagTicks;
  const negative = entries.find((entry) => entry.lag === -extremeLag)?.pairs ?? 0;
  const positive = entries.find((entry) => entry.lag === extremeLag)?.pairs ?? 0;
  const lossFraction = maximumPairsObserved > 0
    ? Math.max(0, Math.min(1, 1 - Math.min(negative, positive) / maximumPairsObserved))
    : 0;
  return {
    maxLagTicks,
    tickStep,
    lagsAttempted: entries.length,
    lagsOnGrid: tickStep > 0 ? onGrid.length : 0,
    lagsWithoutPairs: entries.length - withPairs.length,
    lagsBelowMinimumOverlap: (tickStep > 0 ? onGridWithPairs : withPairs)
      .filter((entry) => entry.pairs < minimumOverlappingObservations).length,
    lagsAccepted: entries.filter((entry) => entry.correlation !== null).length,
    minimumOverlappingObservations,
    minimumPairsOnGrid: pairCounts.length ? Math.min(...pairCounts) : 0,
    maximumPairsObserved,
    extremeLagPairs: {
      negative,
      positive,
      lossFraction: round(lossFraction),
    },
  };
};

/**
 * Correlazione incrociata per lag interi sui tick. Un lag positivo significa
 * che `b` e' osservato `lag` tick DOPO `a`; cioe' `corr(a[t], b[t+lag])`.
 */
export function crossCorrelation(
  a: Point[],
  b: Point[],
  maxLag: number,
  minOverlappingObservations = MIN_OVERLAPPING_OBSERVATIONS,
): CrossCorrelationEntry[] & { lagSearch: LagSearchDiagnostics } {
  const limit = Math.max(0, Math.floor(maxLag));
  const minimum = Math.max(MIN_OVERLAPPING_OBSERVATIONS, Math.floor(minOverlappingObservations));
  const sortedA = [...a].sort((x, y) => x.tick - y.tick);
  const sortedB = [...b].sort((x, y) => x.tick - y.tick);
  const stepA = regularStep(sortedA);
  const stepB = regularStep(sortedB);
  const tickStep = stepA !== null && stepA === stepB ? stepA : 0;

  const withDiagnostics = (entries: CrossCorrelationEntry[]): CrossCorrelationEntry[] & { lagSearch: LagSearchDiagnostics } =>
    Object.assign(entries, { lagSearch: lagSearchFromEntries(entries, limit, tickStep, minimum) });

  const emptyResult = (): CrossCorrelationEntry[] & { lagSearch: LagSearchDiagnostics } => {
    const entries: CrossCorrelationEntry[] = [];
    for (let lag = -limit; lag <= limit; lag++) entries.push({ lag, pairs: 0, correlation: null });
    return withDiagnostics(entries);
  };
  if (sortedA.length === 0 || sortedB.length === 0) return emptyResult();

  const canUseGrid = tickStep > 0
    && limit / tickStep <= Math.min(sortedA.length, sortedB.length) - 1;
  if (!canUseGrid) {
    const bByTick = new Map(sortedB.map((p) => [p.tick, p.value]));
    const entries: CrossCorrelationEntry[] = [];
    for (let lag = -limit; lag <= limit; lag++) {
      const pairs: Array<[number, number]> = [];
      for (const point of sortedA) {
        const other = bByTick.get(point.tick + lag);
        if (other !== undefined && Number.isFinite(other)) pairs.push([point.value, other]);
      }
      if (pairs.length < minimum) {
        entries.push({ lag, pairs: pairs.length, correlation: null });
        continue;
      }
      const xs = pairs.map((p) => p[0]);
      const ys = pairs.map((p) => p[1]);
      const mx = mean(xs);
      const my = mean(ys);
      let sxy = 0;
      let sxx = 0;
      let syy = 0;
      for (let i = 0; i < pairs.length; i++) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        sxy += dx * dy;
        sxx += dx * dx;
        syy += dy * dy;
      }
      const sumX = mx * pairs.length;
      const sumY = my * pairs.length;
      entries.push({
        lag,
        pairs: pairs.length,
        correlation: correlationFromSums(
          pairs.length,
          sumX,
          sumY,
          sxx + sumX * mx,
          syy + sumY * my,
          sxy + sumX * my,
        ),
      });
    }
    return withDiagnostics(entries);
  }

  const origin = Math.min(sortedA[0].tick, sortedB[0].tick);
  const positionsRegular = [...sortedA, ...sortedB].every((point) =>
    Number.isInteger((point.tick - origin) / tickStep));
  if (!positionsRegular) {
    const bByTick = new Map(sortedB.map((p) => [p.tick, p.value]));
    const entries: CrossCorrelationEntry[] = [];
    for (let lag = -limit; lag <= limit; lag++) {
      const pairs: Array<[number, number]> = [];
      for (const point of sortedA) {
        const other = bByTick.get(point.tick + lag);
        if (other !== undefined && Number.isFinite(other)) pairs.push([point.value, other]);
      }
      const xs = pairs.map((p) => p[0]);
      const ys = pairs.map((p) => p[1]);
      const mx = xs.length ? mean(xs) : 0;
      const my = ys.length ? mean(ys) : 0;
      let sxy = 0;
      let sxx = 0;
      let syy = 0;
      for (let i = 0; i < pairs.length; i++) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        sxy += dx * dy;
        sxx += dx * dx;
        syy += dy * dy;
      }
      const sumX = mx * pairs.length;
      const sumY = my * pairs.length;
      entries.push({
        lag,
        pairs: pairs.length,
        correlation: pairs.length < minimum
          ? null
          : correlationFromSums(pairs.length, sumX, sumY, sxx + sumX * mx, syy + sumY * my, sxy + sumX * my),
      });
    }
    return withDiagnostics(entries);
  }

  const span = Math.floor((Math.max(sortedA.at(-1)!.tick, sortedB.at(-1)!.tick) - origin) / tickStep) + 1;
  const va = new Float64Array(span);
  const vb = new Float64Array(span);
  for (const point of sortedA) va[(point.tick - origin) / tickStep] = point.value;
  for (const point of sortedB) vb[(point.tick - origin) / tickStep] = point.value;
  const prefixA = cumulative(va);
  const prefixAA = cumulative(va.map((value) => value * value));
  const prefixB = cumulative(vb);
  const prefixBB = cumulative(vb.map((value) => value * value));

  const nfft = nextPowerOfTwo(2 * span + 2);
  const paddedA = Array.from({ length: nfft }, (_, index) => (index < span ? va[index] : 0));
  const reversedB = Array.from({ length: nfft }, (_, index) =>
    index < span ? vb[span - 1 - index] : 0);
  const spectrumA = fft(paddedA);
  const spectrumB = fft(reversedB);
  const product = spectrumA.map((value, index) => {
    const other = spectrumB[index];
    return {
      re: value.re * other.re - value.im * other.im,
      im: value.re * other.im + value.im * other.re,
    };
  });
  const convolution = ifftReal(product);

  const startA = (sortedA[0].tick - origin) / tickStep;
  const startB = (sortedB[0].tick - origin) / tickStep;
  const entries: CrossCorrelationEntry[] = [];
  for (let lag = -limit; lag <= limit; lag++) {
    if (lag % tickStep !== 0) {
      entries.push({ lag, pairs: 0, correlation: null });
      continue;
    }
    const shift = lag / tickStep;
    const from = Math.max(startA, startB - shift);
    const to = Math.min(startA + sortedA.length - 1, startB - shift + sortedB.length - 1);
    const pairs = Math.max(0, to - from + 1);
    if (pairs < minimum) {
      entries.push({ lag, pairs, correlation: null });
      continue;
    }
    const sumX = segmentSum(prefixA, from, to + 1);
    const sumY = segmentSum(prefixB, from + shift, to + shift + 1);
    const sumXX = segmentSum(prefixAA, from, to + 1);
    const sumYY = segmentSum(prefixBB, from + shift, to + shift + 1);
    const sumXY = convolution[span - 1 - shift];
    entries.push({
      lag,
      pairs,
      correlation: correlationFromSums(pairs, sumX, sumY, sumXX, sumYY, sumXY),
    });
  }
  return withDiagnostics(entries);
}

/** Lag con correlazione assoluta massima; esclude lag con correlazione null. */
export function bestCrossCorrelation(entries: CrossCorrelationEntry[]): CrossCorrelationEntry | null {
  const valid = entries.filter((e) => e.correlation !== null);
  if (valid.length === 0) return null;
  return valid.reduce((best, current) =>
    Math.abs(current.correlation as number) > Math.abs(best.correlation as number) ? current : best,
  );
}

/** Picco con correlazione positiva massima (separato dal segno del lag). */
export function bestPositiveCrossCorrelation(entries: CrossCorrelationEntry[]): CrossCorrelationEntry | null {
  const positive = entries.filter((entry) => entry.correlation !== null && (entry.correlation as number) > 0);
  if (positive.length === 0) return null;
  return positive.reduce((best, current) =>
    (current.correlation as number) > (best.correlation as number) ? current : best,
  );
}

/** Picco con correlazione negativa più intensa (separato dal segno del lag). */
export function bestNegativeCrossCorrelation(entries: CrossCorrelationEntry[]): CrossCorrelationEntry | null {
  const negative = entries.filter((entry) => entry.correlation !== null && (entry.correlation as number) < 0);
  if (negative.length === 0) return null;
  return negative.reduce((best, current) =>
    (current.correlation as number) < (best.correlation as number) ? current : best,
  );
}

/** Area sotto la curva con integrazione trapezoida sui tick. */
export function areaUnderCurve(points: Point[]): number | null {
  if (points.length < 2) return null;
  let area = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].tick - points[i - 1].tick;
    area += ((points[i].value + points[i - 1].value) / 2) * dt;
  }
  return round(area);
}

/** Media degli ultimi `window` punti prima del tick indicato. */
export function baselineBefore(points: Point[], tick: number, window = 5): number | null {
  const before = points.filter((p) => p.tick < tick).slice(-Math.max(1, window));
  if (before.length === 0) return null;
  return mean(before.map((p) => p.value));
}

/**
 * Primo tick dopo la perturbazione in cui la serie rientra nella fascia di
 * tolleranza e rimane li' per `minStablePoints` campioni consecutivi.
 */
export function returnTime(
  points: Point[],
  perturbationTick: number,
  baseline: number,
  tolerance: number,
  minStablePoints = 3,
): ReturnTime {
  const after = points.filter((p) => p.tick > perturbationTick);
  const stableNeed = Math.max(1, minStablePoints);
  for (let i = 0; i <= after.length - stableNeed; i++) {
    const window = after.slice(i, i + stableNeed);
    if (window.every((p) => Math.abs(p.value - baseline) <= tolerance)) {
      return {
        baseline: round(baseline),
        tolerance: round(tolerance),
        returnTick: window[0].tick,
        returnValue: round(window[0].value),
        checkedFromTick: perturbationTick,
      };
    }
  }
  return {
    baseline: round(baseline),
    tolerance: round(tolerance),
    returnTick: null,
    returnValue: null,
    checkedFromTick: perturbationTick,
  };
}
