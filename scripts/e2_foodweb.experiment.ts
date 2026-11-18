/** E2.2 — blocco sperimentale trofico (S04/S05/S06, seeds e orizzonte configurabili). */
import { describe, it } from "vitest";
import { collectResults, resolveOutputPath, writeExperimentOutput } from "../tools/e1/experiment";
import { buildFoodWebReport, type FoodWebProtocol } from "../tools/e2/foodWebReport";
import { buildE2FoodWebScenarios, E2_FOODWEB_SCENARIO_IDS } from "../tools/e2/scenarios";

const parseSeeds = (value: string | undefined): number[] => {
  const seeds = (value ?? "1,2,3,4,5,6,7,8,9,10,11,12")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((seed) => Number.isInteger(seed) && seed > 0);
  return seeds.length ? seeds : [1];
};

const parsePositiveInt = (value: string | undefined, fallback: number, name: string): number => {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
};

describe("E2.2 food web experiment", () => {
  it(
    "runs trophic scenarios with additive E2 analysis",
    () => {
      const label = process.env.E2_FOODWEB_LABEL ?? "main";
      const seeds = parseSeeds(process.env.E2_FOODWEB_SEEDS);
      const ticks = parsePositiveInt(process.env.E2_FOODWEB_TICKS, 2700, "E2_FOODWEB_TICKS");
      const sampleEvery = parsePositiveInt(process.env.E2_FOODWEB_SAMPLE_EVERY, 10, "E2_FOODWEB_SAMPLE_EVERY");
      const maxLag = parsePositiveInt(process.env.E2_FOODWEB_MAX_LAG, 200, "E2_FOODWEB_MAX_LAG");
      if (maxLag > ticks) throw new Error("E2_FOODWEB_MAX_LAG cannot exceed E2_FOODWEB_TICKS");
      const scenarioIds = process.env.E2_FOODWEB_SCENARIOS
        ? process.env.E2_FOODWEB_SCENARIOS.split(",").map((value) => value.trim()).filter(Boolean)
        : [...E2_FOODWEB_SCENARIO_IDS];
      if (scenarioIds.length === 0) throw new Error("E2_FOODWEB_SCENARIOS is empty");

      const scenarios = buildE2FoodWebScenarios({ seeds, ticks, sampleEvery, scenarioIds });
      const protocol: FoodWebProtocol = {
        experiment: "E2.2 food web dynamics: trait abundance, kills and lagged sequencing",
        seeds, ticks, sampleEvery, maxLag, scenarioIds: [...scenarioIds], label,
      };
      const started = Date.now();
      let completed = 0;
      const results = collectResults(scenarios, (result) => {
        completed++;
        process.stdout.write(`E2.2 ${label} ${completed}/${scenarios.length}: ${result.scenario} seed=${result.seed}\n`);
      });
      const scientificReport = buildFoodWebReport(results, protocol, maxLag);
      const payload = {
        schema: "evoworld.e2.foodweb-block.v1",
        phase: "E2.2-foodweb",
        label,
        executedAt: new Date().toISOString(),
        runtime: { node: process.version, v8: process.versions.v8 },
        env: { SEEDS: seeds, TICKS: ticks, SAMPLE_EVERY: sampleEvery, MAX_LAG: maxLag, SCENARIOS: scenarioIds },
        protocol,
        scientificReport,
        results,
        timing: { totalElapsedMs: Date.now() - started },
      };
      const outputPath = resolveOutputPath(process.env.E2_FOODWEB_OUT);
      writeExperimentOutput(outputPath, payload);
      process.stdout.write(
        `E2.2 ${label} complete: ${results.length} runs, ${scientificReport.pairedComparisons.length} paired comparisons, output=${outputPath}\n`,
      );
    },
    3_000_000,
  );
});
