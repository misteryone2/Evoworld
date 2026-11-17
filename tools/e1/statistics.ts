/**
 * E1.2 — statistiche descrittive multi-seed, calcolate SOLO dai risultati
 * dell'harness. Nessuna regola biologica o parametro di simulazione è coinvolto.
 *
 * Gli intervalli di confidenza usano la t di Student con deviazione standard
 * campionaria (n-1) e sono quindi approssimativi: con 12 seed presuppongono
 * osservazioni indipendenti e distribuzione circa normale. Vanno letti come
 * incertezza empirica, non come prova di significatività.
 */
import type { RunResult } from "./runner";

export interface NumericSummary {
  n: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  ci95: { low: number; high: number } | null;
}

export interface RateSummary {
  count: number;
  n: number;
  rate: number;
}

export interface SpeciationSummary {
  runsWithSpeciation: number;
  n: number;
  frequency: number;
  meanEvents: number;
}

/**
 * Tabella storica (3 decimali) per df 1..30, verificata contro NIST/SEMATECH
 * e Statistics Kingdom. Viene mantenuta per non alterare i report E1.3 a 4
 * decimali: con df=11 il valore esatto 2.2009851601 sposterebbe un limite da
 * -21.2672 a -21.2671. Per df > 30 si usa il calcolo sotto, non 1.96.
 */
const T_CRITICAL_95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262,
  10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110,
  18: 2.101, 19: 2.093, 20: 2.086, 21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
  26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
};

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** log Gamma: Lanczos per z < 10, serie di Stirling per z >= 10. */
function logGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  if (z >= 10) {
    const z2 = z * z;
    return (z - 0.5) * Math.log(z) - z + 0.5 * Math.log(2 * Math.PI)
      + 1 / (12 * z) - 1 / (360 * z * z2) + 1 / (1260 * z2 * z2 * z)
      - 1 / (1680 * z2 * z2 * z2 * z);
  }
  const w = z - 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) x += LANCZOS[i] / (w + i + 1);
  const t = w + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (w + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Frazione continua di Lentz per la beta incompleta (Numerical Recipes 6.4). */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const MAX_ITERATIONS = 300;
  const EPSILON = 1e-15;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITERATIONS; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPSILON) break;
  }
  return h;
}

/** Beta incompleta regolarizzata I_x(a,b). */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(x, a, b)) / a
    : 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/**
 * Quantile 0.975 della t di Student (IC95 bilaterale) per `df` >= 1, senza
 * dipendenze esterne. Si inverte la coda
 *   P(|T| > t) = I_{df/(df+t^2)}(df/2, 1/2)
 * con bisezione su t >= 0 fino a P(|T| > t) = 0.05.
 *
 * Verificato contro Statistics Kingdom (df 1,2,11,30,40,50,100) e jStat 1.9.6
 * (df 1,2,11,30,49,99,999,10^6); errori assoluti < 5e-8.
 *
 * NOTA: `summarize` usa la tabella a 3 decimali per df 1..30 (fedelta' ai
 * report E1.3) e questa funzione per df > 30.
 */
export function studentTQuantile95(df: number): number {
  if (!Number.isFinite(df) || df < 1) {
    throw new Error(`E1 statistiche: gradi di liberta' non validi per la t di Student: ${df}`);
  }
  const upperTail = (t: number) => regularizedIncompleteBeta(df / (df + t * t), df / 2, 0.5);
  let low = 0;
  let high = 1000;
  while (upperTail(high) > 0.05) high *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    if (upperTail(mid) > 0.05) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** Valore critico effettivamente usato dagli IC95: tabella storica, poi calcolo esatto. */
function tCritical95(df: number): number {
  return Number.isInteger(df) && df >= 1 && df <= 30
    ? T_CRITICAL_95[df]
    : studentTQuantile95(df);
}

function round(value: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** I valori non finiti non possono contribuire a media, SD o IC. */
function finiteValues(values: number[]): number[] {
  return values.filter((v) => Number.isFinite(v));
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Deviazione standard campionaria (denominatore n-1). */
export function sampleSd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) * (v - m), 0) / (values.length - 1));
}

export function summarize(values: number[]): NumericSummary {
  const finite = finiteValues(values);
  if (!finite.length) {
    return { n: 0, mean: 0, sd: 0, min: 0, max: 0, ci95: null };
  }
  const m = mean(finite);
  const sd = sampleSd(finite);
  const df = finite.length - 1;
  const t = df > 0 ? tCritical95(df) : 0;
  const half = df > 0 ? (t * sd) / Math.sqrt(finite.length) : 0;
  return {
    n: finite.length,
    mean: round(m),
    sd: round(sd),
    min: round(Math.min(...finite)),
    max: round(Math.max(...finite)),
    ci95: df > 0 ? { low: round(m - half), high: round(m + half) } : null,
  };
}

/** Osservazione di uno scenario indicizzata per seed (base dei confronti appaiati). */
export interface SeedValue {
  seed: number;
  value: number;
}

/** Differenza individuale `a - b` per uno seed presente in entrambi i gruppi. */
export interface PairedSeedDifference {
  seed: number;
  a: number;
  b: number;
  difference: number;
}

/**
 * Confronto appaiato per seed. Mantiene le differenze individuali oltre al
 * riassunto, così l'IC95 può essere verificato a partire dai dati grezzi.
 */
export interface PairedComparison {
  label: string;
  description: string;
  scenarioA?: string;
  scenarioB?: string;
  metric?: string;
  pairs: PairedSeedDifference[];
  validPairs: number;
  meanDifference: number;
  sd: number;
  min: number;
  max: number;
  ci95: { low: number; high: number } | null;
  missingInA: number[];
  missingInB: number[];
}

/** Converte le corse di uno scenario in coppie seed/valore, senza ordinarle. */
export function seedValues(results: RunResult[], extract: (r: RunResult) => number = finalPopulation): SeedValue[] {
  return results.map((r) => ({ seed: r.seed, value: extract(r) }));
}

function assertUniqueSeeds(values: SeedValue[], side: string): void {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const v of values) {
    if (seen.has(v.seed)) duplicates.add(v.seed);
    seen.add(v.seed);
  }
  if (duplicates.size) {
    throw new Error(
      `E1 statistiche appaiate: seed duplicati in ${side}: ` +
      [...duplicates].sort((a, b) => a - b).join(", "),
    );
  }
}

/**
 * Confronto appaiato: per ogni seed comune calcola `a - b`, poi riassume le
 * differenze con media, SD campionaria, min/max e IC95 t di Student (n-1 df).
 *
 * - Seed duplicati in uno dei due gruppi sono un errore: il disegno appaiato
 *   richiede un'unica osservazione per seed per scenari.
 * - Seed mancenti vengono dichiarati in `missingInA`/`missingInB`; l'analisi
 *   usa l'intersezione e riporta `validPairs`.
 * - L'ordine di arrivo dei risultati è irrilevante: le coppie sono ordinate
 *   per seed, quindi il risultato è riproducibile.
 *
 * Il confronto è descrittivo/inferenziale sulle differenze, NON una prova
 * causale: la casualizzazione è limitata ai 12 seed dell'harness.
 */
export function pairedDifference(
  a: SeedValue[],
  b: SeedValue[],
  meta: Pick<PairedComparison, "label" | "description"> &
    Partial<Pick<PairedComparison, "scenarioA" | "scenarioB" | "metric">>,
): PairedComparison {
  assertUniqueSeeds(a, "A");
  assertUniqueSeeds(b, "B");
  const mapA = new Map(a.map((v) => [v.seed, v.value]));
  const mapB = new Map(b.map((v) => [v.seed, v.value]));
  const seedsA = [...mapA.keys()].sort((x, y) => x - y);
  const seedsB = [...mapB.keys()].sort((x, y) => x - y);
  const setA = new Set(seedsA);
  const setB = new Set(seedsB);
  const pairs: PairedSeedDifference[] = seedsA
    .filter((seed) => setB.has(seed))
    .map((seed) => {
      const va = mapA.get(seed)!;
      const vb = mapB.get(seed)!;
      return { seed, a: va, b: vb, difference: round(va - vb) };
    });
  const summary = summarize(pairs.map((p) => p.difference));
  return {
    ...meta,
    pairs,
    validPairs: summary.n,
    meanDifference: summary.mean,
    sd: summary.sd,
    min: summary.min,
    max: summary.max,
    ci95: summary.ci95,
    missingInA: seedsB.filter((seed) => !setA.has(seed)),
    missingInB: seedsA.filter((seed) => !setB.has(seed)),
  };
}

export function groupByScenario(results: RunResult[]): Record<string, RunResult[]> {
  const groups: Record<string, RunResult[]> = {};
  for (const r of results) (groups[r.scenario] ??= []).push(r);
  return groups;
}

export function finalPopulation(r: RunResult): number {
  return r.samples.length ? r.samples[r.samples.length - 1].population : 0;
}

export function finalOccupiedVegetation(r: RunResult): number {
  return r.samples.length ? r.samples[r.samples.length - 1].occupiedVegetation : 0;
}

export function extinctionRate(results: RunResult[]): RateSummary {
  const count = results.filter((r) => r.extinctAt !== null || finalPopulation(r) === 0).length;
  return { count, n: results.length, rate: round(results.length ? count / results.length : 0) };
}

/** Speciazione = crescita del conteggio storico di specie tra tick 0 e fine corsa. */
export function speciationFrequency(results: RunResult[]): SpeciationSummary {
  const events = results.map((r) => {
    const first = r.samples[0]?.speciesTotalEver ?? 0;
    const last = r.samples[r.samples.length - 1]?.speciesTotalEver ?? 0;
    return Math.max(0, last - first);
  });
  return {
    runsWithSpeciation: events.filter((e) => e > 0).length,
    n: results.length,
    frequency: round(events.length ? events.filter((e) => e > 0).length / events.length : 0),
    meanEvents: round(mean(events)),
  };
}

const POPULATION_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: "0 (estinta)", min: 0, max: 0 },
  { label: "1-9", min: 1, max: 9 },
  { label: "10-24", min: 10, max: 24 },
  { label: "25-49", min: 25, max: 49 },
  { label: "50-99", min: 50, max: 99 },
  { label: ">=100", min: 100, max: Number.POSITIVE_INFINITY },
];

export function finalPopulationDistribution(results: RunResult[]) {
  const values = results.map(finalPopulation).sort((a, b) => a - b);
  return {
    sortedValues: values,
    buckets: POPULATION_BUCKETS.map((b) => ({
      label: b.label,
      count: values.filter((v) => v >= b.min && v <= b.max).length,
    })),
  };
}

function delta(a: NumericSummary, b: NumericSummary): number {
  return round(a.mean - b.mean);
}

export interface FactorialContrast {
  label: string;
  /** Differenza descrittiva tra medie di gruppo indipendenti (conservata da E1.2). */
  meanDifference: number;
  description: string;
  /** Confronto appaiato per seed: base dell'inferenza in E1.3. */
  paired: PairedComparison;
}

export interface HabitatComparisonReport {
  finalPopulation: Record<string, NumericSummary>;
  finalOccupiedVegetation: Record<string, NumericSummary>;
  extinction: Record<string, RateSummary>;
  contrasts: FactorialContrast[];
}

export interface PerturbationComparisonReport {
  controlScenario: string;
  perturbedScenario: string;
  finalPopulation: {
    withoutPerturbation: NumericSummary;
    withPerturbation: NumericSummary;
    meanDifference: number;
    paired: PairedComparison;
  };
  extinction: {
    withoutPerturbation: RateSummary;
    withPerturbation: RateSummary;
  };
  cull: Record<string, unknown>;
}

/**
 * Confronto 2x2: S09/S13 condividono le posizioni povere, S10/S14 quelle
 * ricche; S09/S14 condividono la vegetazione povera, S10/S13 quella ricca.
 */
const POOR = "S09_poor_habitat";
const RICH = "S10_rich_habitat";
const POOR_POS_RICH_RES = "S13_poor_position_rich_resources";
const RICH_POS_POOR_RES = "S14_rich_position_poor_resources";

export function habitatComparison(groups: Record<string, RunResult[]>): HabitatComparisonReport {
  const summaries = Object.fromEntries(
    Object.entries(groups).map(([id, runs]) => [id, summarize(runs.map(finalPopulation))]),
  );
  const vegetation = Object.fromEntries(
    Object.entries(groups).map(([id, runs]) => [id, summarize(runs.map(finalOccupiedVegetation))]),
  );
  const pop = (id: string) => seedValues(groups[id] ?? []);
  const contrasts: FactorialContrast[] = [
    {
      label: "resource_effect_at_poor_positions",
      meanDifference: delta(summaries[POOR_POS_RICH_RES], summaries[POOR]),
      description: "S13 - S09: stessa posizione povera, vegetazione iniziale ricca vs povera",
      paired: pairedDifference(pop(POOR_POS_RICH_RES), pop(POOR), {
        label: "resource_effect_at_poor_positions",
        description: "S13 - S09 appaiato per seed (final population)",
        scenarioA: POOR_POS_RICH_RES,
        scenarioB: POOR,
        metric: "finalPopulation",
      }),
    },
    {
      label: "resource_effect_at_rich_positions",
      meanDifference: delta(summaries[RICH], summaries[RICH_POS_POOR_RES]),
      description: "S10 - S14: stessa posizione ricca, vegetazione iniziale ricca vs povera",
      paired: pairedDifference(pop(RICH), pop(RICH_POS_POOR_RES), {
        label: "resource_effect_at_rich_positions",
        description: "S10 - S14 appaiato per seed (final population)",
        scenarioA: RICH,
        scenarioB: RICH_POS_POOR_RES,
        metric: "finalPopulation",
      }),
    },
    {
      label: "position_effect_with_poor_resources",
      meanDifference: delta(summaries[RICH_POS_POOR_RES], summaries[POOR]),
      description: "S14 - S09: stessa vegetazione povera, posizione ricca vs povera",
      paired: pairedDifference(pop(RICH_POS_POOR_RES), pop(POOR), {
        label: "position_effect_with_poor_resources",
        description: "S14 - S09 appaiato per seed (final population)",
        scenarioA: RICH_POS_POOR_RES,
        scenarioB: POOR,
        metric: "finalPopulation",
      }),
    },
    {
      label: "position_effect_with_rich_resources",
      meanDifference: delta(summaries[RICH], summaries[POOR_POS_RICH_RES]),
      description: "S10 - S13: stessa vegetazione ricca, posizione ricca vs povera",
      paired: pairedDifference(pop(RICH), pop(POOR_POS_RICH_RES), {
        label: "position_effect_with_rich_resources",
        description: "S10 - S13 appaiato per seed (final population)",
        scenarioA: RICH,
        scenarioB: POOR_POS_RICH_RES,
        metric: "finalPopulation",
      }),
    },
  ];
  return {
    finalPopulation: summaries,
    finalOccupiedVegetation: vegetation,
    extinction: Object.fromEntries(Object.entries(groups).map(([id, runs]) => [id, extinctionRate(runs)])),
    contrasts,
  };
}

export function perturbationComparison(groups: Record<string, RunResult[]>): PerturbationComparisonReport {
  const control = groups["S01_stability_baseline"] ?? [];
  const perturbed = groups["S08_recovery_after_cull80"] ?? [];
  const cullSamples = perturbed
    .map((r) => r.samples.find((s) => s.perturbationRemoved > 0))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  return {
    controlScenario: "S01_stability_baseline",
    perturbedScenario: "S08_recovery_after_cull80",
    finalPopulation: {
      withoutPerturbation: summarize(control.map(finalPopulation)),
      withPerturbation: summarize(perturbed.map(finalPopulation)),
      // Differenza descrittiva di gruppo, conservata per confronto con E1.2.
      meanDifference: delta(
        summarize(perturbed.map(finalPopulation)),
        summarize(control.map(finalPopulation)),
      ),
      paired: pairedDifference(seedValues(perturbed), seedValues(control), {
        label: "cull_effect_S08_minus_S01",
        description: "S08 - S01 appaiato per seed (final population)",
        scenarioA: "S08_recovery_after_cull80",
        scenarioB: "S01_stability_baseline",
        metric: "finalPopulation",
      }),
    },
    extinction: {
      withoutPerturbation: extinctionRate(control),
      withPerturbation: extinctionRate(perturbed),
    },
    cull: {
      observedSamples: cullSamples.length,
      tick: cullSamples[0]?.tick ?? null,
      populationAtStart: summarize(cullSamples.map((s) => s.populationAtStart)),
      populationAfterStep: summarize(cullSamples.map((s) => s.populationAfterStep)),
      removed: summarize(cullSamples.map((s) => s.perturbationRemoved)),
      kept: summarize(cullSamples.map((s) => s.perturbationKept)),
      denominatorMatchesStart: cullSamples.every((s) => s.eventDenominator === Math.max(1, s.populationAtStart)),
    },
  };
}

/** Report completo della fase E1.2/E1.3, serializzato dallo script phase2. */
export function buildPhase2Report(results: RunResult[], protocol: { ticks: number; sampleEvery: number; seeds: number[] }) {
  const groups = groupByScenario(results);
  const byId = Object.fromEntries(
    Object.entries(groups).map(([id, runs]) => [id, {
      runs: runs.length,
      finalPopulation: summarize(runs.map(finalPopulation)),
      finalPopulationDistribution: finalPopulationDistribution(runs),
      extinction: extinctionRate(runs),
      speciation: speciationFrequency(runs),
    }]),
  );
  const habitat = habitatComparison(groups);
  const perturbation = perturbationComparison(groups);
  const pairedComparisons: PairedComparison[] = [
    ...habitat.contrasts.map((c) => c.paired),
    perturbation.finalPopulation.paired,
  ];
  return {
    protocol: { ...protocol, scenarioIds: Object.keys(groups).sort(), totalRuns: results.length },
    byScenario: byId,
    habitat,
    perturbation,
    pairedComparisons,
    note:
      "Confronti appaiati per seed (differenze a-b, IC95 t di Student su n-1 gradi di " +
      "liberta'); `meanDifference` resta solo una differenza descrittiva tra medie di " +
      "gruppo indipendenti. I seed non sono stati randomizzati: le differenze non sono " +
      "una prova causale. Nessun valore e' stato ottenuto modificando le regole biologiche.",
  };
}
