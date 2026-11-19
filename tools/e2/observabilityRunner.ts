/**
 * E2.3 — runner dedicato all'osservabilità ecologica.
 *
 * Non modifica tools/e1 e non tocca le API esistenti: costruisce un World,
 * applica una condizione iniziale già disponibile, collega un sink passivo e
 * restituisce eventi reali + manifest riproducibile. Il tempo di esecuzione è
 * l'unico campo variabile e va rimosso prima di qualsiasi confronto/hash.
 */
import { World } from "../../simulation/core/world";
import {
  ECOLOGICAL_EVENT_SCHEMA,
  InMemoryEventSink,
  canonicalEventString,
  validateEvent,
  type EcologicalEvent,
  type EcologicalEventType,
  type EventSinkSummary,
} from "../../simulation/ecology/observability";
import { sha256 } from "../e1/dataset";
import { applySetupWithInfo, type SetupKind } from "../e1/initialConditions";

export interface ObservabilityRunSpec {
  readonly id: string;
  readonly experimentId: string;
  readonly simulationId: string;
  readonly runId: string;
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly population: number;
  readonly ticks: number;
  readonly setup: SetupKind;
  readonly snapshotEveryTicks?: number;
  readonly enabledTypes?: readonly EcologicalEventType[];
  readonly sampleRates?: Partial<Record<EcologicalEventType, number>>;
  readonly samplingSeed?: number;
  readonly maxNonCriticalEvents?: number;
  readonly enableAdvancedGenome?: boolean;
  readonly enableGeneEffects?: boolean;
}

export interface ObservabilityRunManifest {
  readonly schema: "evoworld.e2.3.run-manifest.v1";
  readonly eventSchema: typeof ECOLOGICAL_EVENT_SCHEMA;
  readonly runId: string;
  readonly experimentId: string;
  readonly simulationId: string;
  readonly seed: number;
  readonly config: Readonly<Record<string, unknown>>;
  readonly configSha256: string;
  readonly logging: Readonly<{
    enabled: boolean;
    enabledTypes: readonly EcologicalEventType[] | null;
    sampleRates: Partial<Record<EcologicalEventType, number>> | null;
    samplingSeed: number;
    maxNonCriticalEvents: number | null;
    snapshotEveryTicks: number | null;
    criticalEventsNeverSampled: true;
  }>;
  readonly engineOptions: Readonly<{ enableAdvancedGenome: boolean; enableGeneEffects: boolean }>;
}

export interface ObservabilityRunResult {
  readonly manifest: ObservabilityRunManifest;
  readonly completedTicks: number;
  readonly initialPopulation: number;
  readonly finalPopulation: number;
  readonly extinctAt: number | null;
  readonly events: readonly EcologicalEvent[];
  readonly eventSummary: EventSinkSummary;
  readonly eventPayloadSha256: string;
  readonly validation: { valid: boolean; errors: string[] };
  /** Variabile: escluso da hash, dataset e confronto di riproducibilità. */
  readonly elapsedMs: number;
}

/** Costruisce il manifest senza campi variabili. */
export function buildObservabilityManifest(spec: ObservabilityRunSpec): ObservabilityRunManifest {
  const config = {
    seed: spec.seed,
    width: spec.width,
    height: spec.height,
    population: spec.population,
    ticks: spec.ticks,
    setup: spec.setup,
    snapshotEveryTicks: spec.snapshotEveryTicks ?? null,
    enableAdvancedGenome: spec.enableAdvancedGenome ?? true,
    enableGeneEffects: spec.enableGeneEffects ?? true,
  };
  return {
    schema: "evoworld.e2.3.run-manifest.v1",
    eventSchema: ECOLOGICAL_EVENT_SCHEMA,
    runId: spec.runId,
    experimentId: spec.experimentId,
    simulationId: spec.simulationId,
    seed: spec.seed,
    config,
    configSha256: sha256(canonicalEventString(config)),
    logging: {
      enabled: true,
      enabledTypes: spec.enabledTypes ?? null,
      sampleRates: spec.sampleRates ?? null,
      samplingSeed: spec.samplingSeed ?? 1,
      maxNonCriticalEvents: spec.maxNonCriticalEvents ?? null,
      snapshotEveryTicks: spec.snapshotEveryTicks ?? null,
      criticalEventsNeverSampled: true,
    },
    engineOptions: {
      enableAdvancedGenome: spec.enableAdvancedGenome ?? true,
      enableGeneEffects: spec.enableGeneEffects ?? true,
    },
  };
}

/** Hash del solo payload scientifico: indipendente da tempo e percorso. */
export function eventsSha256(events: readonly EcologicalEvent[]): string {
  return sha256(events.map((event) => canonicalEventString(event)).join("\n"));
}

/** Esegue un run osservato. Il sink è attaccato dopo l'eventuale setup. */
export function runObservability(spec: ObservabilityRunSpec): ObservabilityRunResult {
  const started = Date.now();
  const world = new World(
    { width: spec.width, height: spec.height, seed: spec.seed },
    spec.population,
    {
      enableAdvancedGenome: spec.enableAdvancedGenome ?? true,
      enableGeneEffects: spec.enableGeneEffects ?? true,
    },
  );
  const prepared = applySetupWithInfo(world, spec.setup);
  const activeWorld = prepared.world;

  const sink = new InMemoryEventSink({
    simulationId: spec.simulationId,
    experimentId: spec.experimentId,
    runId: spec.runId,
    enabledTypes: spec.enabledTypes,
    tickDuration: 1,
    ticksPerYear: 400,
    sampleRates: spec.sampleRates,
    samplingSeed: spec.samplingSeed ?? 1,
    maxNonCriticalEvents: spec.maxNonCriticalEvents,
    snapshotEveryTicks: spec.snapshotEveryTicks,
  });
  activeWorld.setEventSink(sink);

  const initialPopulation = activeWorld.organisms.length;
  let extinctAt: number | null = null;
  for (let i = 0; i < spec.ticks; i++) {
    activeWorld.step();
    if (activeWorld.organisms.length === 0 && extinctAt === null) extinctAt = activeWorld.tick;
    if (activeWorld.organisms.length === 0) break;
  }

  const events = sink.eventsSnapshot();
  const errors: string[] = [];
  for (const event of events) {
    const result = validateEvent(event);
    if (!result.ok) errors.push(`${event.eventId}: ${result.errors.join("; ")}`);
  }
  const ids = new Set(events.map((event) => event.eventId));
  if (ids.size !== events.length) errors.push("duplicate eventId");

  return {
    manifest: buildObservabilityManifest(spec),
    completedTicks: activeWorld.tick,
    initialPopulation,
    finalPopulation: activeWorld.organisms.length,
    extinctAt,
    events,
    eventSummary: sink.summary(),
    eventPayloadSha256: eventsSha256(events),
    validation: { valid: errors.length === 0, errors },
    elapsedMs: Date.now() - started,
  };
}

/** Confronto di riproducibilità: config, eventi e Completezza devono coincidere. */
export function compareRuns(a: ObservabilityRunResult, b: ObservabilityRunResult): {
  reproducible: boolean;
  differences: string[];
} {
  const differences: string[] = [];
  if (a.manifest.configSha256 !== b.manifest.configSha256) differences.push("configSha256");
  if (a.eventPayloadSha256 !== b.eventPayloadSha256) differences.push("eventPayloadSha256");
  if (a.completedTicks !== b.completedTicks) differences.push("completedTicks");
  if (a.initialPopulation !== b.initialPopulation) differences.push("initialPopulation");
  if (a.finalPopulation !== b.finalPopulation) differences.push("finalPopulation");
  if (a.extinctAt !== b.extinctAt) differences.push("extinctAt");
  if (a.eventSummary.completeness !== b.eventSummary.completeness) differences.push("completeness");
  return { reproducible: differences.length === 0, differences };
}
