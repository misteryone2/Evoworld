/** E2.2 review — rigenera le analisi dai risultati grezzi senza rieseguire il motore. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { resolveOutputPath, writeExperimentOutput } from "../tools/e1/experiment";
import type { RunResult } from "../tools/e1/runner";
import { buildFoodWebReport, type FoodWebProtocol } from "../tools/e2/foodWebReport";
import { DEFAULT_SURROGATE_CONFIG, type SurrogateConfig } from "../tools/e2/surrogateInference";

interface BlockPayload {
  schema: string;
  label: string;
  executedAt: string;
  runtime: { node: string; v8: string };
  env: { SEEDS: number[]; TICKS: number; SAMPLE_EVERY: number; MAX_LAG: number; SCENARIOS: string[] };
  protocol: FoodWebProtocol;
  scientificReport: unknown;
  results: unknown[];
}

const surrogateConfig: SurrogateConfig = {
  ...DEFAULT_SURROGATE_CONFIG,
  surrogates: 199,
  iterations: 12,
  seed: 0x5eed1234,
  alpha: 0.05,
  minOverlappingObservations: 30,
  pairIds: [],
};

const readBlock = (value: string | undefined, name: string): { payload: BlockPayload; sha256: string } => {
  if (!value) throw new Error(`${name} is required`);
  const text = readFileSync(resolveOutputPath(value), "utf8");
  const payload = JSON.parse(text) as BlockPayload;
  if (payload.schema !== "evoworld.e2.foodweb-block.v1" || !Array.isArray(payload.results)) {
    throw new Error(`${name}: expected evoworld.e2.foodweb-block.v1`);
  }
  return { payload, sha256: createHash("sha256").update(text).digest("hex") };
};

describe("E2.2 review reanalysis", () => {
  it(
    "rebuilds corrected scientific reports from the original block results",
    () => {
      const blocks = [
        { name: "main", block: readBlock(process.env.E2_FOODWEB_REANALYSIS_MAIN, "E2_FOODWEB_REANALYSIS_MAIN") },
        { name: "seed", block: readBlock(process.env.E2_FOODWEB_REANALYSIS_SEED, "E2_FOODWEB_REANALYSIS_SEED") },
        { name: "duration", block: readBlock(process.env.E2_FOODWEB_REANALYSIS_DURATION, "E2_FOODWEB_REANALYSIS_DURATION") },
        { name: "sampling", block: readBlock(process.env.E2_FOODWEB_REANALYSIS_SAMPLING, "E2_FOODWEB_REANALYSIS_SAMPLING") },
      ];
      const outputs: Record<string, { artifact: string; sha256: string; runs: number; scenarios: number }> = {};
      for (const { name, block } of blocks) {
        const source = block.payload;
        const protocol: FoodWebProtocol = {
          ...source.protocol,
          label: `${source.label}-review`,
          surrogate: { ...surrogateConfig },
        };
        const scientificReport = buildFoodWebReport(source.results as RunResult[], protocol, source.env.MAX_LAG);
        const output = {
          schema: source.schema,
          phase: "E2.2-foodweb-review",
          label: `${source.label}-review`,
          executedAt: process.env.E2_FOODWEB_REANALYSIS_EXECUTED_AT ?? new Date().toISOString(),
          runtime: { node: process.version, v8: process.versions.v8 },
          env: source.env,
          protocol,
          scientificReport,
          results: source.results,
          review: {
            schema: "evoworld.e2.foodweb-reanalysis.v1",
            sourceBlockSha256: block.sha256,
            sourceLabel: source.label,
            sourceExecutedAt: source.executedAt,
            surrogateConfig,
            note: "Risultati grezzi invarianti; solo analisi scientifica rigenerata con segno r/lag separato, diagnostica dei lag e null IAAFT a lunghezza esatta (Cooley-Tukey/Rader, nessun padding o troncamento) con massimo su tutti i lag.",
            surrogateTransform: "exact-length DFT; convergence criterion: normalized amplitude-spectrum error after rank remapping, tolerance 1e-3, iteration budget recorded per test",
          },
        };
        const outputPath = resolveOutputPath(process.env[`E2_FOODWEB_REANALYSIS_${name.toUpperCase()}_OUT`]);
        writeExperimentOutput(outputPath, output);
        const written = readFileSync(outputPath, "utf8");
        outputs[name] = {
          artifact: outputPath,
          sha256: createHash("sha256").update(written).digest("hex"),
          runs: source.results.length,
          scenarios: scientificReport.byScenario.length,
        };
        process.stdout.write(`E2.2 reanalysis ${name}: ${source.results.length} runs, output=${outputPath}\n`);
      }
      process.stdout.write(`${JSON.stringify(outputs, null, 2)}\n`);
    },
    600_000,
  );
});
