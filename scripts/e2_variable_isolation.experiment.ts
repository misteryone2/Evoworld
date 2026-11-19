/** E2.1 review — isolamento controllato di geometria, densita' e risorse. */
import { describe, it } from "vitest";
import { collectResults, resolveOutputPath, writeExperimentOutput } from "../tools/e1/experiment";
import { buildE2Report, type E2Protocol } from "../tools/e2/experiment";
import {
  buildIsolationComparisons,
  buildVariableIsolationScenarios,
  E2_ISOLATION_ARM_IDS,
  ISOLATION_RATIONALE,
} from "../tools/e2/isolation";
import { byScenario } from "../tools/e2/statistics";

const parseSeeds = (value: string | undefined): number[] => {
  const seeds = (value ?? "1,2,3,4,5,6,7,8,9,10,11,12")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return seeds.length ? seeds : [1];
};

describe("E2.1 variable isolation", () => {
  it(
    "runs controlled E1 arms with E2 additive analysis",
    () => {
      const env = {
        SEEDS: parseSeeds(process.env.E2_ISOLATION_SEEDS),
        TICKS: Number(process.env.E2_ISOLATION_TICKS ?? "900"),
        SAMPLE_EVERY: Number(process.env.E2_ISOLATION_SAMPLE_EVERY ?? "10"),
        OUT: resolveOutputPath(process.env.E2_ISOLATION_OUT),
      };
      if (!Number.isInteger(env.TICKS) || env.TICKS <= 0) throw new Error("E2_ISOLATION_TICKS must be positive");
      if (!Number.isInteger(env.SAMPLE_EVERY) || env.SAMPLE_EVERY <= 0) throw new Error("E2_ISOLATION_SAMPLE_EVERY must be positive");

      const scenarios = buildVariableIsolationScenarios({
        seeds: env.SEEDS,
        ticks: env.TICKS,
        sampleEvery: env.SAMPLE_EVERY,
      });
      const protocol: E2Protocol = {
        experiment: "E2.1 review: controlled isolation of geometry, density and resources",
        seeds: env.SEEDS,
        ticks: env.TICKS,
        sampleEvery: env.SAMPLE_EVERY,
        scenarioIds: [...E2_ISOLATION_ARM_IDS],
      };
      const started = Date.now();
      let completed = 0;
      const results = collectResults(scenarios, (result) => {
        completed++;
        process.stdout.write(`E2 isolation ${completed}/${scenarios.length}: ${result.scenario} seed=${result.seed}\n`);
      });
      const baseReport = buildE2Report(results, protocol);
      const scientificReport = {
        ...baseReport,
        pairedComparisons: buildIsolationComparisons(byScenario(results)),
        note: "Confronti appaiati per seed su seed non randomizzati: differenze osservate, non causalita'. Ogni contrasto dichiarato modifica una sola variabile.",
      };
      const payload = {
        schema: "evoworld.e2.isolation.v1",
        phase: "E2.1-review-isolation",
        executedAt: new Date().toISOString(),
        runtime: { node: process.version, v8: process.versions.v8 },
        env: { SEEDS: env.SEEDS, TICKS: env.TICKS, SAMPLE_EVERY: env.SAMPLE_EVERY },
        protocol,
        rationale: ISOLATION_RATIONALE,
        scientificReport,
        results,
        timing: { totalElapsedMs: Date.now() - started },
      };
      writeExperimentOutput(env.OUT, payload);
      process.stdout.write(
        `E2 isolation complete: ${results.length} runs, ${scientificReport.pairedComparisons.length} paired comparisons, output=${env.OUT}\n`,
      );
    },
    3_000_000,
  );
});
