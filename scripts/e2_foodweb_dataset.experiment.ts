/** E2.2 review — dataset corretto, manifest e provenance dell'archivio originale immutato. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
  scientificReport: unknown;
  results: RunResult[];
  review?: { sourceBlockSha256: string; originalLabel: string };
}

interface SensitivityPayload {
  schema: string;
  [key: string]: unknown;
}

const ORIGINAL_DATASET = {
  manifest: "docs/research/e2/datasets/e2.2-foodweb.manifest.json",
  archive: "docs/research/e2/datasets/e2.2-foodweb.json.gz",
  payloadSha256: "755d2a4f778ba8c90243daee3dd01e63530380567ac36875d8ecc281dc5e772d",
  archiveSha256: "d407c8d3a906ff1d0909681f95a9f441173f502eb61a3b39970a82ef17f7cb79",
  codeCommit: "b604b031c32ac10f0fbcab67d3624942074c1ed0",
  executedAt: "2026-11-18T12:30:00.000Z",
} as const;

const PRIOR_REVIEW_DATASET = {
  manifest: "docs/research/e2/datasets/e2.2-foodweb-review.manifest.json",
  archive: "docs/research/e2/datasets/e2.2-foodweb-review.json.gz",
  payloadSha256: "14798d7a2188e3cf5aafdac9e82d75584ef07961791e8fb64ab93b68cd05475f",
  archiveSha256: "47298821e188c53f6e677a69d336006193d48e5955b282ef4674d7aa39b8ef84",
} as const;

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

describe("E2.2 review food-web dataset", () => {
  it(
    "writes a corrected reproducible E2.2 dataset while preserving the original archive",
    () => {
      const main = readJson<BlockPayload>(process.env.E2_FOODWEB_DATASET_MAIN, "E2_FOODWEB_DATASET_MAIN", "evoworld.e2.foodweb-block.v1");
      const seed = readJson<BlockPayload>(process.env.E2_FOODWEB_DATASET_SEED, "E2_FOODWEB_DATASET_SEED", "evoworld.e2.foodweb-block.v1");
      const duration = readJson<BlockPayload>(process.env.E2_FOODWEB_DATASET_DURATION, "E2_FOODWEB_DATASET_DURATION", "evoworld.e2.foodweb-block.v1");
      const sampling = readJson<BlockPayload>(process.env.E2_FOODWEB_DATASET_SAMPLING, "E2_FOODWEB_DATASET_SAMPLING", "evoworld.e2.foodweb-block.v1");
      const sensitivity = readJson<SensitivityPayload>(process.env.E2_FOODWEB_DATASET_SENSITIVITY, "E2_FOODWEB_DATASET_SENSITIVITY", "evoworld.e2.foodweb-sensitivity.v1");

      const original = readDataset(
        resolveOutputPath(process.env.E2_FOODWEB_DATASET_ORIGINAL_ARCHIVE ?? ORIGINAL_DATASET.archive),
        resolveOutputPath(process.env.E2_FOODWEB_DATASET_ORIGINAL_MANIFEST ?? ORIGINAL_DATASET.manifest),
      );
      if (original.payloadSha256 !== ORIGINAL_DATASET.payloadSha256
        || original.manifest?.archiveSha256 !== ORIGINAL_DATASET.archiveSha256) {
        throw new Error("Original e2.2-foodweb dataset changed: refusing to write the review dataset");
      }

      const priorReview = readDataset(
        resolveOutputPath(process.env.E2_FOODWEB_DATASET_PRIOR_ARCHIVE ?? PRIOR_REVIEW_DATASET.archive),
        resolveOutputPath(process.env.E2_FOODWEB_DATASET_PRIOR_MANIFEST ?? PRIOR_REVIEW_DATASET.manifest),
      );
      if (priorReview.payloadSha256 !== PRIOR_REVIEW_DATASET.payloadSha256
        || priorReview.manifest?.archiveSha256 !== PRIOR_REVIEW_DATASET.archiveSha256) {
        throw new Error("Prior e2.2-foodweb-review dataset changed: refusing to supersede it");
      }

      const outDir = resolveOutputPath(process.env.E2_FOODWEB_DATASET_OUT_DIR ?? "docs/research/e2/datasets");
      const label = process.env.E2_FOODWEB_DATASET_LABEL ?? "e2.2-foodweb-iaaft-review";
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
          E2_FOODWEB_REANALYSIS_MAIN: "<raw>/e2.2-main.json",
          E2_FOODWEB_REANALYSIS_SEED: "<raw>/e2.2-seed.json",
          E2_FOODWEB_REANALYSIS_DURATION: "<raw>/e2.2-duration.json",
          E2_FOODWEB_REANALYSIS_SAMPLING: "<raw>/e2.2-sampling.json",
          E2_FOODWEB_REANALYSIS_EXECUTED_AT: "2026-11-18T14:10:00.000Z",
          E2_FOODWEB_SENS_EXECUTED_AT: "2026-11-18T14:20:00.000Z",
          E2_FOODWEB_VALIDATION_EXECUTED_AT: "2026-11-18T14:30:00.000Z",
        },
        command: [
          "# Original 120 executed runs are unchanged; see the e2.2-foodweb archive.",
          "E2_FOODWEB_REANALYSIS_* E2_FOODWEB_REANALYSIS_*_OUT=<review>/... npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_reanalysis.experiment.ts",
          "E2_FOODWEB_SENS_MAIN=<review>/main E2_FOODWEB_SENS_SEED=<review>/seed E2_FOODWEB_SENS_DURATION=<review>/duration E2_FOODWEB_SENS_SAMPLING=<review>/sampling E2_FOODWEB_SENS_OUT=<review>/sensitivity.json npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_sensitivity.experiment.ts",
          "E2_FOODWEB_VALIDATION_* npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_review_validation.experiment.ts",
          "E2_FOODWEB_DATASET_* npx vitest run --config vitest.experiment.config.ts scripts/e2_foodweb_dataset.experiment.ts",
        ].join("\n"),
      };

      const review = {
        schema: "evoworld.e2.foodweb-review.v2",
        surrogate: main.payload.protocol.surrogate ?? null,
        originalDataset: {
          artifact: "e2.2-foodweb.json.gz",
          payloadSha256: ORIGINAL_DATASET.payloadSha256,
          archiveSha256: ORIGINAL_DATASET.archiveSha256,
          codeCommit: ORIGINAL_DATASET.codeCommit,
          executedAt: ORIGINAL_DATASET.executedAt,
          unchanged: true,
        },
        supersededReviewDataset: {
          artifact: "e2.2-foodweb-review.json.gz",
          payloadSha256: PRIOR_REVIEW_DATASET.payloadSha256,
          archiveSha256: PRIOR_REVIEW_DATASET.archiveSha256,
          unchanged: true,
        },
        originalInputHashes: {
          main: main.payload.review?.sourceBlockSha256 ?? null,
          seed: seed.payload.review?.sourceBlockSha256 ?? null,
          duration: duration.payload.review?.sourceBlockSha256 ?? null,
          sampling: sampling.payload.review?.sourceBlockSha256 ?? null,
        },
        conclusionChanges: {
          confirmed: [
            "Conteggi kills descrittivi, persistenza/coesistenza, identità strutturale delle frazioni e determinismo del troncamento A->900.",
            "Direzione descrittiva del picco erbivori->kills a lag positivo nei quattro blocchi.",
          ],
          updated: [
            "Il nullo IAAFT usa una DFT alla lunghezza esatta: nessun padding a potenza di due e nessun troncamento della ricostruzione dentro l'iterazione.",
            "Tutti i p-values surrogati e i verdicts sono stati rigenerati dalle stesse 120 corse grezze; l'errore spettrale è misurato esplicitamente alle lunghezze 100, 160, 271, 256 e 512.",
            "Il criterio di early stopping e il numero effettivo di iterazioni sono registrati nei test surrogati; l'autocorrelazione lag-1 non è usata come prova di conservazione spettrale.",
          ],
          rejected: [
            "Qualsiasi significatività da soglia arbitraria |r|>=0.5 o concordanza tra seed.",
            "Trattare i tick di una corsa come osservazioni indipendenti.",
            "Equiparare correlazione negativa forte a sequenzialità positiva.",
            "IAAFT con zero-padding seguito da troncamento e affermazioni di conservazione spettrale basate solo su lag-1.",
          ],
        },
      };

      const manifest = writeDataset(outDir, label, {
        phase: "E2.2-foodweb-review",
        experiment: "E2.2 food web dynamics: sign-aware, lag-corrected inference with exact-length IAAFT",
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
        note: "Dataset E2.2 review P1: stesse 120 corse grezze, analisi rigenerata con IAAFT a lunghezza esatta (Cooley-Tukey/Rader), nessun padding/troncamento, errore spettrale verificato, criterio di convergenza e iterazioni registrati. Segno di r e del lag separati, p-value del massimo su tutti i lag, Fisher cross-seed. Tratti ≠ ruoli, kills ≠ mortalità totale, correlazione ≠ causalità.",
        reproduction,
        auxiliary: {
          inputs: {
            main: { label: main.payload.label, sha256: main.sha256, schema: main.payload.schema, runs: main.payload.results.length },
            seed: { label: seed.payload.label, sha256: seed.sha256, schema: seed.payload.schema, runs: seed.payload.results.length },
            duration: { label: duration.payload.label, sha256: duration.sha256, schema: duration.payload.schema, runs: duration.payload.results.length },
            sampling: { label: sampling.payload.label, sha256: sampling.sha256, schema: sampling.payload.schema, runs: sampling.payload.results.length },
            sensitivity: { sha256: sensitivity.sha256, schema: sensitivity.payload.schema },
          },
          review,
        },
      });

      process.stdout.write(
        `E2.2 review dataset written: ${manifest.artifact}\npayloadSha256=${manifest.payloadSha256}\narchiveSha256=${manifest.archiveSha256}\nsourceSha256=${manifest.sourceSha256}\ne1SourceSha256=${manifest.e1SourceSha256}\ncodeCommit=${manifest.codeCommit}\nworkingTreeDirty=${manifest.workingTreeDirty}\ntotalRuns=${manifest.totalRuns}\noriginalDatasetUnchanged=true\n`,
      );
    },
    120_000,
  );
});
