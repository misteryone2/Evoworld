/** E2.2.1 — validazione sintetica con ground truth noto, separata dalle conclusioni biologiche. */
import { describe, expect, it } from "vitest";
import { resolveOutputPath, writeExperimentOutput } from "../tools/e1/experiment";
import {
  QA_ACCEPTANCE,
  runHardenedSurrogateNullTest,
  summarizeFpr,
  wilsonInterval,
} from "../tools/e2/inferenceHardening";
import { DEFAULT_SURROGATE_CONFIG, type SurrogateConfig } from "../tools/e2/surrogateInference";
import {
  commonNoisePair,
  commonTrendPair,
  degenerateSeries,
  independentPair,
  laggedPair,
  nonStationaryPair,
  pointsFrom,
  type SyntheticPair,
} from "../tools/e2/syntheticSeries";

const CHUNKS = ["null", "alternative", "stress"] as const;
type Chunk = (typeof CHUNKS)[number];

interface SyntheticScenario {
  id: string;
  kind: "null" | "alternative" | "stress";
  make: (seed: number) => SyntheticPair;
  expected: {
    independent: boolean;
    lagged: boolean;
    knownLag: number | null;
    direction: "positive" | "negative" | "none" | "mixed";
    interpretation: string;
  };
}

const scenarios: SyntheticScenario[] = [
  {
    id: "null-independent-phi0-N160",
    kind: "null",
    make: (seed) => independentPair(seed, 160, { phi: 0, distribution: "gaussian" }, { phi: 0, distribution: "gaussian" }),
    expected: { independent: true, lagged: false, knownLag: null, direction: "none", interpretation: "Nullo: nessuna dipendenza cross-serie attesa." },
  },
  {
    id: "null-independent-phi065-N271",
    kind: "null",
    make: (seed) => independentPair(seed, 271, { phi: 0.65, distribution: "gaussian" }, { phi: 0.65, distribution: "gaussian" }),
    expected: { independent: true, lagged: false, knownLag: null, direction: "none", interpretation: "Nullo autocorrelato: nessuna dipendenza cross-serie attesa." },
  },
  {
    id: "alternative-positive-lag3-phi025-N271",
    kind: "alternative",
    make: (seed) => laggedPair(seed, 271, { phi: 0.25, distribution: "gaussian", lag: 3, strength: 1 }),
    expected: { independent: false, lagged: true, knownLag: 3, direction: "positive", interpretation: "Alternativa: b[t] contiene a[t-3] con segno positivo." },
  },
  {
    id: "alternative-positive-lag7-phi065-N271",
    kind: "alternative",
    make: (seed) => laggedPair(seed, 271, { phi: 0.65, distribution: "gaussian", lag: 7, strength: 1 }),
    expected: { independent: false, lagged: true, knownLag: 7, direction: "positive", interpretation: "Alternativa a lag lungo: b[t] contiene a[t-7]." },
  },
  {
    id: "alternative-negative-lag3-phi025-N271",
    kind: "alternative",
    make: (seed) => laggedPair(seed, 271, { phi: 0.25, distribution: "gaussian", lag: 3, strength: -1 }),
    expected: { independent: false, lagged: true, knownLag: 3, direction: "negative", interpretation: "Alternativa negativa: b[t] contiene -a[t-3]." },
  },
  {
    id: "stress-common-trend-N271",
    kind: "stress",
    make: (seed) => commonTrendPair(seed, 271, { phi: 0.65, distribution: "gaussian" }),
    expected: { independent: false, lagged: false, knownLag: null, direction: "mixed", interpretation: "Trend comune non stazionario: rigetto possibile ma non sequenzialità causale." },
  },
  {
    id: "stress-common-noise-N271",
    kind: "stress",
    make: (seed) => commonNoisePair(seed, 271, 0.7),
    expected: { independent: false, lagged: false, knownLag: 0, direction: "mixed", interpretation: "Rumore comune simultaneo: segnale non sequenziale." },
  },
  {
    id: "stress-nonstationary-N271",
    kind: "stress",
    make: (seed) => nonStationaryPair(seed, 271),
    expected: { independent: true, lagged: false, knownLag: null, direction: "none", interpretation: "Regime shift indipendente: stazionarietà violata, esito non interpretabile come causalità." },
  },
  {
    id: "stress-many-ties-N271",
    kind: "stress",
    make: (seed) => independentPair(seed, 271,
      { phi: 0.25, distribution: "gaussian", tieFraction: 0.75 },
      { phi: 0.25, distribution: "gaussian", tieFraction: 0.75 }, "many_ties"),
    expected: { independent: true, lagged: false, knownLag: null, direction: "none", interpretation: "Nullo con molti valori ripetuti: verifica robustezza del controllo FPR." },
  },
  {
    id: "stress-degenerate-constant-N100",
    kind: "stress",
    make: () => {
      const values = degenerateSeries("constant", 100);
      return { a: values, b: [...values], groundTruth: { independent: true, lagged: false, knownLag: null, expectedDirection: "none", scenario: "degenerate_constant" } };
    },
    expected: { independent: true, lagged: false, knownLag: null, direction: "none", interpretation: "Serie costante: deve essere NON_VALUTABILE." },
  },
  {
    id: "stress-near-constant-N100",
    kind: "stress",
    make: () => {
      const values = degenerateSeries("near-constant", 100);
      return { a: values, b: [...values], groundTruth: { independent: true, lagged: false, knownLag: null, expectedDirection: "none", scenario: "near_constant" } };
    },
    expected: { independent: true, lagged: false, knownLag: null, direction: "none", interpretation: "Serie quasi costante: deve essere NON_VALUTABILE." },
  },
];

const seedFor = (scenarioId: string, replicate: number): number => {
  let hash = 2166136261 >>> 0;
  for (const character of `${scenarioId}|synthetic|${replicate}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const rate = (count: number, total: number): number => total === 0 ? 0 : count / total;

describe("E2.2.1 synthetic ground-truth validation", () => {
  it(
    "measures FPR, power, lag/direction accuracy and non-evaluable rates",
    () => {
      const chunk = (process.env.E2_HARDENING_SYNTHETIC_CHUNK ?? "") as Chunk;
      if (!CHUNKS.includes(chunk)) throw new Error(`unknown or missing chunk: ${chunk}`);
      const replicates = Number(process.env.E2_HARDENING_SYNTHETIC_REPLICATES ?? "100");
      if (!Number.isInteger(replicates) || replicates < 30) throw new Error("at least 30 replicates required");
      const config: SurrogateConfig = {
        ...DEFAULT_SURROGATE_CONFIG,
        surrogates: 49,
        iterations: 12,
        seed: 0x5eed1234,
        alpha: QA_ACCEPTANCE.alpha,
        minOverlappingObservations: 30,
      };
      const maxLag = 20;
      const rows: Array<Record<string, unknown>> = [];

      for (const scenario of scenarios.filter((candidate) => candidate.kind === chunk)) {
        const pValues: number[] = [];
        const halfSignificant = [0, 0];
        const halfEvaluable = [0, 0];
        let nonEvaluable = 0;
        let significant = 0;
        let correctLag = 0;
        let correctDirection = 0;
        let validSurrogateTotal = 0;
        for (let replicate = 0; replicate < replicates; replicate++) {
          const seed = seedFor(scenario.id, replicate);
          const pair = scenario.make(seed);
          const test = runHardenedSurrogateNullTest(scenario.id, seed,
            pointsFrom(pair.a, 1), pointsFrom(pair.b, 1), maxLag, config);
          const half = replicate < Math.ceil(replicates / 2) ? 0 : 1;
          if (test.status === "NON_VALUTABILE") {
            nonEvaluable++;
            continue;
          }
          pValues.push(test.pValue);
          halfEvaluable[half]++;
          validSurrogateTotal += test.quality.validSurrogates;
          if (test.pValue < QA_ACCEPTANCE.alpha) {
            significant++;
            halfSignificant[half]++;
          }
          if (test.observedLag === scenario.expected.knownLag) correctLag++;
          if (scenario.expected.direction !== "none" && test.observedCorrelation !== null) {
            const observedPositive = (test.observedCorrelation as number) > 0;
            if (scenario.expected.direction === "positive" && observedPositive) correctDirection++;
            if (scenario.expected.direction === "negative" && !observedPositive) correctDirection++;
          }
        }
        const summary = summarizeFpr(pValues, QA_ACCEPTANCE.alpha, nonEvaluable, config.surrogates);
        const evaluable = pValues.length;
        const outcomeLabel = scenario.kind === "null" ? "fpr" : scenario.kind === "alternative" ? "power" : "rejection_rate";
        const halfRates = halfEvaluable.map((total, index) => rate(halfSignificant[index], total));
        rows.push({
          scenario: scenario.id,
          kind: scenario.kind,
          groundTruth: scenario.expected,
          outcome: outcomeLabel,
          replicates,
          evaluable,
          nonEvaluable,
          nonEvaluableRate: summary.nonEvaluableRate,
          nonEvaluableCi95: wilsonInterval(nonEvaluable, replicates),
          outcomeRate: rate(significant, evaluable),
          outcomeCi95: wilsonInterval(significant, evaluable),
          meanPValue: summary.meanPValue,
          medianPValue: summary.medianPValue,
          ksDistanceDiscrete: summary.ksDistanceUniform,
          lagAccuracy: scenario.kind === "alternative" ? rate(correctLag, evaluable) : null,
          directionAccuracy: scenario.kind === "alternative" ? rate(correctDirection, evaluable) : null,
          robustness: {
            firstHalfRate: halfRates[0],
            secondHalfRate: halfRates[1],
            absoluteDifference: Math.abs(halfRates[0] - halfRates[1]),
            note: "Split-half sullo stesso scenario; non una replica indipendente.",
          },
          meanValidSurrogates: evaluable === 0 ? 0 : validSurrogateTotal / evaluable,
          pValueQuantiles: summary.quantiles,
        });
      }
      expect(rows.length).toBeGreaterThan(0);
      const output = {
        schema: "evoworld.e2.hardening-synthetic-validation.v1",
        chunk,
        executedAt: process.env.E2_HARDENING_SYNTHETIC_EXECUTED_AT ?? new Date().toISOString(),
        runtime: { node: process.version, v8: process.versions.v8 },
        protocol: {
          replicatesPerScenario: replicates,
          surrogatesPerTest: config.surrogates,
          iterations: config.iterations,
          alpha: QA_ACCEPTANCE.alpha,
          maxLag,
          separation: "I dati sintetici non entrano nelle conclusioni biologiche E2.2; validano solo il metodo.",
        },
        rows,
      };
      const outputPath = resolveOutputPath(process.env.E2_HARDENING_SYNTHETIC_OUT);
      writeExperimentOutput(outputPath, output);
      process.stdout.write(`E2.2.1 synthetic ${chunk}: ${rows.length} scenarios, output=${outputPath}\n`);
      process.stdout.write(`${JSON.stringify(rows.map((row) => ({
        scenario: row.scenario,
        outcome: row.outcome,
        outcomeRate: row.outcomeRate,
        nonEvaluableRate: row.nonEvaluableRate,
        lagAccuracy: row.lagAccuracy,
        directionAccuracy: row.directionAccuracy,
      })), null, 2)}\n`);
    },
    3_000_000,
  );
});
