/**
 * E2.2.1 — generatori sintetici deterministici per calibrazione e validazione.
 *
 * Nessun dato biologico viene generato qui: questi processi hanno ground truth
 * noto (indipendenza, ritardo, segno, degenerazione) e servono solo a misurare
 * FPR, potenza e robustezza del test statistico.
 */
import { mulberry32 } from "./surrogateInference";

export type DistributionKind = "gaussian" | "uniform" | "exponential" | "discrete" | "binary";

export interface SeriesOptions {
  phi?: number;
  distribution?: DistributionKind;
  /** Frazione di valori quantizzata per creare ties; 0 = normale. */
  tieFraction?: number;
  /** Ampiezza di un trend lineare comune, in unità di deviazione. */
  trendStrength?: number;
  /** Frazione di varianza condivisa con un rumore comune. */
  commonNoise?: number;
  /** Cambio di media/regime a metà serie: 0 = assente. */
  regimeShift?: number;
  /** Ampiezza di un'oscillazione dominante. */
  oscillationAmplitude?: number;
  /** Periodo in campioni dell'oscillazione dominante. */
  oscillationPeriod?: number;
}

const standardNormal = (rng: () => number): number => {
  const u = Math.max(Number.EPSILON, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const shockFor = (rng: () => number, distribution: DistributionKind): number => {
  switch (distribution) {
    case "gaussian":
      return standardNormal(rng);
    case "uniform":
      return rng() * 2 - 1;
    case "exponential":
      return -Math.log(Math.max(Number.EPSILON, rng())) - 1;
    case "discrete":
      return Math.round(standardNormal(rng) * 2) / 2;
    case "binary":
      return rng() < 0.5 ? -1 : 1;
  }
};

const quantize = (value: number, levels: number): number =>
  Math.round(value * levels) / levels;

/** AR(1) con distribuzione del shock configurabile e opzioni di stress. */
export function syntheticSeries(seed: number, length: number, options: SeriesOptions = {}): number[] {
  const {
    phi = 0,
    distribution = "gaussian",
    tieFraction = 0,
    trendStrength = 0,
    commonNoise = 0,
    regimeShift = 0,
    oscillationAmplitude = 0,
    oscillationPeriod = 24,
  } = options;
  const rng = mulberry32(seed >>> 0);
  const commonRng = mulberry32((seed + 0x85ebca6b) >>> 0);
  let state = 0;
  const values: number[] = [];
  for (let index = 0; index < length; index++) {
    let shock = shockFor(rng, distribution);
    if (tieFraction > 0 && rng() < tieFraction) shock = quantize(shock, 3);
    state = phi * state + shock;
    const trend = trendStrength * (index / Math.max(1, length - 1));
    const regime = index >= length / 2 ? regimeShift : 0;
    const oscillation = oscillationAmplitude * Math.sin((2 * Math.PI * index) / oscillationPeriod);
    values.push(state + trend + regime + oscillation + commonNoise * standardNormal(commonRng));
  }
  return values;
}

export interface SyntheticPair {
  a: number[];
  b: number[];
  groundTruth: {
    independent: boolean;
    lagged: boolean;
    knownLag: number | null;
    expectedDirection: "positive" | "negative" | "none" | "mixed";
    scenario: string;
  };
}

/** Coppia indipendente: ground truth = nessuna dipendenza cross-serie. */
export function independentPair(
  seed: number,
  length: number,
  optionsA: SeriesOptions = {},
  optionsB: SeriesOptions = {},
  scenario = "independent",
): SyntheticPair {
  return {
    a: syntheticSeries(seed, length, optionsA),
    b: syntheticSeries(seed + 0x9e3779b9, length, optionsB),
    groundTruth: {
      independent: true,
      lagged: false,
      knownLag: null,
      expectedDirection: "none",
      scenario,
    },
  };
}

/** B riceve una copia ritardata di A più rumore proprio; segno e lag noti. */
export function laggedPair(
  seed: number,
  length: number,
  options: SeriesOptions & { lag?: number; strength?: number; reverse?: boolean } = {},
): SyntheticPair {
  const { lag = 3, strength = 1, reverse = false, ...seriesOptions } = options;
  const source = syntheticSeries(seed, length, seriesOptions);
  const own = syntheticSeries(seed + 0x9e3779b9, length, {
    ...seriesOptions,
    trendStrength: 0,
    regimeShift: 0,
  });
  const a: number[] = [];
  const b: number[] = [];
  for (let index = 0; index < length; index++) {
    const delayed = index - lag >= 0 ? source[index - lag] : 0;
    const effect = (strength < 0 ? -1 : 1) * Math.abs(strength) * delayed;
    if (reverse) {
      a.push(own[index] + effect);
      b.push(source[index]);
    } else {
      a.push(source[index]);
      b.push(own[index] + effect);
    }
  }
  return {
    a,
    b,
    groundTruth: {
      independent: false,
      lagged: true,
      knownLag: lag,
      expectedDirection: strength < 0 ? "negative" : "positive",
      scenario: reverse ? "reverse_lag" : "known_lag",
    },
  };
}

/** Trend comune senza causalità: il nullo deve restare calibration-valid. */
export function commonTrendPair(seed: number, length: number, options: SeriesOptions = {}): SyntheticPair {
  const pair = independentPair(seed, length, options, options, "common_trend");
  const trend = syntheticSeries(seed + 0x27d4eb2f, length, { distribution: "uniform", phi: 0.95 });
  const scaling = 2;
  pair.a = pair.a.map((value, index) => value + scaling * trend[index]);
  pair.b = pair.b.map((value, index) => value + scaling * trend[index]);
  return pair;
}

/** Rumore comune indipendente dal tempo: correlazione simultanea, non sequenzialità. */
export function commonNoisePair(seed: number, length: number, coupling = 0.7): SyntheticPair {
  const pair = independentPair(seed, length, { phi: 0.65 }, { phi: 0.65 }, "common_noise");
  const shared = syntheticSeries(seed + 0x1b873593, length, { phi: 0, distribution: "gaussian" });
  pair.a = pair.a.map((value, index) => value + coupling * shared[index]);
  pair.b = pair.b.map((value, index) => value + coupling * shared[index]);
  return pair;
}

/** Regime shift non stazionario senza dipendenza cross-serie. */
export function nonStationaryPair(seed: number, length: number): SyntheticPair {
  return independentPair(seed, length,
    { phi: 0.9, regimeShift: 3 },
    { phi: 0.9, regimeShift: 2.5 },
    "non_stationary");
}

export function degenerateSeries(kind: "constant" | "near-constant" | "tied" | "binary", length: number): number[] {
  switch (kind) {
    case "constant":
      return Array.from({ length }, () => 7);
    case "near-constant":
      return Array.from({ length }, (_, index) => 7 + (index % 2) * 1e-12);
    case "tied":
      return Array.from({ length }, (_, index) => [0, 0, 1, 1, 2, 2, 3, 3][index % 8]);
    case "binary":
      return Array.from({ length }, (_, index) => (index % 3 === 0 ? 1 : -1));
  }
}

export const pointsFrom = (values: number[], step = 10): Array<{ tick: number; value: number }> =>
  values.map((value, index) => ({ tick: index * step, value }));
