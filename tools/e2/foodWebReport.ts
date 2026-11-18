/**
 * E2.2 — aggregazione cross-seed delle dinamiche trofiche.
 *
 * Tutte le correlazioni sono descrittive: l'unità statistica è la corsa/seed.
 * Le coppie usano serie derivate da tratti E1, eventi di predazione contati e
 * proxy di risorsa; nessuna di esse identifica un ruolo trofico individuale.
 */
import type { RunResult } from "../e1/runner";
import { summarize, type NumericSummary, type PairedComparison } from "../e1/statistics";
import { byScenario, pairedMetric } from "./statistics";
import { compareCrossCorrelations, seriesMean, type Point } from "./timeseries";
import {
  trophicPersistence,
  trophicSeriesSet,
  trophicStability,
  type TrophicSeriesSet,
} from "./trophic";

export type TrophicSeriesKey = keyof TrophicSeriesSet;

export interface TrophicPairDef {
  id: string;
  a: TrophicSeriesKey;
  b: TrophicSeriesKey;
  label: string;
}

/**
 * Direzione: `crossCorrelation(a,b,lag)` accoppia `a[t]` con `b[t+lag]`.
 * Un lag positivo significa che `b` è osservato dopo `a`.
 */
export const FOOD_WEB_PAIRS: readonly TrophicPairDef[] = [
  { id: "herbivore_carnivore", a: "herbivore", b: "carnivore", label: "tratto erbivoro → tratto carnivoro" },
  { id: "herbivore_kills", a: "herbivore", b: "killsIntervalRate", label: "tratto erbivoro → tasso kills" },
  { id: "carnivore_kills", a: "carnivore", b: "killsIntervalRate", label: "tratto carnivoro → tasso kills" },
  { id: "vegetation_herbivore", a: "vegetation", b: "herbivore", label: "vegetazione occupata → tratto erbivoro" },
  { id: "vegetation_carnivore", a: "vegetation", b: "carnivore", label: "vegetazione occupata → tratto carnivoro" },
] as const;

const finite = (values: Array<number | null | undefined>): number[] =>
  values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));

const safe = (key: string, fallback: TrophicPairDef): TrophicPairDef =>
  FOOD_WEB_PAIRS.find((pair) => pair.id === key) ?? fallback;

export interface PairCorrelationSeed {
  seed: number;
  originalAtLagZero: number | null;
  detrendedAtLagZero: number | null;
  originalPeakLag: number | null;
  detrendedPeakLag: number | null;
  detrendedPeakCorrelation: number | null;
  commonTrendDetected: boolean;
  spuriousTrendRisk: boolean;
}

export interface PairCorrelationSummary {
  pairId: string;
  a: TrophicSeriesKey;
  b: TrophicSeriesKey;
  label: string;
  maxLag: number;
  runs: number;
  seeds: PairCorrelationSeed[];
  originalAtLagZero: NumericSummary;
  detrendedAtLagZero: NumericSummary;
  originalPeakLag: NumericSummary;
  detrendedPeakLag: NumericSummary;
  detrendedPeakCorrelation: NumericSummary;
  /** Seed con picco detrendizzato a lag > 0 (b dopo a). */
  positiveLagSeeds: number;
  negativeLagSeeds: number;
  zeroLagSeeds: number;
  /** Seed con lag > 0 e |r| >= 0.5 al picco detrendizzato. */
  strongPositiveLagSeeds: number;
  spuriousTrendRiskSeeds: number;
  note: string;
}

const pairSeries = (result: RunResult, pair: TrophicPairDef): { a: Point[]; b: Point[] } => {
  const series = trophicSeriesSet(result);
  return { a: series[pair.a], b: series[pair.b] };
};

/** Analisi per seed e aggregazione cross-seed di una coppia di serie trofiche. */
export function analyzePairCorrelation(
  results: RunResult[],
  pair: TrophicPairDef,
  maxLag: number,
): PairCorrelationSummary {
  if (!Number.isInteger(maxLag) || maxLag < 0) throw new Error("maxLag must be a non-negative integer");
  const sorted = [...results].sort((x, y) => x.seed - y.seed);
  const seeds: PairCorrelationSeed[] = sorted.map((result) => {
    const { a, b } = pairSeries(result, pair);
    const comparison = compareCrossCorrelations(a, b, maxLag);
    return {
      seed: result.seed,
      originalAtLagZero: comparison.originalAtLagZero,
      detrendedAtLagZero: comparison.detrendedAtLagZero,
      originalPeakLag: comparison.originalPeak?.lag ?? null,
      detrendedPeakLag: comparison.detrendedPeak?.lag ?? null,
      detrendedPeakCorrelation: comparison.detrendedPeak?.correlation ?? null,
      commonTrendDetected: comparison.commonTrendDetected,
      spuriousTrendRisk: comparison.spuriousTrendRisk,
    };
  });

  const positive = seeds.filter((seed) => seed.detrendedPeakLag !== null && seed.detrendedPeakLag > 0);
  return {
    pairId: pair.id,
    a: pair.a,
    b: pair.b,
    label: pair.label,
    maxLag,
    runs: seeds.length,
    seeds,
    originalAtLagZero: summarize(finite(seeds.map((seed) => seed.originalAtLagZero))),
    detrendedAtLagZero: summarize(finite(seeds.map((seed) => seed.detrendedAtLagZero))),
    originalPeakLag: summarize(finite(seeds.map((seed) => seed.originalPeakLag))),
    detrendedPeakLag: summarize(finite(seeds.map((seed) => seed.detrendedPeakLag))),
    detrendedPeakCorrelation: summarize(finite(seeds.map((seed) => seed.detrendedPeakCorrelation))),
    positiveLagSeeds: positive.length,
    negativeLagSeeds: seeds.filter((seed) => seed.detrendedPeakLag !== null && seed.detrendedPeakLag < 0).length,
    zeroLagSeeds: seeds.filter((seed) => seed.detrendedPeakLag === 0).length,
    strongPositiveLagSeeds: positive.filter((seed) =>
      seed.detrendedPeakCorrelation !== null && Math.abs(seed.detrendedPeakCorrelation) >= 0.5).length,
    spuriousTrendRiskSeeds: seeds.filter((seed) => seed.spuriousTrendRisk).length,
    note: "Lag in tick: lag positivo = b dopo a. Con sampleEvery=10 solo multipli di 10 sono stimabili. Sequenzialità ≠ causalità.",
  };
}

/** Analisi di tutte le coppie richieste. */
export function analyzeFoodWebPairs(
  results: RunResult[],
  maxLag: number,
  pairIds: readonly string[] = FOOD_WEB_PAIRS.map((pair) => pair.id),
): PairCorrelationSummary[] {
  return pairIds.map((id) => analyzePairCorrelation(results, safe(id, FOOD_WEB_PAIRS[0]), maxLag));
}

export type DependenceClass = "EVIDENZA_SEQUENZIALITA" | "INDICATIVO" | "NON_DIMOSTRATO";

export interface DependenceAssessment {
  scenario: string;
  pairId: string;
  runs: number;
  strongPositiveLagSeeds: number;
  positiveLagSeeds: number;
  negativeLagSeeds: number;
  zeroLagSeeds: number;
  spuriousTrendRiskSeeds: number;
  classification: DependenceClass;
  rationale: string;
}

/**
 * Classificazione conservativa della sequenzialità erbivoro→carnivoro.
 * Non è una prova di dipendenza causale né di predazione effettiva.
 */
export function assessCarnivoreDependence(
  pair: PairCorrelationSummary,
  scenario: string,
): DependenceAssessment {
  let classification: DependenceClass = "NON_DIMOSTRATO";
  if (pair.runs >= 10 && pair.strongPositiveLagSeeds >= 10) classification = "EVIDENZA_SEQUENZIALITA";
  else if (pair.runs >= 10 && (pair.strongPositiveLagSeeds >= 6 || pair.positiveLagSeeds >= 10)) {
    classification = "INDICATIVO";
  }
  const rationale = classification === "EVIDENZA_SEQUENZIALITA"
    ? `${pair.strongPositiveLagSeeds}/${pair.runs} seed con lag detrendizzato positivo e |r|>=0.5: sequenzialità aggregata, non causalità.`
    : classification === "INDICATIVO"
      ? `Sequenzialità parziale (${pair.strongPositiveLagSeeds}/${pair.runs} forti, ${pair.positiveLagSeeds}/${pair.runs} lag positivi): classificazione indicativa.`
      : `Sequenzialità non consistente (${pair.strongPositiveLagSeeds}/${pair.runs} forti, ${pair.positiveLagSeeds}/${pair.runs} lag positivi): non dimostrata.`;
  return {
    scenario,
    pairId: pair.pairId,
    runs: pair.runs,
    strongPositiveLagSeeds: pair.strongPositiveLagSeeds,
    positiveLagSeeds: pair.positiveLagSeeds,
    negativeLagSeeds: pair.negativeLagSeeds,
    zeroLagSeeds: pair.zeroLagSeeds,
    spuriousTrendRiskSeeds: pair.spuriousTrendRiskSeeds,
    classification,
    rationale: `${rationale} Mancano ID predatore/preda: non è ricostruibile la rete individuale.`,
  };
}

export interface FoodWebProtocol {
  experiment: string;
  seeds: number[];
  ticks: number;
  sampleEvery: number;
  maxLag: number;
  scenarioIds: string[];
  label?: string;
}

export interface FoodWebPersistenceReport {
  seeds: Array<{ seed: number; herbivorePresentTicks: number; carnivorePresentTicks: number; coexistenceFraction: number | null }>;
  herbivorePresentToEnd: number;
  carnivorePresentToEnd: number;
  coexistenceFraction: NumericSummary;
  seedsWithCoexistenceOverHalf: number;
  firstTraitLossTick: NumericSummary;
}

export interface FoodWebStabilityReport {
  mean: NumericSummary;
  cv: NumericSummary;
  lag1: NumericSummary;
  trendSlope: NumericSummary;
  peakInterval: NumericSummary;
}

export interface FoodWebScenarioReport {
  scenario: string;
  runs: number;
  persistence: FoodWebPersistenceReport;
  stability: Record<Exclude<TrophicSeriesKey, "landFraction">, FoodWebStabilityReport>;
  kills: {
    cumulative: NumericSummary;
    intervalRate: NumericSummary;
    perTickSnapshot: NumericSummary;
    pressureSnapshot: NumericSummary;
  };
  correlations: PairCorrelationSummary[];
  dependence: DependenceAssessment | null;
}

export interface FoodWebReport {
  schema: "evoworld.e2.foodweb.v1";
  protocol: FoodWebProtocol;
  byScenario: FoodWebScenarioReport[];
  pairedComparisons: PairedComparison[];
  note: string;
}

const stabilityReport = (results: RunResult[], key: Exclude<TrophicSeriesKey, "landFraction">): FoodWebStabilityReport => {
  const values = results.map((result) => trophicStability(result)[key]);
  return {
    mean: summarize(finite(values.map((value) => value.mean))),
    cv: summarize(finite(values.map((value) => value.cv))),
    lag1: summarize(finite(values.map((value) => value.lag1))),
    trendSlope: summarize(finite(values.map((value) => value.trendSlope))),
    peakInterval: summarize(finite(values.map((value) => value.oscillation.meanPeakInterval))),
  };
};

const last = (result: RunResult) => result.samples[result.samples.length - 1];

const extractFinalKills = (result: RunResult): number => last(result)?.cumulativePredationKills ?? 0;
const extractFinalCarnivore = (result: RunResult): number => {
  const sample = last(result);
  return sample ? sample.population * sample.carnivoreFraction : 0;
};
const extractFinalHerbivore = (result: RunResult): number => {
  const sample = last(result);
  return sample ? sample.population * sample.herbivoreFraction : 0;
};
const extractCoexistence = (result: RunResult): number => trophicPersistence(result).coexistenceFraction ?? 0;
const extractKillRate = (result: RunResult): number => seriesMean(trophicSeriesSet(result).killsIntervalRate) ?? 0;

/** Confronti appaiati descrittivi. S06 differisce da S04/S05 anche per geometria e densità. */
export function buildFoodWebComparisons(groups: Record<string, RunResult[]>): PairedComparison[] {
  const s06 = "S06_predator_prey_mixed";
  const s05 = "S05_carnivore_stress";
  const s04 = "S04_herbivore_monoculture";
  const comparisons: PairedComparison[] = [];
  const add = (
    a: string,
    b: string,
    label: string,
    description: string,
    metric: string,
    extract: (result: RunResult) => number,
  ) => {
    if (!groups[a] || !groups[b]) return;
    comparisons.push(pairedMetric(groups[a], groups[b], extract, {
      label, description, scenarioA: a, scenarioB: b, metric,
    }));
  };
  for (const control of [s05, s04]) {
    add(s06, control, `mixed_minus_${control === s05 ? "carnivore" : "herbivore"}_kills`,
      "Differenza di kills cumulativi; confronto descrittivo e confuso (geometria/densità).",
      "cumulativePredationKills", extractFinalKills);
    add(s06, control, `mixed_minus_${control === s05 ? "carnivore" : "herbivore"}_carnivore_trait`,
      "Differenza di conteggio del tratto carnivoro; non è un ruolo di attacco.",
      "finalCarnivoreTraitCount", extractFinalCarnivore);
    add(s06, control, `mixed_minus_${control === s05 ? "carnivore" : "herbivore"}_herbivore_trait`,
      "Differenza di conteggio del tratto erbivoro; non è consumo vegetale osservato.",
      "finalHerbivoreTraitCount", extractFinalHerbivore);
    add(s06, control, `mixed_minus_${control === s05 ? "carnivore" : "herbivore"}_coexistence`,
      "Differenza di frazione di coesistenza dei tratti; descrittiva.",
      "coexistenceFraction", extractCoexistence);
  }
  add(s06, s05, "mixed_minus_carnivore_kill_rate",
    "Differenza di tasso medio di kills intervallari; descrittiva.",
    "meanKillIntervalRate", extractKillRate);

  const lagZeroPair = FOOD_WEB_PAIRS[0];
  add(s06, s05, "mixed_minus_carnivore_detrended_lag0",
    "Differenza di correlazione detrendizzata a lag 0 tra tratti; descrittiva.",
    "detrendedLagZeroHerbivoreCarnivore", (result) => {
      const { a, b } = pairSeries(result, lagZeroPair);
      return compareCrossCorrelations(a, b, 0).detrendedAtLagZero ?? 0;
    });
  return comparisons;
}

/** Report completo di un blocco sperimentale E2.2. */
export function buildFoodWebReport(
  results: RunResult[],
  protocol: FoodWebProtocol,
  maxLag = protocol.maxLag,
  pairIds: readonly string[] = FOOD_WEB_PAIRS.map((pair) => pair.id),
): FoodWebReport {
  const groups = byScenario(results);
  const byScenarioReport: FoodWebScenarioReport[] = [];
  for (const [scenario, group] of Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))) {
    const persistence = group.map((result) => trophicPersistence(result));
    const stabilityKeys: Array<Exclude<TrophicSeriesKey, "landFraction">> = [
      "herbivore", "carnivore", "killsPerTick", "killsIntervalRate", "killsCumulative", "vegetation", "total",
    ];
    const stability = {} as Record<Exclude<TrophicSeriesKey, "landFraction">, FoodWebStabilityReport>;
    for (const key of stabilityKeys) stability[key] = stabilityReport(group, key);

    const correlations = analyzeFoodWebPairs(group, maxLag, pairIds);
    const dependencePair = correlations.find((pair) => pair.pairId === "herbivore_carnivore");
    byScenarioReport.push({
      scenario,
      runs: group.length,
      persistence: {
        seeds: group.map((result, index) => ({
          seed: result.seed,
          herbivorePresentTicks: persistence[index].herbivore.presentTicks,
          carnivorePresentTicks: persistence[index].carnivore.presentTicks,
          coexistenceFraction: persistence[index].coexistenceFraction,
        })).sort((a, b) => a.seed - b.seed),
        herbivorePresentToEnd: persistence.filter((value) => value.herbivore.finalCount !== null && value.herbivore.finalCount > 0).length,
        carnivorePresentToEnd: persistence.filter((value) => value.carnivore.finalCount !== null && value.carnivore.finalCount > 0).length,
        coexistenceFraction: summarize(finite(persistence.map((value) => value.coexistenceFraction))),
        seedsWithCoexistenceOverHalf: persistence.filter((value) =>
          value.coexistenceFraction !== null && value.coexistenceFraction > 0.5).length,
        firstTraitLossTick: summarize(finite(persistence.map((value) => value.firstTraitLossTick))),
      },
      stability,
      kills: {
        cumulative: summarize(group.map(extractFinalKills)),
        intervalRate: summarize(group.map(extractKillRate)),
        perTickSnapshot: summarize(group.map((result) => last(result)?.predationKills ?? 0)),
        pressureSnapshot: summarize(group.map((result) => last(result)?.predationPressure ?? 0)),
      },
      correlations,
      dependence: dependencePair ? assessCarnivoreDependence(dependencePair, scenario) : null,
    });
  }
  return {
    schema: "evoworld.e2.foodweb.v1",
    protocol: { ...protocol, scenarioIds: [...protocol.scenarioIds].sort() },
    byScenario: byScenarioReport,
    pairedComparisons: buildFoodWebComparisons(groups),
    note: "E2.2 è osservazionale: tratti ≠ ruoli, kills ≠ mortalità totale, correlazione ≠ causalità. Unità statistica = corsa/seed; confronti non randomizzati e S06 confuso per geometria/densità.",
  };
}
