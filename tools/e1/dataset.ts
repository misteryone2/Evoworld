/**
 * E1.3 — conservazione riproducibile dei risultati dell'harness.
 *
 * Il payload scientifico è serializzato in modo canonico (chiavi ordinate),
 * compresso con gzip e accompagnato da un manifest con provenance e SHA-256.
 * Nessun percorso assoluto o dato personale viene inserito negli artefatti:
 * il controllo `assertPortable()` fallisce esplicitamente se succede.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { RunResult } from "./runner";
import { stripVariableData } from "./experiment";

export const DATASET_SCHEMA = "evoworld.e1.dataset.v1";
export const MANIFEST_SCHEMA = "evoworld.e1.manifest.v1";

/** Serializzazione canonica: chiavi ordinate ricorsivamente, nessun undefined. */
export function stableStringify(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Vieta percorsi assoluti e pattern di identificazione personale negli artefatti. */
export function assertPortable(text: string, context = "dataset"): void {
  const absolute = /[A-Za-z]:[\\/]|\/Users\/|\/home\/|\/mnt\/|\/tmp\/|\\\\/;
  const email = /[\w.+-]+@[\w-]+\.[\w]{2,}/;
  if (absolute.test(text)) throw new Error(`E1 dataset: percorso assoluto rilevato in ${context}`);
  if (email.test(text)) throw new Error(`E1 dataset: dato personale (email) rilevato in ${context}`);
}

export interface DatasetSource {
  phase: string;
  env: { TICKS: number; SAMPLE_EVERY: number; SEEDS: number[] };
  scientificReport: unknown;
  results: RunResult[];
  /** Timestamp ISO dell'esecuzione (per i dati storici: mtime del file sorgente). */
  executedAt: string;
  codeCommit: string;
  workingTreeDirty: boolean;
  /** SHA-256 dei sorgenti E1.3 al momento dell'esecuzione. */
  sourceSha256: string;
  /** Runtime usato: il motore usa funzioni trascendenti sensibili alla versione di V8. */
  runtime?: { node: string; v8: string };
  note?: string;
}

export interface ScientificDataset {
  schema: string;
  phase: string;
  provenance: {
    codeCommit: string;
    workingTreeDirty: boolean;
    sourceSha256: string;
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
    reproduction: {
      env: Record<string, string>;
      command: string;
    };
  };
  configuration: Array<Record<string, unknown>>;
  /** Risultati grezzi per tick (senza tempi di esecuzione). */
  results: unknown;
  /** Metriche e statistiche calcolate dall'harness. */
  metrics: unknown;
}

/** Comando esatto per riprodurre la fase 2 con gli stessi parametri. */
export function reproductionCommand(env: DatasetSource["env"]): string {
  return (
    `E1_PHASE2_SEEDS=${env.SEEDS.join(",")} ` +
    `E1_PHASE2_TICKS=${env.TICKS} E1_PHASE2_SAMPLE_EVERY=${env.SAMPLE_EVERY} ` +
    `E1_PHASE2_OUT=<output>.json ` +
    `npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.phase2.experiment.ts`
  );
}

export function buildDataset(source: DatasetSource): ScientificDataset {
  const command = reproductionCommand(source.env);
  const scenarioIds = [...new Set(source.results.map((r) => r.scenario))].sort();
  const configuration = source.results.map((r) => ({
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
  }));
  return {
    schema: DATASET_SCHEMA,
    phase: source.phase,
    provenance: {
      codeCommit: source.codeCommit,
      workingTreeDirty: source.workingTreeDirty,
      sourceSha256: source.sourceSha256,
      runtime: source.runtime ?? null,
      executedAt: source.executedAt,
      note: source.note ?? "Dataset scientifico E1: nessun dato personale o percorso assoluto.",
    },
    protocol: {
      experiment: "E1 ecosystem QA — phase 2 multi-seed",
      scenarioIds,
      seeds: [...source.env.SEEDS],
      ticks: source.env.TICKS,
      sampleEvery: source.env.SAMPLE_EVERY,
      totalRuns: source.results.length,
      reproduction: {
        env: {
          E1_PHASE2_SEEDS: source.env.SEEDS.join(","),
          E1_PHASE2_TICKS: String(source.env.TICKS),
          E1_PHASE2_SAMPLE_EVERY: String(source.env.SAMPLE_EVERY),
          E1_PHASE2_OUT: "<output>.json",
        },
        command,
      },
    },
    configuration,
    results: stripVariableData(source.results),
    metrics: stripVariableData(source.scientificReport),
  };
}

export interface DatasetManifest {
  schema: string;
  artifact: string;
  payloadSha256: string;
  archiveSha256: string;
  phase: string;
  codeCommit: string;
  workingTreeDirty: boolean;
  sourceSha256: string;
  runtime: { node: string; v8: string } | null;
  executedAt: string;
  scenarioIds: string[];
  seeds: number[];
  totalRuns: number;
  reproduction: ScientificDataset["protocol"]["reproduction"];
  note: string;
}

/** Scrive `<label>.json.gz` e `<label>.manifest.json` in `outDir`. */
export function writeDataset(outDir: string, label: string, source: DatasetSource): DatasetManifest {
  const dataset = buildDataset(source);
  const payload = Buffer.from(stableStringify(dataset), "utf8");
  assertPortable(payload.toString("utf8"));
  const payloadSha256 = sha256(payload);
  const archive = gzipSync(payload);
  const artifact = `${label}.json.gz`;
  const manifestPath = join(outDir, `${label}.manifest.json`);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(join(outDir, artifact), archive);
  const manifest: DatasetManifest = {
    schema: MANIFEST_SCHEMA,
    artifact,
    payloadSha256,
    archiveSha256: sha256(archive),
    phase: source.phase,
    codeCommit: source.codeCommit,
    workingTreeDirty: source.workingTreeDirty,
    sourceSha256: source.sourceSha256,
    runtime: source.runtime ?? null,
    executedAt: source.executedAt,
    scenarioIds: dataset.protocol.scenarioIds,
    seeds: dataset.protocol.seeds,
    totalRuns: dataset.protocol.totalRuns,
    reproduction: dataset.protocol.reproduction,
    note: dataset.provenance.note,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}

/** Legge e verifica un artefatto compresso (uso nei test e nella riproduzione). */
export function readDataset(archivePath: string): { dataset: ScientificDataset; payloadSha256: string } {
  const payload = gunzipSync(readFileSync(archivePath));
  return {
    dataset: JSON.parse(payload.toString("utf8")) as ScientificDataset,
    payloadSha256: sha256(payload),
  };
}
