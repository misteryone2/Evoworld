/**
 * E1.3 — genera il dataset scientifico compresso e il manifest di un output
 * della fase 2 (baseline E1.2 o risultati dopo la correzione E1.3).
 *
 * Uso:
 *   E1_DATASET_INPUT=<results.json> E1_DATASET_LABEL=e1-phase2-baseline \
 *   E1_DATASET_PHASE=E1.2-baseline E1_DATASET_OUT_DIR=docs/research/e1/datasets \
 *   npx vitest run --config vitest.experiment.config.ts scripts/e1_dataset.experiment.ts
 *
 * Modalità finalize (dopo il commit finale, aggiorna solo il manifest):
 *   E1_DATASET_FINALIZE=1 E1_DATASET_LABEL=<label> [E1_DATASET_OUT_DIR=...] \
 *   npx vitest run --config vitest.experiment.config.ts scripts/e1_dataset.experiment.ts
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { it } from "vitest";
import { readDataset, writeDataset, type DatasetSource } from "../tools/e1/dataset";
import type { RunResult } from "../tools/e1/runner";

const REPO = resolve(process.cwd());
const OUT_DIR = process.env.E1_DATASET_OUT_DIR ?? join(REPO, "docs", "research", "e1", "datasets");
const LABEL = process.env.E1_DATASET_LABEL ?? "e1-phase2-baseline";
const INPUT = process.env.E1_DATASET_INPUT;
const FINALIZE = process.env.E1_DATASET_FINALIZE === "1";

/** Commit letto da .git/HEAD e ref (nessun processo esterno, nessun percorso nel dataset). */
export function headCommit(): string {
  const head = readFileSync(join(REPO, ".git", "HEAD"), "utf8").trim();
  if (!head.startsWith("ref:")) return head;
  const ref = head.slice(4).trim();
  const refPath = join(REPO, ".git", ref);
  return existsSync(refPath) ? readFileSync(refPath, "utf8").trim() : "unresolved";
}

/** SHA-256 del contenuto dei sorgenti E1.3 al momento dell'esecuzione. */
export function sourceChecksum(): string {
  const files: string[] = [];
  for (const dir of ["tools/e1", "tests/e1"]) {
    for (const f of readdirSync(join(REPO, dir))) {
      if (f.endsWith(".ts")) files.push(join(dir, f));
    }
  }
  for (const f of readdirSync(join(REPO, "scripts"))) {
    if (f.startsWith("e1") && f.endsWith(".ts")) files.push(join("scripts", f));
  }
  files.sort();
  const hash = createHash("sha256");
  for (const f of files) {
    hash.update(f);
    hash.update(readFileSync(join(REPO, f)));
  }
  return hash.digest("hex");
}

it("E1.3 — dataset riproducibile", () => {
  if (FINALIZE) {
    const manifestPath = join(OUT_DIR, `${LABEL}.manifest.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    const archive = readFileSync(join(OUT_DIR, String(manifest.artifact)));
    manifest.codeCommit = headCommit();
    manifest.workingTreeDirty = false;
    manifest.archiveSha256 = createHash("sha256").update(archive).digest("hex");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    console.log(`E1_DATASET_FINALIZED=${manifestPath} commit=${manifest.codeCommit}`);
    return;
  }

  if (!INPUT) throw new Error("E1_DATASET_INPUT mancante");
  const input = resolve(INPUT);
  const raw = JSON.parse(readFileSync(input, "utf8")) as {
    phase?: string;
    env: { TICKS: number; SAMPLE_EVERY: number; SEEDS: number[] };
    scientificReport: unknown;
    results: RunResult[];
  };
  if (!Array.isArray(raw.results) || !raw.env || !Array.isArray(raw.env.SEEDS)) {
    throw new Error("E1_DATASET_INPUT non è un output E1.2 valido");
  }
  const source: DatasetSource = {
    phase: process.env.E1_DATASET_PHASE ?? raw.phase ?? "E1.2",
    env: raw.env,
    scientificReport: raw.scientificReport,
    results: raw.results,
    executedAt: statSync(input).mtime.toISOString(),
    codeCommit: process.env.E1_DATASET_GIT_HEAD ?? headCommit(),
    workingTreeDirty: process.env.E1_DATASET_DIRTY === "1",
    sourceSha256: process.env.E1_DATASET_SOURCE_SHA ?? sourceChecksum(),
    runtime: { node: process.version, v8: process.versions.v8 },
    note: process.env.E1_DATASET_NOTE,
  };
  const manifest = writeDataset(OUT_DIR, LABEL, source);
  console.log(`E1_DATASET_LABEL=${LABEL}`);
  console.log(`E1_DATASET_ARTIFACT=${join(OUT_DIR, manifest.artifact)}`);
  console.log(`E1_DATASET_PAYLOAD_SHA256=${manifest.payloadSha256}`);
  console.log(`E1_DATASET_SOURCE_SHA256=${manifest.sourceSha256}`);
  console.log(`E1_DATASET_COMMIT=${manifest.codeCommit}`);
  // Verifica di lettura: il checksum del payload decompresso deve coincidere.
  const check = readDataset(join(OUT_DIR, manifest.artifact));
  if (check.payloadSha256 !== manifest.payloadSha256) throw new Error("E1 dataset: checksum non verificato");
}, 3_000_000);
