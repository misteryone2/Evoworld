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

/**
 * Correlazione incrociata per lag interi sui tick. Un lag positivo significa
 * che `b` e' osservato `lag` tick DOPO `a`; cioe' `corr(a[t], b[t+lag])`.
 */
export function crossCorrelation(
  a: Point[],
  b: Point[],
  maxLag: number,
): CrossCorrelationEntry[] {
  const limit = Math.max(0, Math.floor(maxLag));
  const bByTick = new Map(b.map((p) => [p.tick, p.value]));
  const result: CrossCorrelationEntry[] = [];
  for (let lag = -limit; lag <= limit; lag++) {
    const pairs: Array<[number, number]> = [];
    for (const point of a) {
      const other = bByTick.get(point.tick + lag);
      if (other !== undefined && Number.isFinite(other)) pairs.push([point.value, other]);
    }
    if (pairs.length < 3) {
      result.push({ lag, pairs: pairs.length, correlation: null });
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
    const correlation = sxx > 0 && syy > 0 ? round(sxy / Math.sqrt(sxx * syy)) : null;
    result.push({ lag, pairs: pairs.length, correlation });
  }
  return result;
}

/** Lag con correlazione assoluta massima; esclude lag con correlazione null. */
export function bestCrossCorrelation(entries: CrossCorrelationEntry[]): CrossCorrelationEntry | null {
  const valid = entries.filter((e) => e.correlation !== null);
  if (valid.length === 0) return null;
  return valid.reduce((best, current) =>
    Math.abs(current.correlation as number) > Math.abs(best.correlation as number) ? current : best,
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
