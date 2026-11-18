/**
 * E2 — archiviazione riproducibile dei dataset.
 *
 * Riusa le primitive E1 (stableStringify, sha256, assertPortable,
 * stripVariableData) ma definisce uno schema E2 separato. I sorgenti E1
 * restano immutabili e vengono tracciati con un checksum dedicato.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { RunResult } from "../e1/runner";
import { assertPortable, sha256, stableStringify } from "../e1/dataset";
import { stripVariableData } from "../e1/experiment";

export const E2_DATASET_SCHEMA = "evoworld.e2.dataset.v1";
export const E2_MANIFEST_SCHEMA = "evoworld.e2.manifest.v1";

export interface E2DatasetSource {
  phase: string;
  experiment: string;
  env: { SEEDS: number[]; TICKS: number; SAMPLE_EVERY: number };
  scientificReport: unknown;
  results: RunResult[];
  executedAt: string;
  codeCommit: string;
  workingTreeDirty: boolean;
  sourceSha256: string;
  e1SourceSha256: string;
  runtime?: { node: string; v8: string };
  note?: string;
  /** Sovrascrittura additiva del comando di riproduzione per dataset revisionati. */
  reproduction?: E2Dataset["protocol"]["reproduction"];
  /** Analisi aggiuntive (es. review E2.1) conservate senza alterare lo schema base. */
  auxiliary?: Record<string, unknown>;
}

export interface E2Dataset {
  schema: string;
  phase: string;
  provenance: {
    codeCommit: string;
    workingTreeDirty: boolean;
    sourceSha256: string;
    e1SourceSha256: string;
    runtime: { node: string; v8: string } | null;
    executedAt: string;
    note: string;
  };
  protocol: {
    experiment: string;
    scenarioIds: string[];
    seeds: number[];
    ticks: number;
    sampleEvery: number;
    totalRuns: number;
    reproduction: { env: Record<string, string>; command: string };
  };
  configuration: unknown[];
  results: unknown;
  metrics: unknown;
  auxiliary: Record<string, unknown>;
}

export interface E2Manifest {
  schema: string;
  artifact: string;
  payloadSha256: string;
  archiveSha256: string;
  phase: string;
  experiment: string;
  codeCommit: string;
  workingTreeDirty: boolean;
  sourceSha256: string;
  e1SourceSha256: string;
  runtime: { node: string; v8: string } | null;
  executedAt: string;
  scenarioIds: string[];
  seeds: number[];
  totalRuns: number;
  reproduction: E2Dataset["protocol"]["reproduction"];
  note: string;
}

/** Comando portabile per riprodurre il pilota. */
export function reproductionCommand(env: E2DatasetSource["env"]): string {
  return (
    `E2_PILOT_SEEDS=${env.SEEDS.join(",")} ` +
    `E2_PILOT_TICKS=${env.TICKS} E2_PILOT_SAMPLE_EVERY=${env.SAMPLE_EVERY} ` +
    `E2_PILOT_OUT=<output>.json ` +
    `npx vitest run --config vitest.experiment.config.ts scripts/e2_population_pilot.experiment.ts`
  );
}

/** Costruisce il payload canonico. */
export function buildDataset(source: E2DatasetSource): E2Dataset {
  const scenarioIds = [...new Set(source.results.map((r) => r.scenario))].sort();
  return {
    schema: E2_DATASET_SCHEMA,
    phase: source.phase,
    provenance: {
      codeCommit: source.codeCommit,
      workingTreeDirty: source.workingTreeDirty,
      sourceSha256: source.sourceSha256,
      e1SourceSha256: source.e1SourceSha256,
      runtime: source.runtime ?? null,
      executedAt: source.executedAt,
      note: source.note ?? "Dataset scientifico E2: nessun dato personale o percorso assoluto.",
    },
    protocol: {
      experiment: source.experiment,
      scenarioIds,
      seeds: [...source.env.SEEDS],
      ticks: source.env.TICKS,
      sampleEvery: source.env.SAMPLE_EVERY,
      totalRuns: source.results.length,
      reproduction: source.reproduction ?? {
        env: {
          E2_PILOT_SEEDS: source.env.SEEDS.join(","),
          E2_PILOT_TICKS: String(source.env.TICKS),
          E2_PILOT_SAMPLE_EVERY: String(source.env.SAMPLE_EVERY),
          E2_PILOT_OUT: "<output>.json",
        },
        command: reproductionCommand(source.env),
      },
    },
    configuration: source.results.map((r) => ({
      scenario: r.scenario,
      seed: r.seed,
      width: r.width,
      height: r.height,
      initialPopulation: r.initialPopulation,
      ticks: r.ticks,
      sampleEvery: r.sampleEvery,
      setup: r.setup,
      setupInfo: r.setupInfo,
      perturbation: r.perturbation,
      perturbationReport: r.perturbationReport,
      options: r.options ?? null,
    })),
    results: stripVariableData(source.results),
    metrics: stripVariableData(source.scientificReport),
    auxiliary: stripVariableData(source.auxiliary ?? {}) as Record<string, unknown>,
  };
}

/** Scrive archivio gzip e manifest; restituisce il manifest. */
export function writeDataset(outDir: string, label: string, source: E2DatasetSource): E2Manifest {
  const dataset = buildDataset(source);
  const payload = Buffer.from(stableStringify(dataset), "utf8");
  assertPortable(payload.toString("utf8"), "e2 dataset");
  const archive = gzipSync(payload);
  const artifact = `${label}.json.gz`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, artifact), archive);
  const manifest: E2Manifest = {
    schema: E2_MANIFEST_SCHEMA,
    artifact,
    payloadSha256: sha256(payload),
    archiveSha256: sha256(archive),
    phase: source.phase,
    experiment: source.experiment,
    codeCommit: source.codeCommit,
    workingTreeDirty: source.workingTreeDirty,
    sourceSha256: source.sourceSha256,
    e1SourceSha256: source.e1SourceSha256,
    runtime: source.runtime ?? null,
    executedAt: source.executedAt,
    scenarioIds: dataset.protocol.scenarioIds,
    seeds: dataset.protocol.seeds,
    totalRuns: dataset.protocol.totalRuns,
    reproduction: dataset.protocol.reproduction,
    note: dataset.provenance.note,
  };
  writeFileSync(join(outDir, `${label}.manifest.json`), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}

/** Legge un archivio E2 e verifica opzionalmente il manifest. */
export function readDataset(
  archivePath: string,
  manifestPath?: string,
): { dataset: E2Dataset; payloadSha256: string; manifest: E2Manifest | null } {
  const payload = gunzipSync(readFileSync(archivePath));
  const payloadSha256 = sha256(payload);
  const dataset = JSON.parse(payload.toString("utf8")) as E2Dataset;
  let manifest: E2Manifest | null = null;
  if (manifestPath) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as E2Manifest;
    if (manifest.payloadSha256 !== payloadSha256) {
      throw new Error("E2 dataset: payloadSha256 mismatch");
    }
    if (manifest.archiveSha256 !== sha256(readFileSync(archivePath))) {
      throw new Error("E2 dataset: archiveSha256 mismatch");
    }
  }
  return { dataset, payloadSha256, manifest };
}

/** Normalizza CRLF per rendere il checksum indipendente dal checkout Windows. */
export function normalizedText(bytes: Buffer): string {
  return bytes.toString("utf8").replace(/\r\n/g, "\n");
}

/** Checksum di un insieme di file sorgente, con nomi e byte LF-normalizzati. */
export function checksumSources(files: string[]): string {
  const hasher = createHash("sha256");
  for (const file of [...files].sort()) {
    hasher.update(file);
    hasher.update("\n");
    hasher.update(normalizedText(readFileSync(file)));
  }
  return hasher.digest("hex");
}

/** Elenca i sorgenti E2 presenti, in ordine deterministico. */
export function e2SourceFiles(): string[] {
  const dirs = ["tools/e2", "tests/e2"];
  const files: string[] = [];
  for (const dir of dirs) {
    for (const name of readdirSync(dir).sort()) {
      if (name.endsWith(".ts")) files.push(join(dir, name).replace(/\\/g, "/"));
    }
  }
  for (const name of readdirSync("scripts").sort()) {
    if (name.startsWith("e2") && name.endsWith(".ts")) files.push(join("scripts", name).replace(/\\/g, "/"));
  }
  return files.sort();
}

/** Elenca i sorgenti E1 usati come dipendenza scientifica. */
export function e1SourceFiles(): string[] {
  const files: string[] = [];
  for (const name of readdirSync("tools/e1").sort()) {
    if (name.endsWith(".ts")) files.push(join("tools/e1", name).replace(/\\/g, "/"));
  }
  for (const name of readdirSync("tests/e1").sort()) {
    if (name.endsWith(".ts")) files.push(join("tests/e1", name).replace(/\\/g, "/"));
  }
  for (const name of readdirSync("scripts").sort()) {
    if (name.startsWith("e1") && name.endsWith(".ts")) files.push(join("scripts", name).replace(/\\/g, "/"));
  }
  return files.sort();
}
