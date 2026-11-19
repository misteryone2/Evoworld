/** E2.2.1 — dataset deterministico e manifest dell'hardening inferenziale. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { resolveOutputPath } from "../tools/e1/experiment";
import type { RunResult } from "../tools/e1/runner";
import { checksumSources, e1SourceFiles, e2SourceFiles, readDataset, writeDataset } from "../tools/e2/dataset";
import type { FoodWebProtocol } from "../tools/e2/foodWebReport";

interface BlockPayload {
  schema: string;
  label: string;
  env: { SEEDS: number[]; TICKS: number; SAMPLE_EVERY: number; MAX_LAG: number; SCENARIOS: string[] };
  protocol: FoodWebProtocol;
  results: RunResult[];
  review?: { sourceBlockSha256: string };
}

const ORIGINAL_DATASET = {
  manifest: "docs/research/e2/datasets/e2.2-foodweb.manifest.json",
  archive: "docs/research/e2/datasets/e2.2-foodweb.json.gz",
  payloadSha256: "755d2a4f778ba8c90243daee3dd01e63530380567ac36875d8ecc281dc5e772d",
  archiveSha256: "d407c8d3a906ff1d0909681f95a9f441173f502eb61a3b39970a82ef17f7cb79",
} as const;

const PRIOR_DATASET = {
  manifest: "docs/research/e2/datasets/e2.2-foodweb-iaaft-review.manifest.json",
  archive: "docs/research/e2/datasets/e2.2-foodweb-iaaft-review.json.gz",
  payloadSha256: "d65c1dc8fe33025b991d1b577ccba13adfd9c77d492336410a0903ad1f538f03",
  archiveSha256: "828189b5d9a033ae342f1e534e758ad768292fb0b3fb5d5e81f20c27225c60c4",
  manifestSha256: "df1f8f9c1b2895ea15643eba9d9489a50e4e7532107f0b6ec618376b83a1eb8e",
} as const;

const RAW_BLOCK_SHAS = {
  main: "96d533b3c579238246aba071f36003b3c990b30a9e232e560bb4a22382f445e7",
  seed: "1c4e33fc373d804feca97401ba3fe475163222eedc19fa8c89dd4c9eba656d59",
  duration: "a4580bd3c0c12f573a6df2e9af88f9219158bfde9b375f2c061b9ed52593cbd9",
  sampling: "d81f2c5ac146ec84678a75535525fe8c54cb4c74eb4f7b086b489d3fd26d9d32",
} as const;

const readJson = <T extends { schema: string }>(value: string | undefined, name: string, expectedSchema: string): {
  payload: T;
  sha256: string;
  bytes: number;
} => {
  if (!value) throw new Error(`${name} is required`);
  const text = readFileSync(resolveOutputPath(value), "utf8");
  const payload = JSON.parse(text) as T;
  if (payload.schema !== expectedSchema) throw new Error(`${name}: expected ${expectedSchema}, received ${payload.schema}`);
  return {
    payload,
    sha256: createHash("sha256").update(text).digest("hex"),
    bytes: Buffer.byteLength(text, "utf8"),
  };
};

describe("E2.2.1 inferential hardening dataset", () => {
  it(
    "writes a new deterministic dataset and manifest without touching prior archives",
    () => {
      const blocks = {
        main: readJson<BlockPayload>(process.env.E2_HARDENING_DATASET_MAIN, "E2_HARDENING_DATASET_MAIN", "evoworld.e2.foodweb-block.v1"),
        seed: readJson<BlockPayload>(process.env.E2_HARDENING_DATASET_SEED, "E2_HARDENING_DATASET_SEED", "evoworld.e2.foodweb-block.v1"),
        duration: readJson<BlockPayload>(process.env.E2_HARDENING_DATASET_DURATION, "E2_HARDENING_DATASET_DURATION", "evoworld.e2.foodweb-block.v1"),
        sampling: readJson<BlockPayload>(process.env.E2_HARDENING_DATASET_SAMPLING, "E2_HARDENING_DATASET_SAMPLING", "evoworld.e2.foodweb-block.v1"),
      };
      const reanalysis = readJson<Record<string, unknown> & { schema: string }>(
        process.env.E2_HARDENING_DATASET_REANALYSIS, "E2_HARDENING_DATASET_REANALYSIS", "evoworld.e2.hardening-reanalysis.v1");
      const calibration = readJson<Record<string, unknown> & { schema: string }>(
        process.env.E2_HARDENING_DATASET_CALIBRATION, "E2_HARDENING_DATASET_CALIBRATION", "evoworld.e2.hardening-calibration-aggregate.v1");
      const qa = readJson<Record<string, unknown> & { schema: string }>(
        process.env.E2_HARDENING_DATASET_QA, "E2_HARDENING_DATASET_QA", "evoworld.e2.hardening-qa-sensitivity.v1");
      const synthetic = {
        null: readJson<Record<string, unknown> & { schema: string }>(process.env.E2_HARDENING_DATASET_SYNTHETIC_NULL, "E2_HARDENING_DATASET_SYNTHETIC_NULL", "evoworld.e2.hardening-synthetic-validation.v1"),
        alternative: readJson<Record<string, unknown> & { schema: string }>(process.env.E2_HARDENING_DATASET_SYNTHETIC_ALTERNATIVE, "E2_HARDENING_DATASET_SYNTHETIC_ALTERNATIVE", "evoworld.e2.hardening-synthetic-validation.v1"),
        stress: readJson<Record<string, unknown> & { schema: string }>(process.env.E2_HARDENING_DATASET_SYNTHETIC_STRESS, "E2_HARDENING_DATASET_SYNTHETIC_STRESS", "evoworld.e2.hardening-synthetic-validation.v1"),
      };
      const stability = {
        surrogates: readJson<Record<string, unknown> & { schema: string }>(process.env.E2_HARDENING_DATASET_STABILITY_SURROGATES, "E2_HARDENING_DATASET_STABILITY_SURROGATES", "evoworld.e2.hardening-stability.v1"),
        iterations: readJson<Record<string, unknown> & { schema: string }>(process.env.E2_HARDENING_DATASET_STABILITY_ITERATIONS, "E2_HARDENING_DATASET_STABILITY_ITERATIONS", "evoworld.e2.hardening-stability.v1"),
      };

      for (const [name, block] of Object.entries(blocks)) {
        if (block.sha256 !== RAW_BLOCK_SHAS[name as keyof typeof RAW_BLOCK_SHAS]) {
          throw new Error(`raw block ${name} changed: ${block.sha256}`);
        }
      }
      const original = readDataset(
        resolveOutputPath(process.env.E2_HARDENING_DATASET_ORIGINAL_ARCHIVE ?? ORIGINAL_DATASET.archive),
        resolveOutputPath(process.env.E2_HARDENING_DATASET_ORIGINAL_MANIFEST ?? ORIGINAL_DATASET.manifest),
      );
      if (original.payloadSha256 !== ORIGINAL_DATASET.payloadSha256
        || original.manifest?.archiveSha256 !== ORIGINAL_DATASET.archiveSha256) {
        throw new Error("Original e2.2-foodweb dataset changed: refusing to write hardening dataset");
      }
      const prior = readDataset(
        resolveOutputPath(process.env.E2_HARDENING_DATASET_PRIOR_ARCHIVE ?? PRIOR_DATASET.archive),
        resolveOutputPath(process.env.E2_HARDENING_DATASET_PRIOR_MANIFEST ?? PRIOR_DATASET.manifest),
      );
      const priorManifestText = readFileSync(
        resolveOutputPath(process.env.E2_HARDENING_DATASET_PRIOR_MANIFEST ?? PRIOR_DATASET.manifest), "utf8");
      if (prior.payloadSha256 !== PRIOR_DATASET.payloadSha256
        || prior.manifest?.archiveSha256 !== PRIOR_DATASET.archiveSha256
        || createHash("sha256").update(priorManifestText).digest("hex") !== PRIOR_DATASET.manifestSha256) {
        throw new Error("Prior e2.2-foodweb-iaaft-review dataset changed: refusing to supersede it");
      }

      const codeCommit = process.env.E2_HARDENING_DATASET_CODE_COMMIT;
      if (!codeCommit) throw new Error("E2_HARDENING_DATASET_CODE_COMMIT is required");
      const dirtyFlag = process.env.E2_HARDENING_DATASET_WORKING_TREE_DIRTY ?? "1";
      const executedAt = process.env.E2_HARDENING_DATASET_EXECUTED_AT;
      if (!executedAt) throw new Error("E2_HARDENING_DATASET_EXECUTED_AT is required");
      const outDir = resolveOutputPath(process.env.E2_HARDENING_DATASET_OUT_DIR ?? "docs/research/e2/datasets");

      const artifactInput = (artifact: { sha256: string; bytes: number; payload: { schema: string } }) => ({
        schema: artifact.payload.schema,
        sha256: artifact.sha256,
        bytes: artifact.bytes,
      });
      const scientificReport = {
        hardenedReanalysis: reanalysis.payload,
        calibration: calibration.payload,
        qaSensitivity: qa.payload,
        syntheticValidation: {
          null: synthetic.null.payload,
          alternative: synthetic.alternative.payload,
          stress: synthetic.stress.payload,
        },
        stability: {
          surrogates: stability.surrogates.payload,
          iterations: stability.iterations.payload,
        },
      };
      const reproduction = {
        env: {
          E2_HARDENING_CALIBRATION_EXECUTED_AT: "2026-11-18T16:30:00.000Z",
          E2_HARDENING_QA_EXECUTED_AT: "2026-11-18T16:15:00.000Z",
          E2_HARDENING_SYNTHETIC_EXECUTED_AT: "2026-11-18T17:00:00.000Z",
          E2_HARDENING_STABILITY_EXECUTED_AT: "2026-11-18T17:00:00.000Z",
          E2_HARDENING_REANALYSIS_EXECUTED_AT: "2026-11-18T20:00:00.000Z",
          E2_HARDENING_COMBINE_EXECUTED_AT: "2026-11-18T20:15:00.000Z",
          E2_HARDENING_DATASET_EXECUTED_AT: "2026-11-18T20:30:00.000Z",
        },
        command: [
          "# Raw 120 simulation outputs remain byte-identical; only E2 inference is regenerated.",
          "E2_HARDENING_QA_OUT=<validation>/qa-sensitivity.json npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_hardening_qa_sensitivity.experiment.ts",
          "E2_HARDENING_CALIBRATION_CHUNK=<chunk> E2_HARDENING_CALIBRATION_OUT=<validation>/calibration-<chunk>.json npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_hardening_calibration.experiment.ts",
          "E2_HARDENING_AGGREGATE_INPUT_DIR=<validation> E2_HARDENING_AGGREGATE_OUT=<validation>/calibration-aggregate.json npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_hardening_aggregate.experiment.ts",
          "E2_HARDENING_STABILITY_CHUNK=<chunk> E2_HARDENING_STABILITY_OUT=<validation>/stability-<chunk>.json npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_hardening_stability.experiment.ts",
          "E2_HARDENING_SYNTHETIC_CHUNK=<chunk> E2_HARDENING_SYNTHETIC_OUT=<validation>/synthetic-<chunk>.json npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_hardening_synthetic.experiment.ts",
          "E2_HARDENING_REANALYSIS_ONLY=<block> E2_HARDENING_REANALYSIS_OUT=<validation>/hardened-<block>.json npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_hardening_reanalysis.experiment.ts",
          "E2_HARDENING_COMBINE_* E2_HARDENING_COMBINE_OUT=<validation>/hardened-combined.json npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_hardening_reanalysis_combine.experiment.ts",
          "E2_HARDENING_DATASET_* npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_hardening_dataset.experiment.ts",
        ].join("\n"),
      };
      const manifest = writeDataset(outDir, "e2.2-foodweb-inferential-hardening", {
        phase: "E2.2.1-foodweb-inferential-hardening",
        experiment: "E2.2 food web dynamics: independent inferential hardening, QA-gated IAAFT, FPR calibration and multiple-testing control",
        env: blocks.main.payload.env,
        scientificReport,
        results: [
          ...blocks.main.payload.results,
          ...blocks.seed.payload.results,
          ...blocks.duration.payload.results,
          ...blocks.sampling.payload.results,
        ],
        executedAt,
        codeCommit,
        workingTreeDirty: dirtyFlag === "1" || dirtyFlag.toLowerCase() === "true",
        sourceSha256: checksumSources(e2SourceFiles()),
        e1SourceSha256: checksumSources(e1SourceFiles()),
        runtime: { node: process.version, v8: process.versions.v8 },
        note: "E2.2.1: nessuna simulazione biologica rieseguita. Stesse 120 corse grezze; IAAFT a lunghezza esatta con QA per-surrogato, degrado NON_VALUTABILE, calibrazione Monte Carlo con 1000 dataset/cella, Holm/BH pre-dichiarati e validazione sintetica separata. Correlazione e significatività non identificano causalità.",
        reproduction,
        auxiliary: {
          rawBlocks: Object.fromEntries(Object.entries(blocks).map(([name, block]) => [name, {
            label: block.payload.label,
            sha256: block.sha256,
            unchanged: true,
          }])),
          preservedDatasets: {
            original: { ...ORIGINAL_DATASET, unchanged: true },
            priorIaaftReview: { ...PRIOR_DATASET, unchanged: true },
          },
          artifacts: {
            qaSensitivity: artifactInput(qa),
            calibrationAggregate: artifactInput(calibration),
            syntheticNull: artifactInput(synthetic.null),
            syntheticAlternative: artifactInput(synthetic.alternative),
            syntheticStress: artifactInput(synthetic.stress),
            stabilitySurrogates: artifactInput(stability.surrogates),
            stabilityIterations: artifactInput(stability.iterations),
            hardenedReanalysis: artifactInput(reanalysis),
          },
        },
      });
      process.stdout.write(
        `E2.2.1 hardening dataset written: ${manifest.artifact}\npayloadSha256=${manifest.payloadSha256}\narchiveSha256=${manifest.archiveSha256}\nmanifestSha256=${createHash("sha256").update(readFileSync(join(outDir, manifest.artifact.replace(/\.json\.gz$/, ".manifest.json")), "utf8")).digest("hex")}\nsourceSha256=${manifest.sourceSha256}\ne1SourceSha256=${manifest.e1SourceSha256}\ncodeCommit=${manifest.codeCommit}\ntotalRuns=${manifest.totalRuns}\nrawBlocksUnchanged=true\npriorDatasetsUnchanged=true\n`,
      );
    },
    300_000,
  );
});
