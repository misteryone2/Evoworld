/** E2.1 — pilota di stabilita' demografica, preda-predatore e resilienza. */
import { describe, it } from "vitest";
import { collectResults, resolveOutputPath, writeExperimentOutput } from "../tools/e1/experiment";
import { buildE2PilotScenarios, E2_PILOT_SCENARIO_IDS } from "../tools/e2/scenarios";
import { buildE2Report, type E2Protocol } from "../tools/e2/experiment";

const parseSeeds = (value: string | undefined): number[] => {
  const seeds = (value ?? "1,2,3,4,5,6,7,8,9,10,11,12")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return seeds.length ? seeds : [1];
};

describe("E2.1 population pilot", () => {
  it(
    "runs E1 scenarios with E2 additive analysis",
    () => {
      const env = {
        SEEDS: parseSeeds(process.env.E2_PILOT_SEEDS),
        TICKS: Number(process.env.E2_PILOT_TICKS ?? "900"),
        SAMPLE_EVERY: Number(process.env.E2_PILOT_SAMPLE_EVERY ?? "10"),
        OUT: resolveOutputPath(process.env.E2_PILOT_OUT),
      };
      if (!Number.isInteger(env.TICKS) || env.TICKS <= 0) throw new Error("E2_PILOT_TICKS must be positive");
      if (!Number.isInteger(env.SAMPLE_EVERY) || env.SAMPLE_EVERY <= 0) throw new Error("E2_PILOT_SAMPLE_EVERY must be positive");

      const scenarios = buildE2PilotScenarios({
        seeds: env.SEEDS,
        ticks: env.TICKS,
        sampleEvery: env.SAMPLE_EVERY,
      });
      const protocol: E2Protocol = {
        experiment: "E2.1 population stability / predator-prey / resilience pilot",
        seeds: env.SEEDS,
        ticks: env.TICKS,
        sampleEvery: env.SAMPLE_EVERY,
        scenarioIds: [...E2_PILOT_SCENARIO_IDS],
      };
      const started = Date.now();
      let completed = 0;
      const results = collectResults(scenarios, (result) => {
        completed++;
        process.stdout.write(`E2 pilot ${completed}/${scenarios.length}: ${result.scenario} seed=${result.seed}\n`);
      });
      const scientificReport = buildE2Report(results, protocol);
      const payload = {
        schema: "evoworld.e2.pilot.v1",
        phase: "E2.1-pilot",
        executedAt: new Date().toISOString(),
        runtime: { node: process.version, v8: process.versions.v8 },
        env: { SEEDS: env.SEEDS, TICKS: env.TICKS, SAMPLE_EVERY: env.SAMPLE_EVERY },
        protocol,
        scientificReport,
        results,
        timing: { totalElapsedMs: Date.now() - started },
      };
      writeExperimentOutput(env.OUT, payload);
      process.stdout.write(
        `E2 pilot complete: ${results.length} runs, ${scientificReport.pairedComparisons.length} paired comparisons, output=${env.OUT}\n`,
      );
    },
    3_000_000,
  );
});
