/**
 * E2.3 — pipeline dati: acquisisce → valida → aggrega → separa snapshot →
 * correla → esporta → genera manifest → calcola hash → verifica integrità.
 *
 * Riutilizza il pipeline E2 esistente (stableStringify/gzip/manifest) senza
 * modificarlo: i dati di osservabilità viaggiano nei campi additivi
 * `scientificReport` e `auxiliary`.
 */
import { join } from "node:path";
import {
  E2_DATASET_SCHEMA,
  readDataset,
  writeDataset,
  type E2Dataset,
  type E2Manifest,
} from "./dataset";
import { sha256 } from "../e1/dataset";
import {
  ECOLOGICAL_EVENT_SCHEMA,
  buildObservedFoodWeb,
  canonicalEventString,
  energyLedger,
  filterEvents,
  selectHuntEvents,
  validateEvent,
  type EcologicalEvent,
} from "../../simulation/ecology/observability";
import { eventsSha256, type ObservabilityRunResult } from "./observabilityRunner";

export interface ObservabilityAggregate {
  schema: "evoworld.e2.3.aggregate.v1";
  eventSchema: typeof ECOLOGICAL_EVENT_SCHEMA;
  runId: string;
  seed: number;
  completedTicks: number;
  eventCounts: Record<string, number>;
  huntViews: Record<string, number>;
  deathCauses: Record<string, number>;
  foodWeb: ReturnType<typeof buildObservedFoodWeb>;
  ledgerTotals: Record<string, number>;
  snapshots: { ecosystem: EcologicalEvent[]; resource: EcologicalEvent[] };
  completeness: "COMPLETE" | "PARTIAL";
  eventPayloadSha256: string;
}

/** Aggregazione puramente derivata da eventi validati: nessuna nuova inferenza ecologica. */
export function aggregateRun(run: ObservabilityRunResult): ObservabilityAggregate {
  const events = run.events;
  const huntByView = {
    HUNT_ATTEMPT: selectHuntEvents(events, "HUNT_ATTEMPT").length,
    HUNT_SUCCESS: selectHuntEvents(events, "HUNT_SUCCESS").length,
    HUNT_FAILURE: selectHuntEvents(events, "HUNT_FAILURE").length,
    PREDATION: selectHuntEvents(events, "PREDATION").length,
  };
  const deathCauses: Record<string, number> = {};
  for (const event of filterEvents(events, { types: ["DEATH"] })) {
    const cause = String(event.payload.cause ?? "UNKNOWN");
    deathCauses[cause] = (deathCauses[cause] ?? 0) + 1;
  }
  const ledgerTotals: Record<string, number> = {};
  for (const flow of energyLedger(events)) {
    ledgerTotals[flow.flowType] = (ledgerTotals[flow.flowType] ?? 0) + flow.amount;
  }
  return {
    schema: "evoworld.e2.3.aggregate.v1",
    eventSchema: ECOLOGICAL_EVENT_SCHEMA,
    runId: run.manifest.runId,
    seed: run.manifest.seed,
    completedTicks: run.completedTicks,
    eventCounts: { ...run.eventSummary.byType },
    huntViews: huntByView,
    deathCauses,
    foodWeb: buildObservedFoodWeb(events),
    ledgerTotals,
    snapshots: {
      ecosystem: filterEvents(events, { types: ["ECOSYSTEM_SNAPSHOT"] }),
      resource: filterEvents(events, { types: ["RESOURCE_SNAPSHOT"] }),
    },
    completeness: run.eventSummary.completeness,
    eventPayloadSha256: eventsSha256(events),
  };
}

/** Verifica interna prima dell'export: schema, ID univoci, completezza dichiarata. */
export function validateRunForExport(run: ObservabilityRunResult): string[] {
  const errors: string[] = [];
  if (!run.validation.valid) errors.push(...run.validation.errors);
  const ids = new Set(run.events.map((event) => event.eventId));
  if (ids.size !== run.events.length) errors.push(`${run.manifest.runId}: duplicate eventId`);
  for (const event of run.events) {
    const check = validateEvent(event);
    if (!check.ok) errors.push(`${event.eventId}: ${check.errors.join("; ")}`);
  }
  if (run.eventSummary.criticalDropped > 0) {
    errors.push(`${run.manifest.runId}: critical events dropped (forbidden)`);
  }
  const expected = filterEvents(run.events, { types: ["HUNT_ATTEMPT"] }).length;
  const views = aggregateRun(run).huntViews;
  if (views.HUNT_SUCCESS + views.HUNT_FAILURE !== expected || views.PREDATION > views.HUNT_SUCCESS) {
    errors.push(`${run.manifest.runId}: inconsistent hunt views`);
  }
  return errors;
}

export interface ObservabilityExportInput {
  readonly experiment: string;
  readonly phase: string;
  readonly runs: readonly ObservabilityRunResult[];
  readonly outDir: string;
  readonly label: string;
  readonly executedAt: string;
  readonly codeCommit: string;
  readonly workingTreeDirty: boolean;
  readonly sourceSha256: string;
  readonly e1SourceSha256: string;
  readonly runtime?: { node: string; v8: string };
  readonly note?: string;
  readonly reproduction?: {
    env: Record<string, string>;
    command: string;
  };
  readonly extraAuxiliary?: Record<string, unknown>;
}

export interface ObservabilityExportResult {
  readonly manifest: E2Manifest;
  readonly dataset: E2Dataset;
  readonly payloadSha256: string;
  readonly archiveSha256: string;
  readonly archivePath: string;
  readonly manifestPath: string;
  readonly aggregates: readonly ObservabilityAggregate[];
  readonly validationErrors: readonly string[];
}

/** Esporta eventi + aggregati + manifest con lo schema dataset E2 immutato. */
export function exportObservabilityDataset(input: ObservabilityExportInput): ObservabilityExportResult {
  const validationErrors = input.runs.flatMap(validateRunForExport);
  if (validationErrors.length > 0) {
    throw new Error(`E2.3 export: invalid observability data\n${validationErrors.join("\n")}`);
  }

  const aggregates = input.runs.map(aggregateRun);
  const jsonlByRun: Record<string, string> = {};
  for (const run of input.runs) {
    const lines = run.events.map((event) => canonicalEventString(event)).join("\n");
    jsonlByRun[run.manifest.runId] = lines + (lines ? "\n" : "");
  }

  const scientificReport = {
    schema: "evoworld.e2.3.scientific-report.v1",
    eventSchema: ECOLOGICAL_EVENT_SCHEMA,
    totals: {
      runs: input.runs.length,
      events: input.runs.reduce((sum, run) => sum + run.events.length, 0),
      hunts: aggregates.reduce((sum, a) => sum + a.huntViews.HUNT_ATTEMPT, 0),
      predations: aggregates.reduce((sum, a) => sum + a.huntViews.PREDATION, 0),
      deaths: input.runs.reduce(
        (sum, run) => sum + filterEvents(run.events, { types: ["DEATH"] }).length,
        0,
      ),
      consumptions: input.runs.reduce(
        (sum, run) => sum + filterEvents(run.events, { types: ["RESOURCE_CONSUMPTION"] }).length,
        0,
      ),
      snapshots: aggregates.reduce((sum, a) => sum + a.snapshots.ecosystem.length + a.snapshots.resource.length, 0),
    },
    runs: aggregates.map((a) => ({
      runId: a.runId,
      seed: a.seed,
      completedTicks: a.completedTicks,
      eventCounts: a.eventCounts,
      huntViews: a.huntViews,
      deathCauses: a.deathCauses,
      foodWeb: a.foodWeb,
      ledgerTotals: a.ledgerTotals,
      completeness: a.completeness,
      eventPayloadSha256: a.eventPayloadSha256,
    })),
    scientificVerdict: "TECHNICAL_VALIDATION_ONLY",
  };

  const auxiliary = {
    eventSchema: ECOLOGICAL_EVENT_SCHEMA,
    categoryLegend: {
      OBSERVED: "evento emesso da un hook reale del motore o snapshot letto dallo stato",
      DERIVED: "vista calcolata da eventi osservati (ledger energetico, viste di caccia, rete trofica)",
      INFERRED: "non usato in questo dataset: nessuna inferenza ecologica prodotta",
      NON_EVALUABLE: "evento non osservabile: non emesso, mai ricostruito",
    },
    manifests: input.runs.map((run) => run.manifest),
    eventsByRun: Object.fromEntries(input.runs.map((run) => [run.manifest.runId, run.events])),
    jsonlByRun,
    jsonlSha256ByRun: Object.fromEntries(
      Object.entries(jsonlByRun).map(([runId, text]) => [runId, sha256(text)]),
    ),
    energyLedgerByRun: Object.fromEntries(
      input.runs.map((run) => [run.manifest.runId, energyLedger(run.events)]),
    ),
    energyLedgerCategory: "DERIVED",
    foodWebCategory: "OBSERVED",
    completenessByRun: Object.fromEntries(input.runs.map((run) => [run.manifest.runId, run.eventSummary])),
    eventPayloadSha256ByRun: Object.fromEntries(
      input.runs.map((run) => [run.manifest.runId, eventsSha256(run.events)]),
    ),
    ...(input.extraAuxiliary ?? {}),
  };

  const manifest = writeDataset(input.outDir, input.label, {
    phase: input.phase,
    experiment: input.experiment,
    env: {
      SEEDS: input.runs.map((run) => run.manifest.seed),
      TICKS: Math.max(...input.runs.map((run) => run.completedTicks)),
      SAMPLE_EVERY: 0,
    },
    scientificReport,
    // I risultati scientifici sono gli eventi; i tempi di esecuzione restano fuori.
    results: input.runs.map((run) => ({
      runId: run.manifest.runId,
      manifest: run.manifest,
      completedTicks: run.completedTicks,
      initialPopulation: run.initialPopulation,
      finalPopulation: run.finalPopulation,
      extinctAt: run.extinctAt,
      eventSummary: run.eventSummary,
      validation: run.validation,
    })),
    executedAt: input.executedAt,
    codeCommit: input.codeCommit,
    workingTreeDirty: input.workingTreeDirty,
    sourceSha256: input.sourceSha256,
    e1SourceSha256: input.e1SourceSha256,
    runtime: input.runtime,
    note: input.note,
    reproduction: input.reproduction,
    auxiliary,
    // Il campo `results` dello schema E2 generico è tipizzato RunResult[].
    // Qui contiene record E2.3 (EventSinkSummary, manifest, validazione):
    // il writer li tratta come dati opachi e vi applica stripVariableData.
  } as unknown as Parameters<typeof writeDataset>[2]);

  const archivePath = join(input.outDir, manifest.artifact);
  const manifestPath = join(input.outDir, `${input.label}.manifest.json`);
  const loaded = readDataset(archivePath, manifestPath);
  return {
    manifest,
    dataset: loaded.dataset,
    payloadSha256: loaded.payloadSha256,
    archiveSha256: manifest.archiveSha256,
    archivePath,
    manifestPath,
    aggregates,
    validationErrors,
  };
}

/** VerificaIntegrità: manifest ↔ archivio ↔ hash per-run ↔ validazione eventi. */
export function verifyObservabilityArtifact(
  archivePath: string,
  manifestPath: string,
): {
  ok: boolean;
  errors: string[];
  payloadSha256: string;
  archiveSha256: string;
} {
  const errors: string[] = [];
  const loaded = readDataset(archivePath, manifestPath);
  const dataset = loaded.dataset;
  if (dataset.schema !== E2_DATASET_SCHEMA) errors.push("unexpected dataset schema");
  const auxiliary = dataset.auxiliary as Record<string, unknown>;
  if (auxiliary.eventSchema !== ECOLOGICAL_EVENT_SCHEMA) errors.push("unexpected event schema");
  const eventsByRun = (auxiliary.eventsByRun ?? {}) as Record<string, EcologicalEvent[]>;
  const expectedHashes = (auxiliary.eventPayloadSha256ByRun ?? {}) as Record<string, string>;
  for (const [runId, events] of Object.entries(eventsByRun)) {
    if (eventsSha256(events) !== expectedHashes[runId]) errors.push(`${runId}: eventPayloadSha256 mismatch`);
    const ids = new Set(events.map((event) => event.eventId));
    if (ids.size !== events.length) errors.push(`${runId}: duplicate eventId`);
    for (const event of events) {
      const check = validateEvent(event);
      if (!check.ok) errors.push(`${event.eventId}: ${check.errors.join("; ")}`);
    }
  }
  const jsonl = (auxiliary.jsonlByRun ?? {}) as Record<string, string>;
  for (const [runId, text] of Object.entries(jsonl)) {
    if (sha256(text) !== (auxiliary.jsonlSha256ByRun as Record<string, string>)[runId]) {
      errors.push(`${runId}: jsonlSha256 mismatch`);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    payloadSha256: loaded.payloadSha256,
    archiveSha256: loaded.manifest?.archiveSha256 ?? "",
  };
}
