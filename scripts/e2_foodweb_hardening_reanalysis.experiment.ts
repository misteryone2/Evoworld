/** E2.2.1 — rigenera un blocco di analisi con il protocollo inferenziale hardening. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { resolveOutputPath, writeExperimentOutput } from "../tools/e1/experiment";
import type { RunResult } from "../tools/e1/runner";
import {
  FOOD_WEB_PAIRS,
  assessPairSequencing,
  buildFoodWebReport,
  type DependenceAssessment,
  type FoodWebProtocol,
  type FoodWebReport,
  type PairCorrelationSummary,
  type SequencingVerdict,
} from "../tools/e2/foodWebReport";
import {
  QA_ACCEPTANCE,
  combineHardenedEvidence,
  compactQualityForReport,
  runHardenedSurrogateNullTest,
  type HardenedCombinedEvidence,
  type HardenedSurrogateNullTest,
} from "../tools/e2/inferenceHardening";
import { DEFAULT_SURROGATE_CONFIG, type SurrogateConfig } from "../tools/e2/surrogateInference";
import { trophicSeriesSet } from "../tools/e2/trophic";

const BLOCKS = ["main", "seed", "duration", "sampling"] as const;
type Block = (typeof BLOCKS)[number];

const hardenedConfig: SurrogateConfig = {
  ...DEFAULT_SURROGATE_CONFIG,
  surrogates: 199,
  iterations: 12,
  seed: 0x5eed1234,
  alpha: QA_ACCEPTANCE.alpha,
  minOverlappingObservations: 30,
  pairIds: [],
};

interface BlockPayload {
  schema: string;
  label: string;
  executedAt: string;
  runtime: { node: string; v8: string };
  env: { SEEDS: number[]; TICKS: number; SAMPLE_EVERY: number; MAX_LAG: number; SCENARIOS: string[] };
  protocol: FoodWebProtocol;
  results: RunResult[];
}

interface PriorReport {
  scientificReport?: {
    byScenario?: Array<{
      scenario: string;
      sequencingByPair?: Record<string, { sequencing?: { verdict?: SequencingVerdict } }>;
    }>;
  };
}

const readJson = <T,>(value: string | undefined, name: string): T => {
  if (!value) throw new Error(`${name} is required`);
  return JSON.parse(readFileSync(resolveOutputPath(value), "utf8")) as T;
};

describe("E2.2.1 hardened biological reanalysis", () => {
  it(
    "rebuilds one block from unchanged raw results with explicit surrogate QA",
    () => {
      const block = (process.env.E2_HARDENING_REANALYSIS_ONLY ?? "") as Block;
      if (!BLOCKS.includes(block)) throw new Error(`unknown or missing block: ${block}`);
      const envName = `E2_HARDENING_REANALYSIS_${block.toUpperCase()}`;
      const rawText = readFileSync(resolveOutputPath(process.env[envName]), "utf8");
      const source = JSON.parse(rawText) as BlockPayload;
      if (source.schema !== "evoworld.e2.foodweb-block.v1" || !Array.isArray(source.results)) {
        throw new Error(`${envName}: expected evoworld.e2.foodweb-block.v1`);
      }
      const sourceSha256 = createHash("sha256").update(rawText).digest("hex");
      const prior = process.env[`E2_HARDENING_REANALYSIS_PRIOR_${block.toUpperCase()}`]
        ? readJson<PriorReport>(process.env[`E2_HARDENING_REANALYSIS_PRIOR_${block.toUpperCase()}`], `prior ${block}`)
        : null;

      const protocol: FoodWebProtocol = {
        ...source.protocol,
        label: `${source.label}-hardening`,
        surrogate: { enabled: false },
      };
      const report = buildFoodWebReport(source.results, protocol, source.env.MAX_LAG) as FoodWebReport;
      const runBySeed = new Map(source.results.map((run) => [run.seed, run]));
      let tests = 0;
      let evaluableTests = 0;
      let validSurrogates = 0;
      let rejectedSurrogates = 0;
      let nonConvergedAccepted = 0;
      const invalidReasonCounts = new Map<string, number>();

      for (const scenario of report.byScenario) {
        const priorScenario = prior?.scientificReport?.byScenario?.find((entry) => entry.scenario === scenario.scenario);
        for (const pair of FOOD_WEB_PAIRS) {
          const summary = scenario.correlations.find((entry) => entry.pairId === pair.id) as
            | PairCorrelationSummary
            | undefined;
          if (!summary) continue;
          const hardenedTests: HardenedSurrogateNullTest[] = [];
          for (const seed of summary.seeds) {
            const run = runBySeed.get(seed.seed);
            if (!run) continue;
            const series = trophicSeriesSet(run);
            const test = runHardenedSurrogateNullTest(pair.id, run.seed,
              series[pair.a], series[pair.b], source.env.MAX_LAG, hardenedConfig);
            tests++;
            if (test.status === "VALUTABILE") {
              evaluableTests++;
              validSurrogates += test.quality.validSurrogates;
              rejectedSurrogates += test.quality.invalidSurrogates;
              nonConvergedAccepted += test.quality.nonConvergedAccepted;
            }
            for (const reason of test.quality.invalidReasonCounts) {
              invalidReasonCounts.set(reason.reason, (invalidReasonCounts.get(reason.reason) ?? 0) + reason.count);
            }
            hardenedTests.push(compactQualityForReport(test));
            seed.surrogate = test;
          }
          const combined = combineHardenedEvidence(hardenedTests, hardenedConfig.alpha) as HardenedCombinedEvidence
            & typeof summary.surrogate;
          summary.surrogate = combined;
          const assessment = assessPairSequencing(summary, scenario.scenario);
          const priorVerdict = priorScenario?.sequencingByPair?.[pair.id]?.sequencing?.verdict ?? null;
          const updated = {
            ...assessment,
            statistical: {
              ...assessment.statistical,
              verdictBefore: priorVerdict,
              verdictAfter: assessment.sequencing.verdict,
            },
          } as DependenceAssessment;
          scenario.sequencingByPair[pair.id] = updated;
        }
      }

      const output = {
        schema: "evoworld.e2.hardening-reanalysis-block.v1",
        block,
        label: `${source.label}-hardening`,
        executedAt: process.env.E2_HARDENING_REANALYSIS_EXECUTED_AT ?? new Date().toISOString(),
        runtime: { node: process.version, v8: process.versions.v8 },
        env: source.env,
        protocol: { ...protocol, surrogate: { ...hardenedConfig } },
        scientificReport: report,
        provenance: {
          rawBlockSha256: sourceSha256,
          rawBlockResults: source.results.length,
          originalLabel: source.label,
          originalExecutedAt: source.executedAt,
          qualityGate: QA_ACCEPTANCE,
          qualitySummary: {
            tests,
            evaluableTests,
            nonEvaluableTests: tests - evaluableTests,
            validSurrogates,
            rejectedSurrogates,
            nonConvergedAccepted,
            invalidReasonCounts: [...invalidReasonCounts.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([reason, count]) => ({ reason, count })),
          },
          note: "Nessuna simulazione biologica rieseguita: solo le serie derivate dai risultati grezzi invarianti sono state rianalizzate con QA per-surrogato, degrado esplicito a NON_VALUTABILE e p-value con massimo sui lag accettati.",
        },
      };
      const outputPath = resolveOutputPath(process.env.E2_HARDENING_REANALYSIS_OUT);
      writeExperimentOutput(outputPath, output);
      process.stdout.write(`E2.2.1 hardened reanalysis ${block}: ${tests} tests, ${evaluableTests} evaluable, output=${outputPath}\n`);
    },
    3_000_000,
  );
});
