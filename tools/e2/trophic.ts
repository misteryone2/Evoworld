/**
 * E2.2 — osservabilità trofica additiva.
 *
 * Lavora solo sui `RunResult` di E1. Non modifica il motore, E1, i tratti o le
 * regole di predazione. Ogni serie derivata è un'etichetta di tratto, un evento
 * contato o un proxy di risorsa: non è mai un ruolo trofico individuale.
 *
 * - `herbivore`/`carnivore` = population × frazione di tratto E1 (soglia 0.35).
 * - `killsPerTick` = snapshot puntuale di `predationKills` al tick campionato.
 * - `killsIntervalRate` = Δ cumulativeKills / Δ tick tra campioni consecutivi.
 * - `vegetation` = media su celle occupate (`peekCell`), non stock globale.
 */
import type { RunResult } from "../e1/runner";
import {
  lag1Autocorrelation,
  linearTrend,
  oscillationMetrics,
  seriesMean,
  seriesSd,
  type OscillationMetrics,
  type Point,
} from "./timeseries";

const round = (value: number, digits = 6): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const finiteSeries = (points: Point[]): Point[] =>
  points.filter((point) => Number.isFinite(point.value)).sort((a, b) => a.tick - b.tick);

export interface TrophicSeriesSet {
  /** Conteggio approssimato di portatori del tratto erbivoro (carnivory < 0.35). */
  herbivore: Point[];
  /** Conteggio approssimato di portatori del tratto carnivoro (carnivory >= 0.35). */
  carnivore: Point[];
  /** Uccisioni nel singolo tick campionato (snapshot, non aggregate sull'intervallo). */
  killsPerTick: Point[];
  /** Contatore cumulativo del runner. */
  killsCumulative: Point[];
  /** Media intervallare eventi/tick tra campioni consecutivi. */
  killsIntervalRate: Point[];
  /** Proxy di risorsa: media su celle distinte occupate. */
  vegetation: Point[];
  /** Frazione di celle occupate non-oceaniche. */
  landFraction: Point[];
  /** Popolazione totale. */
  total: Point[];
}

/** Estrae tutte le serie trofiche osservabili da un risultato E1. */
export function trophicSeriesSet(result: RunResult): TrophicSeriesSet {
  const samples = [...result.samples].sort((a, b) => a.tick - b.tick);
  const map = (pick: (sample: (typeof samples)[number]) => number): Point[] =>
    finiteSeries(samples.map((sample) => ({ tick: sample.tick, value: pick(sample) })));

  const killsIntervalRate: Point[] = [];
  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1];
    const current = samples[i];
    const deltaTicks = current.tick - previous.tick;
    if (deltaTicks <= 0) continue;
    const value = (current.cumulativePredationKills - previous.cumulativePredationKills) / deltaTicks;
    if (Number.isFinite(value)) killsIntervalRate.push({ tick: current.tick, value: round(value) });
  }

  return {
    herbivore: map((sample) => sample.population * sample.herbivoreFraction),
    carnivore: map((sample) => sample.population * sample.carnivoreFraction),
    killsPerTick: map((sample) => sample.predationKills),
    killsCumulative: map((sample) => sample.cumulativePredationKills),
    killsIntervalRate,
    vegetation: map((sample) => sample.occupiedVegetation),
    landFraction: map((sample) => sample.occupiedLandFraction),
    total: map((sample) => sample.population),
  };
}

/**
 * Sostituisce il campionamento di una corsa con una cadenza più grossolana.
 * Usato per la sensibilità a `sampleEvery` senza rieseguire il motore.
 * Il tick 0 è sempre conservato.
 */
export function resampleResult(result: RunResult, sampleEvery: number): RunResult {
  if (!Number.isInteger(sampleEvery) || sampleEvery <= 0) {
    throw new Error("resampleResult: sampleEvery must be a positive integer");
  }
  const samples = result.samples.filter((sample) => sample.tick % sampleEvery === 0);
  return { ...result, sampleEvery, samples };
}

/** Limita una corsa a un orizzonte più breve, conservando i campioni originali. */
export function truncateResult(result: RunResult, maxTick: number): RunResult {
  if (!Number.isInteger(maxTick) || maxTick <= 0) {
    throw new Error("truncateResult: maxTick must be a positive integer");
  }
  const samples = result.samples.filter((sample) => sample.tick <= maxTick);
  const effectiveTick = Math.min(result.ticks, maxTick);
  return { ...result, ticks: effectiveTick, completedTicks: Math.min(result.completedTicks, maxTick), samples };
}

export interface TraitPersistence {
  /** Numero di campioni con almeno un portatore atteso del tratto. */
  presentTicks: number;
  /** Frazione di campioni con presenza (null se non ci sono campioni). */
  presenceFraction: number | null;
  firstPresentTick: number | null;
  lastPresentTick: number | null;
  /** Primo tick osservato di assenza dopo l'ultima presenza; null se presente fino alla fine. */
  extinctionTick: number | null;
  finalCount: number | null;
  meanCountWhenPresent: number | null;
}

export interface TrophicPersistence {
  firstTick: number | null;
  lastTick: number | null;
  sampledTicks: number;
  herbivore: TraitPersistence;
  carnivore: TraitPersistence;
  /** Campioni in cui entrambi i conteggi di tratto sono > 0. */
  coexistenceTicks: number;
  coexistenceFraction: number | null;
  /** Primo tick in cui un gruppo scompare e non ricompare più. */
  firstTraitLossTick: number | null;
  firstTraitLossGroup: "herbivore" | "carnivore" | null;
}

const traitPersistence = (series: Point[]): TraitPersistence => {
  const present = series.filter((point) => point.value > 0);
  const lastPresentIndex = series.reduce((last, point, index) => (point.value > 0 ? index : last), -1);
  const extinctionTick = lastPresentIndex >= 0 && lastPresentIndex + 1 < series.length
    ? series[lastPresentIndex + 1].tick
    : null;
  return {
    presentTicks: present.length,
    presenceFraction: series.length ? round(present.length / series.length) : null,
    firstPresentTick: present.length ? present[0].tick : null,
    lastPresentTick: present.length ? present[present.length - 1].tick : null,
    extinctionTick,
    finalCount: series.length ? round(series[series.length - 1].value) : null,
    meanCountWhenPresent: present.length ? round(present.reduce((sum, point) => sum + point.value, 0) / present.length) : null,
  };
};

/**
 * Persistenza delle etichette di tratto. `conteggio > 0` equivale ad almeno un
 * portatore atteso, perché E1 assegna frazione 0 esattamente quando non ci sono
 * portatori; non identifica il ruolo in un attacco.
 */
export function trophicPersistence(result: RunResult): TrophicPersistence {
  const series = trophicSeriesSet(result);
  const herbivore = traitPersistence(series.herbivore);
  const carnivore = traitPersistence(series.carnivore);
  const ticks = new Map(series.herbivore.map((point) => [point.tick, point.value]));
  const coexistenceTicks = series.carnivore.filter((point) => (ticks.get(point.tick) ?? 0) > 0 && point.value > 0).length;
  const sampledTicks = series.herbivore.length;

  const losses: Array<{ tick: number; group: "herbivore" | "carnivore" }> = [];
  if (herbivore.extinctionTick !== null) losses.push({ tick: herbivore.extinctionTick, group: "herbivore" });
  if (carnivore.extinctionTick !== null) losses.push({ tick: carnivore.extinctionTick, group: "carnivore" });
  losses.sort((a, b) => a.tick - b.tick);

  return {
    firstTick: series.herbivore.length ? series.herbivore[0].tick : null,
    lastTick: series.herbivore.length ? series.herbivore[series.herbivore.length - 1].tick : null,
    sampledTicks,
    herbivore,
    carnivore,
    coexistenceTicks,
    coexistenceFraction: sampledTicks ? round(coexistenceTicks / sampledTicks) : null,
    firstTraitLossTick: losses.length ? losses[0].tick : null,
    firstTraitLossGroup: losses.length ? losses[0].group : null,
  };
}

export interface SeriesStability {
  n: number;
  mean: number | null;
  sd: number | null;
  /** coefficiente di variazione = sd / |media|; null se media zero o campioni insufficienti. */
  cv: number | null;
  trendSlope: number | null;
  trendR2: number | null;
  lag1: number | null;
  oscillation: OscillationMetrics;
}

/** Statistiche di stabilità di una serie, indicizzata sul tick. */
export function seriesStability(points: Point[]): SeriesStability {
  const series = finiteSeries(points);
  const trend = linearTrend(series);
  const mean = seriesMean(series);
  const sd = seriesSd(series);
  const cv = mean !== null && sd !== null && mean !== 0 ? round(sd / Math.abs(mean)) : null;
  return {
    n: series.length,
    mean: mean === null ? null : round(mean),
    sd: sd === null ? null : round(sd),
    cv,
    trendSlope: series.length >= 2 ? trend.slope : null,
    trendR2: trend.r2,
    lag1: lag1Autocorrelation(series.map((point) => point.value)),
    oscillation: oscillationMetrics(series),
  };
}

export interface TrophicStability {
  herbivore: SeriesStability;
  carnivore: SeriesStability;
  killsPerTick: SeriesStability;
  killsIntervalRate: SeriesStability;
  killsCumulative: SeriesStability;
  vegetation: SeriesStability;
  total: SeriesStability;
}

/** Stabilità di tutte le serie trofiche osservabili di una corsa. */
export function trophicStability(result: RunResult): TrophicStability {
  const series = trophicSeriesSet(result);
  return {
    herbivore: seriesStability(series.herbivore),
    carnivore: seriesStability(series.carnivore),
    killsPerTick: seriesStability(series.killsPerTick),
    killsIntervalRate: seriesStability(series.killsIntervalRate),
    killsCumulative: seriesStability(series.killsCumulative),
    vegetation: seriesStability(series.vegetation),
    total: seriesStability(series.total),
  };
}
