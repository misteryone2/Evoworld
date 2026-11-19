/** E2.2.1 — stabilità al numero di surrogati e al budget di iterazioni IAAFT. */
import { describe, expect, it } from "vitest";
import { resolveOutputPath, writeExperimentOutput } from "../tools/e1/experiment";
import {
  QA_ACCEPTANCE,
  runHardenedSurrogateNullTest,
  summarizeFpr,
  wilsonInterval,
  type HardenedSurrogateNullTest,
} from "../tools/e2/inferenceHardening";
import { DEFAULT_SURROGATE_CONFIG, type SurrogateConfig } from "../tools/e2/surrogateInference";
import {
  independentPair,
  laggedPair,
  pointsFrom,
  type SyntheticPair,
} from "../tools/e2/syntheticSeries";

const CHUNKS = ["surrogates", "iterations"] as const;
type Chunk = (typeof CHUNKS)[number];
const SURROGATE_COUNTS = [49, 99, 199] as const;
const ITERATION_BUDGETS = [2, 6, 12, 24] as const;

interface Scenario {
  id: string;
  kind: "null" | "alternative";
  length: number;
  phi: number;
  lag?: number;
  strength?: number;
  make: (seed: number) => SyntheticPair;
}

const scenarios: Scenario[] = [
  {
    id: "null-phi0-N271",
    kind: "null",
    length: 271,
    phi: 0,
    make: (seed) => independentPair(seed, 271, { phi: 0 }, { phi: 0 }),
  },
  {
    id: "null-phi065-N160",
    kind: "null",
    length: 160,
    phi: 0.65,
    make: (seed) => independentPair(seed, 160, { phi: 0.65 }, { phi: 0.65 }),
  },
  {
    id: "alternative-lag3-phi025-N271",
    kind: "alternative",
    length: 271,
    phi: 0.25,
    lag: 3,
    strength: 1,
    make: (seed) => laggedPair(seed, 271, { phi: 0.25, lag: 3, strength: 1 }),
  },
];

const seedFor = (scenarioId: string, replicate: number): number => {
  let hash = 2166136261 >>> 0;
  for (const character of `${scenarioId}|stability|${replicate}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const rate = (count: number, total: number): number => total === 0 ? 0 : count / total;

const directionMatches = (test: HardenedSurrogateNullTest, scenario: Scenario): boolean => {
  if (test.observedCorrelation === null) return false;
  const expected = scenario.strength !== undefined && scenario.strength < 0 ? "negative" : "positive";
  return expected === "positive"
    ? (test.observedCorrelation as number) > 0
    : (test.observedCorrelation as number) < 0;
};

describe("E2.2.1 configuration stability", () => {
  it(
    "compares FPR, power, QA failures and timing across pre-registered configurations",
    () => {
      const chunk = (process.env.E2_HARDENING_STABILITY_CHUNK ?? "") as Chunk;
      if (!CHUNKS.includes(chunk)) throw new Error(`unknown or missing chunk: ${chunk}`);
      const replicates = Number(process.env.E2_HARDENING_STABILITY_REPLICATES ?? "80");
      if (!Number.isInteger(replicates) || replicates < 30) throw new Error("at least 30 replicates required");
      const maxLag = 20;
      const rows: Array<Record<string, unknown>> = [];
      const configurations = chunk === "surrogates"
        ? SURROGATE_COUNTS.map((surrogates) => ({ label: `B${surrogates}`, surrogates, iterations: 12 }))
        : ITERATION_BUDGETS.map((iterations) => ({ label: `I${iterations}`, surrogates: 49, iterations }));

      for (const scenario of scenarios) {
        for (const configuration of configurations) {
          const config: SurrogateConfig = {
            ...DEFAULT_SURROGATE_CONFIG,
            surrogates: configuration.surrogates,
            iterations: configuration.iterations,
            seed: 0x5eed1234,
            alpha: QA_ACCEPTANCE.alpha,
            minOverlappingObservations: 30,
          };
          const pValues: number[] = [];
          let nonEvaluable = 0;
          let significant = 0;
          let correctLag = 0;
          let correctDirection = 0;
          let spectralTotal = 0;
          let spectralCount = 0;
          let converged = 0;
          let surrogateTotal = 0;
          let validSurrogateTotal = 0;
          for (let replicate = 0; replicate < replicates; replicate++) {
            const seed = seedFor(scenario.id, replicate);
            const pair = scenario.make(seed);
            const test = runHardenedSurrogateNullTest(scenario.id, seed,
              pointsFrom(pair.a, 1), pointsFrom(pair.b, 1), maxLag, config);
            if (test.status === "NON_VALUTABILE") {
              nonEvaluable++;
              continue;
            }
            pValues.push(test.pValue);
            if (test.pValue < QA_ACCEPTANCE.alpha) significant++;
            if (test.observedLag === (scenario.lag ?? null)) correctLag++;
            if (scenario.kind === "alternative" && directionMatches(test, scenario)) correctDirection++;
            const records = test.quality.surrogates.filter((record) => record.valid);
            for (const record of records) {
              spectralTotal += record.finalSpectralErrorA + record.finalSpectralErrorB;
              spectralCount += 2;
            }
            converged += test.convergence.convergedSurrogates;
            surrogateTotal += test.convergence.totalSurrogates;
            validSurrogateTotal += test.quality.validSurrogates;
          }
          const summary = summarizeFpr(pValues, QA_ACCEPTANCE.alpha, nonEvaluable, configuration.surrogates);
          const evaluable = pValues.length;
          const outcomeRate = rate(significant, evaluable);
          rows.push({
            scenario: scenario.id,
            kind: scenario.kind,
            configuration: configuration.label,
            surrogates: configuration.surrogates,
            iterations: configuration.iterations,
            replicates,
            evaluable,
            nonEvaluable,
            nonEvaluableRate: summary.nonEvaluableRate,
            nonEvaluableCi95: wilsonInterval(nonEvaluable, replicates),
            outcome: scenario.kind === "null" ? "false_positive_rate" : "power",
            outcomeRate,
            outcomeCi95: wilsonInterval(significant, evaluable),
            meanPValue: summary.meanPValue,
            ksDistanceDiscrete: summary.ksDistanceUniform,
            lagAccuracy: scenario.kind === "alternative" ? rate(correctLag, evaluable) : null,
            directionAccuracy: scenario.kind === "alternative" ? rate(correctDirection, evaluable) : null,
            meanFinalSpectralError: spectralCount === 0 ? null : spectralTotal / spectralCount,
            convergenceFraction: surrogateTotal === 0 ? null : converged / surrogateTotal,
            meanValidSurrogates: evaluable === 0 ? 0 : validSurrogateTotal / evaluable,
          });
        }
      }
      expect(rows.length).toBe(scenarios.length * configurations.length);
      const output = {
        schema: "evoworld.e2.hardening-stability.v1",
        chunk,
        executedAt: process.env.E2_HARDENING_STABILITY_EXECUTED_AT ?? new Date().toISOString(),
        runtime: { node: process.version, v8: process.versions.v8 },
        protocol: {
          replicatesPerCell: replicates,
          maxLag,
          unit: "independent synthetic dataset",
          chunks: CHUNKS,
          configurationNote: chunk === "surrogates"
            ? "B varies at fixed 12 IAAFT iterations; p grid changes with B."
            : "IAAFT budget varies at fixed B=49; spectral error and convergence are diagnostic outputs.",
        },
        rows,
      };
      const outputPath = resolveOutputPath(process.env.E2_HARDENING_STABILITY_OUT);
      writeExperimentOutput(outputPath, output);
      process.stdout.write(`E2.2.1 stability ${chunk}: ${rows.length} rows, output=${outputPath}\n`);
      process.stdout.write(`${JSON.stringify(rows.map((row) => ({
        scenario: row.scenario,
        configuration: row.configuration,
        outcomeRate: row.outcomeRate,
        nonEvaluableRate: row.nonEvaluableRate,
      })), null, 2)}\n`);
    },
    3_000_000,
  );
});
