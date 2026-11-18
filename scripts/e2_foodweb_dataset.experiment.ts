/** E2.2 — dataset riproducibile, manifest e checksum sorgente. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { resolveOutputPath } from "../tools/e1/experiment";
import type { RunResult } from "../tools/e1/runner";
import { checksumSources, e1SourceFiles, e2SourceFiles, writeDataset } from "../tools/e2/dataset";

interface BlockPayload {
  schema: string;
  label: string;
  env: { SEEDS: number[]; TICKS: number; SAMPLE_EVERY: number; MAX_LAG: number; SCENARIOS: string[] };
  scientificReport: unknown;
  results: RunResult[];
}

interface SensitivityPayload {
  schema: string;
  [key: string]: unknown;
}

const readJson = <T extends { schema: string }>(value: string | undefined, name: string, expectedSchema: string): {
  payload: T;
  text: string;
  sha256: string;
} => {
  if (!value) throw new Error(`${name} is required`);
  const text = readFileSync(resolveOutputPath(value), "utf8");
  const payload = JSON.parse(text) as T;
  if (payload.schema !== expectedSchema) throw new Error(`${name}: expected ${expectedSchema}, received ${payload.schema}`);
  return { payload, text, sha256: createHash("sha256").update(text).digest("hex") };
};

describe("E2.2 food-web dataset", () => {
  it(
    "writes a reproducible E2.2 dataset with a clean provenance manifest",
    () => {
      const main = readJson<BlockPayload>(process.env.E2_FOODWEB_DATASET_MAIN, "E2_FOODWEB_DATASET_MAIN", "evoworld.e2.foodweb-block.v1");
      const seed = readJson<BlockPayload>(process.env.E2_FOODWEB_DATASET_SEED, "E2_FOODWEB_DATASET_SEED", "evoworld.e2.foodweb-block.v1");
      const duration = readJson<BlockPayload>(process.env.E2_FOODWEB_DATASET_DURATION, "E2_FOODWEB_DATASET_DURATION", "evoworld.e2.foodweb-block.v1");
      const sampling = readJson<BlockPayload>(process.env.E2_FOODWEB_DATASET_SAMPLING, "E2_FOODWEB_DATASET_SAMPLING", "evoworld.e2.foodweb-block.v1");
      const sensitivity = readJson<SensitivityPayload>(process.env.E2_FOODWEB_DATASET_SENSITIVITY, "E2_FOODWEB_DATASET_SENSITIVITY", "evoworld.e2.foodweb-sensitivity.v1");

      const outDir = resolveOutputPath(process.env.E2_FOODWEB_DATASET_OUT_DIR ?? "docs/research/e2/datasets");
      const label = process.env.E2_FOODWEB_DATASET_LABEL ?? "e2.2-foodweb";
      const codeCommit = process.env.E2_FOODWEB_DATASET_CODE_COMMIT;
      if (!codeCommit) throw new Error("E2_FOODWEB_DATASET_CODE_COMMIT is required");
      const dirtyFlag = process.env.E2_FOODWEB_DATASET_WORKING_TREE_DIRTY ?? "1";
      const workingTreeDirty = dirtyFlag === "1" || dirtyFlag.toLowerCase() === "true";
      // Timestamp fissabile: senza override la generazione non e' bit-riproducibile.
      const executedAt = process.env.E2_FOODWEB_DATASET_EXECUTED_AT ?? new Date().toISOString();
      const env = main.payload.env;

      const scientificReport = {
        main: main.payload.scientificReport,
        seedReplication: seed.payload.scientificReport,
        duration: duration.payload.scientificReport,
        sampling: sampling.payload.scientificReport,
        sensitivity: sensitivity.payload,
      };
      const reproduction = {
        env: {
          E2_FOODWEB_LABEL: "main",
          E2_FOODWEB_SEEDS: env.SEEDS.join(","),
          E2_FOODWEB_TICKS: String(env.TICKS),
          E2_FOODWEB_SAMPLE_EVERY: String(env.SAMPLE_EVERY),
          E2_FOODWEB_MAX_LAG: String(env.MAX_LAG),
          E2_FOODWEB_SCENARIOS: env.SCENARIOS.join(","),
        },
        command: [
          "E2_FOODWEB_LABEL=main E2_FOODWEB_SEEDS=1..12 E2_FOODWEB_TICKS=2700 E2_FOODWEB_SAMPLE_EVERY=10 E2_FOODWEB_MAX_LAG=200 E2_FOODWEB_OUT=<main>.json npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb.experiment.ts",
          "E2_FOODWEB_LABEL=seed E2_FOODWEB_SEEDS=13..24 E2_FOODWEB_TICKS=2700 E2_FOODWEB_SAMPLE_EVERY=10 E2_FOODWEB_OUT=<seed>.json npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb.experiment.ts",
          "E2_FOODWEB_LABEL=duration E2_FOODWEB_SEEDS=1..12 E2_FOODWEB_TICKS=900 E2_FOODWEB_SAMPLE_EVERY=10 E2_FOODWEB_OUT=<duration>.json npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb.experiment.ts",
          "E2_FOODWEB_LABEL=sampling E2_FOODWEB_SEEDS=1..12 E2_FOODWEB_TICKS=2700 E2_FOODWEB_SAMPLE_EVERY=5 E2_FOODWEB_SCENARIOS=S06_predator_prey_mixed E2_FOODWEB_OUT=<sampling>.json npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb.experiment.ts",
          "E2_FOODWEB_SENS_* npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_sensitivity.experiment.ts",
          "E2_FOODWEB_DATASET_* npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_dataset.experiment.ts",
        ].join("\n"),
      };

      const manifest = writeDataset(outDir, label, {
        phase: "E2.2-foodweb",
        experiment: "E2.2 food web dynamics: trait abundance, recorded kills, lagged sequencing and persistence",
        env,
        scientificReport,
        results: [
          ...main.payload.results,
          ...seed.payload.results,
          ...duration.payload.results,
          ...sampling.payload.results,
        ],
        executedAt,
        codeCommit,
        workingTreeDirty,
        sourceSha256: checksumSources(e2SourceFiles()),
        e1SourceSha256: checksumSources(e1SourceFiles()),
        runtime: { node: process.version, v8: process.versions.v8 },
        note: "Dataset E2.2: 120 corse (primaria, replica seed, durata, campionamento), analisi trofiche additive; sorgenti E2 e E1 tracciati separatamente. Tratti ≠ ruoli, kills ≠ mortalità totale, correlazione ≠ causalità.",
        reproduction,
        auxiliary: {
          inputs: {
            main: { label: main.payload.label, sha256: main.sha256, schema: main.payload.schema, runs: main.payload.results.length },
            seed: { label: seed.payload.label, sha256: seed.sha256, schema: seed.payload.schema, runs: seed.payload.results.length },
            duration: { label: duration.payload.label, sha256: duration.sha256, schema: duration.payload.schema, runs: duration.payload.results.length },
            sampling: { label: sampling.payload.label, sha256: sampling.sha256, schema: sampling.payload.schema, runs: sampling.payload.results.length },
            sensitivity: { sha256: sensitivity.sha256, schema: sensitivity.payload.schema },
          },
          reviewId: "E2.2-foodweb-2026-11-18",
        },
      });

      process.stdout.write(
        `E2.2 dataset written: ${manifest.artifact}\npayloadSha256=${manifest.payloadSha256}\narchiveSha256=${manifest.archiveSha256}\nsourceSha256=${manifest.sourceSha256}\ne1SourceSha256=${manifest.e1SourceSha256}\ncodeCommit=${manifest.codeCommit}\nworkingTreeDirty=${manifest.workingTreeDirty}\ntotalRuns=${manifest.totalRuns}\n`,
      );
    },
    120_000,
  );
});
