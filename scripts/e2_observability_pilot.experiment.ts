/**
 * E2.3 — pilota tecnico di validazione dell'infrastruttura di osservabilità.
 *
 * NON produce conclusioni ecologiche. Verifica che sia possibile avviare un
 * run, registrare il manifest, generare eventi reali, costruire snapshot,
 * esportare, verificare integrità, riprodurre il run e ricostruire la
 * sequenza di eventi. Se un evento non si verifica, il check corrispondente
 * usa direttamente i test deterministici dedicati in tests/e2/observability*.
 *
 * Uso:
 *   E2_3_CODE_COMMIT=<sha> E2_3_PILOT_OUT=docs/research/e2/datasets \
 *   npx vitest run --config vitest.experiment.config.ts scripts/e2_observability_pilot.experiment.ts
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ECOLOGICAL_EVENT_SCHEMA, filterEvents, selectHuntEvents } from "../simulation/ecology/observability";
import { e1SourceFiles, checksumSources } from "../tools/e2/dataset";
import { compareRuns, runObservability, type ObservabilityRunResult, type ObservabilityRunSpec } from "../tools/e2/observabilityRunner";
import { aggregateRun, exportObservabilityDataset, verifyObservabilityArtifact } from "../tools/e2/observabilityPipeline";

const REPO = resolve(process.cwd());
const OUT_DIR = process.env.E2_3_PILOT_OUT ?? join(REPO, "docs", "research", "e2", "datasets");
const REPORT_OUT = process.env.E2_3_PILOT_REPORT_OUT;
const LABEL = process.env.E2_3_PILOT_LABEL ?? "e2.3-observability-pilot";
const CODE_COMMIT = process.env.E2_3_CODE_COMMIT;
const WORKTREE_DIRTY = process.env.E2_3_WORKTREE_DIRTY === "1";
const SEEDS = (process.env.E2_3_PILOT_SEEDS ?? "7,11").split(",").map((s) => Number(s.trim())).filter(Number.isInteger);
const TICKS = Number(process.env.E2_3_PILOT_TICKS ?? 40);
const POPULATION = Number(process.env.E2_3_PILOT_POPULATION ?? 60);
const WIDTH = Number(process.env.E2_3_PILOT_WIDTH ?? 24);
const HEIGHT = Number(process.env.E2_3_PILOT_HEIGHT ?? 24);
const SNAPSHOT_EVERY = Number(process.env.E2_3_PILOT_SNAPSHOT_EVERY ?? 10);

/** Sorgenti E2.3 + motore instrumentato, in ordine deterministico. */
function e23SourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(REPO, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith(".ts")) files.push(rel);
    }
  };
  walk("simulation/ecology");
  walk("simulation/core");
  walk("simulation/planet");
  walk("simulation/evolution");
  walk("tools/e2");
  walk("tests/e2");
  for (const name of readdirSync(join(REPO, "scripts"))) {
    if (name.startsWith("e2_observability") && name.endsWith(".ts")) files.push(`scripts/${name}`);
  }
  return [...new Set(files)].sort();
}

function spec(seed: number, runId: string): ObservabilityRunSpec {
  return {
    id: "E2.3-PILOT",
    experimentId: "E2.3-OBSERVABILITY-PILOT",
    simulationId: `e2.3-sim-${seed}`,
    runId,
    seed,
    width: WIDTH,
    height: HEIGHT,
    population: POPULATION,
    ticks: TICKS,
    setup: "mixed",
    snapshotEveryTicks: SNAPSHOT_EVERY,
  };
}

describe("E2.3 observability pilot", () => {
  it("runs, exports and verifies the instrumented pilot", () => {
    if (!CODE_COMMIT) throw new Error("E2_3_CODE_COMMIT is required");
    expect(SEEDS.length).toBeGreaterThan(0);

    const runs: ObservabilityRunResult[] = [];
    const comparisons: Array<Record<string, unknown>> = [];
    for (const seed of SEEDS) {
      const primary = runObservability(spec(seed, `pilot-seed-${seed}`));
      runs.push(primary);
      const replicate = runObservability(spec(seed, `pilot-seed-${seed}`));
      comparisons.push({
        seed,
        runId: primary.manifest.runId,
        ...compareRuns(primary, replicate),
        primaryEventPayloadSha256: primary.eventPayloadSha256,
        replicateEventPayloadSha256: replicate.eventPayloadSha256,
      });
    }

    const aggregates = runs.map(aggregateRun);
    const sourceSha256 = checksumSources(e23SourceFiles());
    const e1SourceSha256 = checksumSources(e1SourceFiles());
    const reproductionEnv = {
      E2_3_CODE_COMMIT: CODE_COMMIT,
      E2_3_PILOT_SEEDS: SEEDS.join(","),
      E2_3_PILOT_TICKS: String(TICKS),
      E2_3_PILOT_POPULATION: String(POPULATION),
      E2_3_PILOT_WIDTH: String(WIDTH),
      E2_3_PILOT_HEIGHT: String(HEIGHT),
      E2_3_PILOT_SNAPSHOT_EVERY: String(SNAPSHOT_EVERY),
    };
    const reproductionCommand =
      Object.entries(reproductionEnv).map(([k, v]) => `${k}=${v}`).join(" ") +
      " npx vitest run --config vitest.experiment.config.ts scripts/e2_observability_pilot.experiment.ts";

    const exported = exportObservabilityDataset({
      experiment: "E2.3-OBSERVABILITY-PILOT",
      phase: "E2.3-technical-pilot",
      runs,
      outDir: OUT_DIR,
      label: LABEL,
      executedAt: new Date().toISOString(),
      codeCommit: CODE_COMMIT,
      workingTreeDirty: WORKTREE_DIRTY,
      sourceSha256,
      e1SourceSha256,
      runtime: { node: process.version, v8: process.versions.v8 },
      note: "E2.3: pilota tecnico di osservabilità; nessuna conclusione ecologica.",
      reproduction: { env: reproductionEnv, command: reproductionCommand },
      extraAuxiliary: {
        reproducibility: comparisons,
        eventSchema: ECOLOGICAL_EVENT_SCHEMA,
      },
    });

    const verified = verifyObservabilityArtifact(exported.archivePath, exported.manifestPath);
    const manifestSha256 = createHash("sha256").update(readFileSync(exported.manifestPath)).digest("hex");
    const checks = buildChecks(runs);
    checks.export = exported.validationErrors.length === 0;
    checks.integrity = verified.ok;
    checks.reproducibility = comparisons.every((c) => c.reproducible);
    checks.manifest = runs.every((r) => r.manifest.schema === "evoworld.e2.3.run-manifest.v1");

    const report = {
      schema: "evoworld.e2.3.pilot-report.v1",
      codeCommit: CODE_COMMIT,
      workingTreeDirty: WORKTREE_DIRTY,
      runtime: { node: process.version, v8: process.versions.v8 },
      seeds: SEEDS,
      config: { ticks: TICKS, population: POPULATION, width: WIDTH, height: HEIGHT, snapshotEveryTicks: SNAPSHOT_EVERY },
      checks,
      comparisons,
      runs: runs.map((run, index) => ({
        runId: run.manifest.runId,
        seed: run.manifest.seed,
        configSha256: run.manifest.configSha256,
        completedTicks: run.completedTicks,
        initialPopulation: run.initialPopulation,
        finalPopulation: run.finalPopulation,
        extinctAt: run.extinctAt,
        eventSummary: run.eventSummary,
        eventPayloadSha256: run.eventPayloadSha256,
        validation: run.validation,
        aggregates: aggregates[index],
      })),
      artifacts: {
        archive: exported.manifest.artifact,
        payloadSha256: exported.payloadSha256,
        archiveSha256: exported.archiveSha256,
        manifestSha256,
        sourceSha256,
        e1SourceSha256,
      },
      integrityErrors: verified.errors,
    };
    if (REPORT_OUT) {
      writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2) + "\n", "utf8");
    }
    console.log(
      `E2.3 pilot completed: runs=${runs.length} events=${runs.reduce((s, r) => s + r.events.length, 0)} ` +
        `payloadSha256=${exported.payloadSha256} archiveSha256=${exported.archiveSha256} ` +
        `manifestSha256=${manifestSha256} checks=${JSON.stringify(checks)}`,
    );
    for (const [name, ok] of Object.entries(checks)) expect(ok, `check ${name}`).toBe(true);
    expect(verified.errors).toEqual([]);
    expect(comparisons.every((c) => c.reproducible)).toBe(true);
  }, 600_000);
});

/** Check tecnici derivati dagli eventi: nessuna verifica di verità ecologica. */
function buildChecks(runs: readonly ObservabilityRunResult[]): Record<string, boolean> {
  const all = runs.flatMap((run) => [...run.events]);
  const hunts = selectHuntEvents(all, "HUNT_ATTEMPT");
  const successes = selectHuntEvents(all, "PREDATION");
  return {
    runStarted: runs.every((run) => run.completedTicks > 0),
    manifest: runs.every((run) => run.manifest.schema === "evoworld.e2.3.run-manifest.v1"),
    eventsGenerated: all.length > 0,
    predationObserved: hunts.length > 0 && successes.length > 0,
    mortalityObserved: filterEvents(all, { types: ["DEATH"] }).length > 0,
    consumptionObserved: filterEvents(all, { types: ["RESOURCE_CONSUMPTION"] }).length > 0,
    snapshotsBuilt: filterEvents(all, { types: ["ECOSYSTEM_SNAPSHOT", "RESOURCE_SNAPSHOT"] }).length > 0,
    eventSequenceReconstructed: reconstructSequence(all).length === all.length,
    validation: runs.every((run) => run.validation.valid),
    export: false,
    integrity: false,
    reproducibility: false,
  };
}

/** Ricostruzione della sequenza: ordinamento per tick, source e eventId. */
function reconstructSequence(events: readonly ObservabilityRunResult["events"][number][]): string[] {
  return [...events]
    .sort((a, b) => a.tick - b.tick || a.source.localeCompare(b.source) || a.eventId.localeCompare(b.eventId))
    .map((event) => event.eventId);
}
