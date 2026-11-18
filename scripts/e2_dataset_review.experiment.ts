/** E2.1 review — dataset consolidato, manifest e checksum sorgente. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { resolveOutputPath } from "../tools/e1/experiment";
import type { RunResult } from "../tools/e1/runner";
import {
  checksumSources,
  e1SourceFiles,
  e2SourceFiles,
  writeDataset,
} from "../tools/e2/dataset";

interface JsonPayload {
  schema: string;
  [key: string]: unknown;
}

const readJson = (path: string, expectedSchema: string): { payload: JsonPayload; text: string } => {
  const text = readFileSync(resolveOutputPath(path), "utf8");
  const payload = JSON.parse(text) as JsonPayload;
  if (payload.schema !== expectedSchema) {
    throw new Error(`Expected ${expectedSchema}, received ${payload.schema}`);
  }
  return { payload, text };
};

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

describe("E2.1 reviewed dataset", () => {
  it(
    "writes a consolidated E2.1 review dataset with a clean provenance manifest",
    () => {
      const pilotPath = process.env.E2_DATASET_REVIEW_PILOT ?? "";
      const isolationPath = process.env.E2_DATASET_REVIEW_ISOLATION ?? "";
      const correlationPath = process.env.E2_DATASET_REVIEW_CORRELATION ?? "";
      const resiliencePath = process.env.E2_DATASET_REVIEW_RESILIENCE ?? "";
      const outDir = resolveOutputPath(process.env.E2_DATASET_REVIEW_OUT_DIR ?? "docs/research/e2/datasets");
      const label = process.env.E2_DATASET_REVIEW_LABEL ?? "e2.1-review";
      const codeCommit = process.env.E2_DATASET_REVIEW_CODE_COMMIT;
      if (!codeCommit) throw new Error("E2_DATASET_REVIEW_CODE_COMMIT is required");
      const dirtyFlag = process.env.E2_DATASET_REVIEW_WORKING_TREE_DIRTY ?? "1";
      const workingTreeDirty = dirtyFlag === "1" || dirtyFlag.toLowerCase() === "true";

      const pilot = readJson(pilotPath, "evoworld.e2.pilot.v1");
      const isolation = readJson(isolationPath, "evoworld.e2.isolation.v1");
      const correlation = readJson(correlationPath, "evoworld.e2.correlation-review.v1");
      const resilience = readJson(resiliencePath, "evoworld.e2.resilience-review.v1");
      const pilotEnv = pilot.payload.env as { SEEDS: number[]; TICKS: number; SAMPLE_EVERY: number };
      const pilotResults = pilot.payload.results as RunResult[];
      const isolationResults = isolation.payload.results as RunResult[];

      const scientificReport = {
        pilot: pilot.payload.scientificReport,
        isolation: isolation.payload.scientificReport,
        correlation: correlation.payload.analysis,
        resilience: resilience.payload.analysis,
      };
      const reproduction = {
        env: {
          E2_PILOT_SEEDS: pilotEnv.SEEDS.join(","),
          E2_PILOT_TICKS: String(pilotEnv.TICKS),
          E2_PILOT_SAMPLE_EVERY: String(pilotEnv.SAMPLE_EVERY),
          E2_ISOLATION_SEEDS: (isolation.payload.env as { SEEDS: number[] }).SEEDS.join(","),
          E2_ISOLATION_TICKS: String((isolation.payload.env as { TICKS: number }).TICKS),
          E2_ISOLATION_SAMPLE_EVERY: String((isolation.payload.env as { SAMPLE_EVERY: number }).SAMPLE_EVERY),
          E2_CORRELATION_MAX_LAG: String(correlation.payload.maxLag),
          E2_DATASET_REVIEW_LABEL: label,
          E2_DATASET_REVIEW_CODE_COMMIT: "<commit>",
        },
        command: [
          "E2_PILOT_OUT=<pilot>.json npx vitest run --config vitest.experiment.config.ts scripts/e2_population_pilot.experiment.ts",
          "E2_ISOLATION_OUT=<isolation>.json npx vitest run --config vitest.experiment.config.ts scripts/e2_variable_isolation.experiment.ts",
          "E2_CORRELATION_INPUT=<pilot>.json E2_CORRELATION_OUT=<correlation>.json npx vitest run --config vitest.experiment.config.ts scripts/e2_correlation_review.experiment.ts",
          "E2_RESILIENCE_INPUT=<pilot>.json E2_RESILIENCE_OUT=<resilience>.json npx vitest run --config vitest.experiment.config.ts scripts/e2_resilience_review.experiment.ts",
          "E2_DATASET_REVIEW_* npx vitest run --config vitest.experiment.config.ts scripts/e2_dataset_review.experiment.ts",
        ].join("\n"),
      };

      const manifest = writeDataset(outDir, label, {
        phase: "E2.1-review",
        experiment: "E2.1 reviewed population stability, variable isolation, correlation and resilience",
        env: pilotEnv,
        scientificReport,
        results: [...pilotResults, ...isolationResults],
        executedAt: new Date().toISOString(),
        codeCommit,
        workingTreeDirty,
        sourceSha256: checksumSources(e2SourceFiles()),
        e1SourceSha256: checksumSources(e1SourceFiles()),
        runtime: { node: process.version, v8: process.versions.v8 },
        note: "Dataset E2.1 revisionato: include pilota, isolamento variabili, correlazione detrendizzata e resilienza appaiata; sorgenti E2 e E1 tracciati separatamente.",
        reproduction,
        auxiliary: {
          inputs: {
            pilot: { schema: pilot.payload.schema, sha256: sha256(pilot.text) },
            isolation: { schema: isolation.payload.schema, sha256: sha256(isolation.text) },
            correlation: { schema: correlation.payload.schema, sha256: sha256(correlation.text) },
            resilience: { schema: resilience.payload.schema, sha256: sha256(resilience.text) },
          },
          reviewId: "E2.1-review-2026-11-18",
        },
      });

      process.stdout.write(
        `E2 reviewed dataset written: ${manifest.artifact}\npayloadSha256=${manifest.payloadSha256}\narchiveSha256=${manifest.archiveSha256}\nsourceSha256=${manifest.sourceSha256}\ne1SourceSha256=${manifest.e1SourceSha256}\ncodeCommit=${manifest.codeCommit}\nworkingTreeDirty=${manifest.workingTreeDirty}\n`,
      );
    },
    120_000,
  );
});
