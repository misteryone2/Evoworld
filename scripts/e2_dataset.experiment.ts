/** E2 — genera dataset gzip + manifest con checksum e provenance. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import {
  checksumSources,
  e1SourceFiles,
  e2SourceFiles,
  readDataset,
  writeDataset,
  type E2DatasetSource,
} from "../tools/e2/dataset";

const headCommit = (): string => {
  const head = readFileSync(join(".git", "HEAD"), "utf8").trim();
  if (head.startsWith("ref:")) {
    return readFileSync(join(".git", head.slice(4).trim()), "utf8").trim();
  }
  return head;
};

interface PilotPayload {
  schema?: string;
  phase: string;
  executedAt: string;
  runtime?: { node: string; v8: string };
  env: { SEEDS: number[]; TICKS: number; SAMPLE_EVERY: number };
  scientificReport: unknown;
  results: E2DatasetSource["results"];
}

describe("E2 dataset generation", () => {
  it(
    "writes and verifies the compressed pilot dataset",
    () => {
      const input = process.env.E2_DATASET_INPUT;
      if (!input) throw new Error("E2_DATASET_INPUT is required");
      const payload = JSON.parse(readFileSync(input, "utf8")) as PilotPayload;
      if (payload.schema && payload.schema !== "evoworld.e2.pilot.v1") {
        throw new Error(`Unsupported pilot schema: ${payload.schema}`);
      }

      const source: E2DatasetSource = {
        phase: process.env.E2_DATASET_PHASE ?? payload.phase,
        experiment: "E2.1 population stability / predator-prey / resilience pilot",
        env: payload.env,
        scientificReport: payload.scientificReport,
        results: payload.results,
        executedAt: payload.executedAt,
        codeCommit: process.env.E2_DATASET_CODE_COMMIT ?? headCommit(),
        workingTreeDirty: process.env.E2_DATASET_WORKING_TREE_DIRTY === "1",
        sourceSha256: checksumSources(e2SourceFiles()),
        e1SourceSha256: checksumSources(e1SourceFiles()),
        runtime: payload.runtime,
        note: "Dataset E2: sorgenti E2 e E1 tracciati separatamente; nessun dato personale o percorso assoluto.",
      };

      const outDir = process.env.E2_DATASET_OUT_DIR ?? join("docs", "research", "e2", "datasets");
      const label = process.env.E2_DATASET_LABEL ?? "e2.1-pilot";
      const manifest = writeDataset(outDir, label, source);
      const verified = readDataset(
        join(outDir, manifest.artifact),
        join(outDir, `${label}.manifest.json`),
      );
      if (verified.manifest?.payloadSha256 !== manifest.payloadSha256) {
        throw new Error("E2 dataset verification failed");
      }
      process.stdout.write(
        `E2 dataset written: ${manifest.artifact}\n` +
        `payloadSha256=${manifest.payloadSha256}\n` +
        `archiveSha256=${manifest.archiveSha256}\n` +
        `sourceSha256=${manifest.sourceSha256}\n` +
        `e1SourceSha256=${manifest.e1SourceSha256}\n`,
      );
    },
    3_000_000,
  );
});
