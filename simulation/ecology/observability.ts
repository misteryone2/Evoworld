/**
 * E2.3 — Primitive di osservabilità ecologica.
 *
 * Modulo puro (nessuna dipendenza Node/browser): definisce lo schema evento,
 * il sink passivo usato dagli hook del motore, il logger in memoria e le viste
 * derivate. Il motore chiama solo `record()` su un sink opzionale; nessun hook
 * legge o modifica lo stato della simulazione, nessun hook usa il RNG del motore.
 *
 * Semantica fondamentale:
 * - un evento = una transizione reale osservata nel punto in cui avviene;
 * - HUNT_ATTEMPT / HUNT_SUCCESS / HUNT_FAILURE / PREDATION sono VISTE tipizzate
 *   dello stesso record immutabile, non record duplicati (nessun doppio conteggio);
 * - i flussi energetici sono campi dei record canonici; `energyLedger()` li
 *   proietta come vista DERIVED, non come eventi aggiuntivi;
 * - snapshots aggregati sono eventi di tipo distinto (`*_SNAPSHOT`), mai
 *   mescolati con eventi individuali.
 */

export const ECOLOGICAL_EVENT_SCHEMA = "evoworld.e2.3.event.v1";

export type ObservationCategory = "OBSERVED" | "DERIVED" | "INFERRED" | "NON_EVALUABLE";
export type Completeness = "COMPLETE" | "PARTIAL";
export type HuntView = "HUNT_ATTEMPT" | "HUNT_SUCCESS" | "HUNT_FAILURE" | "PREDATION";

/** Tipi di evento emessi dagli hook reali del motore o dal pipeline di snapshot. */
export type EcologicalEventType =
  | "HUNT_ATTEMPT"
  | "DEATH"
  | "REPRODUCTION"
  | "RESOURCE_CONSUMPTION"
  | "RESOURCE_DEPLETION"
  | "RESOURCE_REGENERATION"
  | "RESOURCE_SNAPSHOT"
  | "ECOSYSTEM_SNAPSHOT";

export type EventCategoryName = "PREDATION" | "MORTALITY" | "REPRODUCTION" | "RESOURCE" | "SNAPSHOT";

export const ECOLOGICAL_EVENT_TYPES: readonly EcologicalEventType[] = [
  "HUNT_ATTEMPT",
  "DEATH",
  "REPRODUCTION",
  "RESOURCE_CONSUMPTION",
  "RESOURCE_DEPLETION",
  "RESOURCE_REGENERATION",
  "RESOURCE_SNAPSHOT",
  "ECOSYSTEM_SNAPSHOT",
];

export const EVENT_CATEGORY: Readonly<Record<EcologicalEventType, EventCategoryName>> = {
  HUNT_ATTEMPT: "PREDATION",
  DEATH: "MORTALITY",
  REPRODUCTION: "REPRODUCTION",
  RESOURCE_CONSUMPTION: "RESOURCE",
  RESOURCE_DEPLETION: "RESOURCE",
  RESOURCE_REGENERATION: "RESOURCE",
  RESOURCE_SNAPSHOT: "SNAPSHOT",
  ECOSYSTEM_SNAPSHOT: "SNAPSHOT",
};

/**
 * Eventi scientificamente fondamentali: mai campionati, mai silenziosamente
 * droppati. I limits di memoria si applicano solo agli altri tipi.
 */
export const CRITICAL_EVENT_TYPES: ReadonlySet<EcologicalEventType> = new Set<EcologicalEventType>([
  "HUNT_ATTEMPT",
  "DEATH",
  "REPRODUCTION",
  "RESOURCE_CONSUMPTION",
]);

/** Campi payload obbligatori per tipo (validazione strutturale). */
export const REQUIRED_PAYLOAD_FIELDS: Readonly<Record<EcologicalEventType, readonly string[]>> = {
  HUNT_ATTEMPT: ["outcome", "predatorId", "preyId", "predatorSpeciesId", "preySpeciesId", "successChance", "energyTransferred"],
  DEATH: ["cause", "speciesId", "energy", "age"],
  REPRODUCTION: ["offspringId", "parentIds", "mode", "parentEnergyCost", "offspringEnergy"],
  RESOURCE_CONSUMPTION: ["organismId", "speciesId", "cellX", "cellY", "energyGained", "stockBefore", "energyBefore", "energyAfter"],
  RESOURCE_DEPLETION: ["cellX", "cellY", "regionKey", "stockBefore", "stockAfter", "quantityRemoved"],
  RESOURCE_REGENERATION: ["cellX", "cellY", "mode", "stockBefore", "stockAfter", "regrowth"],
  RESOURCE_SNAPSHOT: ["cellCount", "landCellCount", "meanVegetation", "totalVegetation"],
  ECOSYSTEM_SNAPSHOT: ["population", "speciesAlive", "meanEnergy", "completedTicks"],
};

export type EventValue = number | string | boolean | null;

/** Osservazione grezza emessa dal motore: il sink aggiunge identità, ID e tempo. */
export interface EcologicalObservation {
  readonly type: EcologicalEventType;
  readonly tick: number;
  readonly entityIds: readonly number[];
  readonly payload: Readonly<Record<string, EventValue>>;
  readonly source: string;
  readonly correlationId?: string;
}

/** Evento completo, immutabile, correlabile a run e tick. */
export interface EcologicalEvent {
  readonly eventId: string;
  readonly eventType: EcologicalEventType;
  readonly schemaVersion: typeof ECOLOGICAL_EVENT_SCHEMA;
  readonly simulationId: string;
  readonly experimentId: string | null;
  readonly runId: string;
  readonly tick: number;
  readonly simulationTime: number;
  readonly simulationYear: number;
  readonly category: ObservationCategory;
  readonly entityIds: readonly number[];
  readonly payload: Readonly<Record<string, EventValue>>;
  readonly source: string;
  readonly correlationId: string | null;
  readonly metadata: Readonly<{
    completeness: Completeness;
    sampled: boolean;
    engineDerived: boolean;
  }>;
}

/** Sink passivo: nessun valore di ritorno, nessun effetto sulla simulazione. */
export interface EcologicalEventSink {
  record(observation: EcologicalObservation): void;
  readonly snapshotEveryTicks?: number;
}

/** Sink disabilitato: un solo metodo vuoto, overhead minimo. */
export const NULL_EVENT_SINK: EcologicalEventSink = Object.freeze({
  record(_observation: EcologicalObservation): void {
    void _observation;
  },
});

export interface EventSinkConfig {
  readonly simulationId: string;
  readonly experimentId: string | null;
  readonly runId: string;
  /** Tipi abilitati; default = tutti. */
  readonly enabledTypes?: readonly EcologicalEventType[];
  /** Unità di tempo simulate per tick (documentato, default 1). */
  readonly tickDuration?: number;
  readonly ticksPerYear?: number;
  /** Tassi di campionamento SOLO per tipi non critici. */
  readonly sampleRates?: Partial<Record<EcologicalEventType, number>>;
  /** Seed separato dal RNG del motore per il campionamento deterministico. */
  readonly samplingSeed?: number;
  /** Limite di eventi non critici; i critici non vengono mai droppati. */
  readonly maxNonCriticalEvents?: number;
  readonly snapshotEveryTicks?: number;
}

export interface EventSinkSummary {
  total: number;
  byType: Record<string, number>;
  sampled: number;
  droppedNonCritical: number;
  completeness: Completeness;
  firstTick: number | null;
  lastTick: number | null;
  criticalDropped: number;
}

export interface EventValidation {
  ok: boolean;
  errors: string[];
}

function localStableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => localStableStringify(v)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((k) => record[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${localStableStringify(record[k])}`).join(",")}}`;
}

/** RNG locale per il campionamento: stream separato e deterministico. */
function makeSampler(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Validazione strutturale: schema, identità, tick, payload e campi obbligatori. */
export function validateEvent(value: unknown): EventValidation {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, errors: ["event must be an object"] };
  }
  const e = value as Record<string, unknown>;
  if (e.schemaVersion !== ECOLOGICAL_EVENT_SCHEMA) errors.push(`schemaVersion: ${String(e.schemaVersion)}`);
  if (typeof e.eventId !== "string" || e.eventId.length === 0) errors.push("eventId");
  if (typeof e.runId !== "string" || e.runId.length === 0) errors.push("runId");
  if (typeof e.simulationId !== "string" || e.simulationId.length === 0) errors.push("simulationId");
  if (e.experimentId !== null && typeof e.experimentId !== "string") errors.push("experimentId");
  if (!Number.isInteger(e.tick) || (e.tick as number) < 0) errors.push("tick");
  if (typeof e.simulationTime !== "number" || !Number.isFinite(e.simulationTime)) errors.push("simulationTime");
  if (!Number.isInteger(e.simulationYear) || (e.simulationYear as number) < 0) errors.push("simulationYear");
  if (typeof e.source !== "string" || e.source.length === 0) errors.push("source");
  if (!["OBSERVED", "DERIVED", "INFERRED", "NON_EVALUABLE"].includes(String(e.category))) errors.push("category");
  if (e.correlationId !== null && typeof e.correlationId !== "string") errors.push("correlationId");
  if (!Array.isArray(e.entityIds) || !e.entityIds.every((id) => Number.isInteger(id))) errors.push("entityIds");
  const type = String(e.eventType) as EcologicalEventType;
  if (!ECOLOGICAL_EVENT_TYPES.includes(type)) {
    errors.push(`eventType: ${String(e.eventType)}`);
  } else {
    const payload = e.payload;
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      errors.push("payload must be an object");
    } else {
      const payloadRecord = payload as Record<string, unknown>;
      for (const [key, val] of Object.entries(payloadRecord)) {
        if (val !== null && typeof val !== "number" && typeof val !== "string" && typeof val !== "boolean") {
          errors.push(`payload.${key}: unsupported type`);
        } else if (typeof val === "number" && !Number.isFinite(val)) {
          errors.push(`payload.${key}: non-finite number`);
        }
      }
      for (const field of REQUIRED_PAYLOAD_FIELDS[type]) {
        if (payloadRecord[field] === undefined) errors.push(`payload.${field}: required for ${type}`);
      }
    }
  }
  const metadata = e.metadata;
  if (typeof metadata !== "object" || metadata === null) {
    errors.push("metadata");
  } else {
    const m = metadata as Record<string, unknown>;
    if (m.completeness !== "COMPLETE" && m.completeness !== "PARTIAL") errors.push("metadata.completeness");
    if (typeof m.sampled !== "boolean") errors.push("metadata.sampled");
    if (typeof m.engineDerived !== "boolean") errors.push("metadata.engineDerived");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Logger in memoria, passivo e deterministica.
 * - tipi critici: sempre conservati;
 * - tipi non critici: campionamento opzionale e buffer limitato;
 * - `completeness` globale = PARTIAL se qualcosa è stato campionato o droppato.
 */
export class InMemoryEventSink implements EcologicalEventSink {
  readonly snapshotEveryTicks?: number;
  private readonly config: EventSinkConfig;
  private readonly enabled: ReadonlySet<EcologicalEventType>;
  private readonly rates: Partial<Record<EcologicalEventType, number>>;
  private readonly sample: () => number;
  private readonly maxNonCritical: number;
  private readonly events: EcologicalEvent[] = [];
  private seq = 0;
  private sampledCount = 0;
  private droppedNonCritical = 0;
  private criticalDropped = 0;

  constructor(config: EventSinkConfig) {
    this.config = config;
    this.enabled = new Set(config.enabledTypes ?? ECOLOGICAL_EVENT_TYPES);
    this.rates = config.sampleRates ?? {};
    for (const type of Object.keys(this.rates) as EcologicalEventType[]) {
      if (this.rates[type] !== undefined && CRITICAL_EVENT_TYPES.has(type)) {
        throw new Error(`E2.3: critical event type cannot be sampled: ${type}`);
      }
    }
    this.sample = makeSampler(config.samplingSeed ?? 1);
    this.maxNonCritical = Number.isFinite(config.maxNonCriticalEvents)
      ? Math.max(0, Math.floor(config.maxNonCriticalEvents as number))
      : Number.POSITIVE_INFINITY;
    this.snapshotEveryTicks = config.snapshotEveryTicks;
  }

  record(observation: EcologicalObservation): void {
    if (!this.enabled.has(observation.type)) return;

    let sampled = false;
    const rate = this.rates[observation.type] ?? 1;
    if (rate < 1 && !CRITICAL_EVENT_TYPES.has(observation.type)) {
      if (this.sample() >= rate) {
        this.droppedNonCritical++;
        return;
      }
      sampled = true;
      this.sampledCount++;
    }

    const critical = CRITICAL_EVENT_TYPES.has(observation.type);
    if (!critical && this.events.length >= this.maxNonCritical) {
      this.droppedNonCritical++;
      return;
    }
    if (critical && this.events.length >= Number.MAX_SAFE_INTEGER - 1) {
      this.criticalDropped++;
      return;
    }

    const tick = observation.tick;
    const tickDuration = this.config.tickDuration ?? 1;
    const ticksPerYear = this.config.ticksPerYear ?? 400;
    const eventId = `${this.config.runId}:${String(tick).padStart(10, "0")}:${String(this.seq++).padStart(8, "0")}`;
    const payload = Object.freeze({ ...observation.payload });
    const entityIds = Object.freeze([...observation.entityIds]);
    const metadata = Object.freeze({
      completeness: (sampled || this.droppedNonCritical > 0 ? "PARTIAL" : "COMPLETE") as Completeness,
      sampled,
      engineDerived: true,
    });
    const event: EcologicalEvent = Object.freeze({
      eventId,
      eventType: observation.type,
      schemaVersion: ECOLOGICAL_EVENT_SCHEMA,
      simulationId: this.config.simulationId,
      experimentId: this.config.experimentId,
      runId: this.config.runId,
      tick,
      simulationTime: tick * tickDuration,
      simulationYear: Math.floor(tick / ticksPerYear),
      category: "OBSERVED" as ObservationCategory,
      entityIds,
      payload,
      source: observation.source,
      correlationId: observation.correlationId ?? null,
      metadata,
    });
    this.events.push(event);
  }

  /** Copia ordinata degli eventi registrati (ordine di emissione deterministica). */
  eventsSnapshot(): readonly EcologicalEvent[] {
    return [...this.events];
  }

  summary(): EventSinkSummary {
    const byType: Record<string, number> = {};
    let firstTick: number | null = null;
    let lastTick: number | null = null;
    for (const event of this.events) {
      byType[event.eventType] = (byType[event.eventType] ?? 0) + 1;
      if (firstTick === null || event.tick < firstTick) firstTick = event.tick;
      if (lastTick === null || event.tick > lastTick) lastTick = event.tick;
    }
    const partial = this.sampledCount > 0 || this.droppedNonCritical > 0 || this.criticalDropped > 0;
    return {
      total: this.events.length,
      byType,
      sampled: this.sampledCount,
      droppedNonCritical: this.droppedNonCritical,
      completeness: partial ? "PARTIAL" : "COMPLETE",
      firstTick,
      lastTick,
      criticalDropped: this.criticalDropped,
    };
  }

  /** Export JSONL canonico (una riga per evento, chiavi ordinate). */
  toJSONL(): string {
    return this.events.map((event) => localStableStringify(event)).join("\n") + (this.events.length ? "\n" : "");
  }
}

/** Serializzazione canonica condivisa con il pipeline (nessuna dipendenza Node). */
export function canonicalEventString(value: unknown): string {
  return localStableStringify(value);
}

/**
 * Viste sulla caccia. Un singolo HUNT_ATTEMPT osservato può essere letto come
 * tentativo, successo, fallimento o predazione: sono VISTE, non eventi extra.
 * `PREDATION` richiede la prova del consumo (preyDeathCorrelationId presente).
 */
export function selectHuntEvents(events: readonly EcologicalEvent[], view: HuntView): EcologicalEvent[] {
  const attempts = events.filter((event) => event.eventType === "HUNT_ATTEMPT");
  switch (view) {
    case "HUNT_ATTEMPT":
      return attempts;
    case "HUNT_SUCCESS":
      return attempts.filter((event) => event.payload.outcome === "SUCCESS");
    case "HUNT_FAILURE":
      return attempts.filter((event) => event.payload.outcome === "FAILURE");
    case "PREDATION":
      return attempts.filter(
        (event) => event.payload.outcome === "SUCCESS" && typeof event.payload.preyDeathCorrelationId === "string",
      );
  }
}

/** Voce di ledger energetico DERIVED: proiezione dei campi reali dei record. */
export interface EnergyFlow {
  readonly category: "DERIVED";
  readonly tick: number;
  readonly entityId: number;
  readonly flowType: string;
  readonly amount: number;
  readonly correlationId: string | null;
  readonly sourceEventId: string;
}

/**
 * Ledger energetico derivato. NON è un inventario di conservazione: il motore
 * non sottrae l'energia residua della preda quando la uccide, quindi il flusso
 * da preda a predatore è una misura del guadagno, non un trasferimento chiuso.
 */
export function energyLedger(events: readonly EcologicalEvent[]): EnergyFlow[] {
  const out: EnergyFlow[] = [];
  const push = (event: EcologicalEvent, entityId: number, flowType: string, amount: number): void => {
    if (!Number.isFinite(amount) || amount === 0) return;
    out.push({
      category: "DERIVED",
      tick: event.tick,
      entityId,
      flowType,
      amount,
      correlationId: event.correlationId,
      sourceEventId: event.eventId,
    });
  };
  for (const event of events) {
    const p = event.payload;
    if (event.eventType === "HUNT_ATTEMPT") {
      const predator = Number(p.predatorId);
      const prey = Number(p.preyId);
      push(event, predator, "HUNT_ATTEMPT_COST", -Number(p.attemptCost ?? 0) - Number(p.burstCostPredator ?? 0));
      push(event, prey, "BURST_COST_PREY", -Number(p.burstCostPrey ?? 0));
      push(event, predator, "PREDATION_GAIN", Number(p.energyTransferred ?? 0));
    } else if (event.eventType === "RESOURCE_CONSUMPTION") {
      push(event, Number(p.organismId), "VEGETATION_GAIN", Number(p.energyGained ?? 0));
    } else if (event.eventType === "REPRODUCTION") {
      const parents = String(p.parentIds ?? "").split(",").filter(Boolean).map(Number);
      const cost = Number(p.parentEnergyCost ?? 0);
      for (const parent of parents) push(event, parent, "REPRODUCTION_COST", -cost);
      if (p.mateEnergyCost !== undefined) push(event, Number(p.mateId ?? parents[0] ?? -1), "MATE_COST", -Number(p.mateEnergyCost));
    }
  }
  return out;
}

/** Rete trofica OBSERVED: archi costruiti solo da eventi di caccia reali. */
export interface ObservedTrophicEdge {
  readonly category: "OBSERVED";
  readonly predatorSpeciesId: number;
  readonly preySpeciesId: number;
  attempts: number;
  successes: number;
  failures: number;
  energyTransferred: number;
  firstTick: number;
  lastTick: number;
}

export function buildObservedFoodWeb(events: readonly EcologicalEvent[]): ObservedTrophicEdge[] {
  const edges = new Map<string, ObservedTrophicEdge>();
  for (const event of selectHuntEvents(events, "HUNT_ATTEMPT")) {
    const predatorSpeciesId = Number(event.payload.predatorSpeciesId);
    const preySpeciesId = Number(event.payload.preySpeciesId);
    if (!Number.isInteger(predatorSpeciesId) || !Number.isInteger(preySpeciesId)) continue;
    const key = `${predatorSpeciesId}->${preySpeciesId}`;
    let edge = edges.get(key);
    if (!edge) {
      edge = {
        category: "OBSERVED",
        predatorSpeciesId,
        preySpeciesId,
        attempts: 0,
        successes: 0,
        failures: 0,
        energyTransferred: 0,
        firstTick: event.tick,
        lastTick: event.tick,
      };
      edges.set(key, edge);
    }
    edge.attempts++;
    if (event.payload.outcome === "SUCCESS") {
      edge.successes++;
      edge.energyTransferred += Number(event.payload.energyTransferred ?? 0);
    } else {
      edge.failures++;
    }
    edge.firstTick = Math.min(edge.firstTick, event.tick);
    edge.lastTick = Math.max(edge.lastTick, event.tick);
  }
  return [...edges.values()].sort((a, b) => a.predatorSpeciesId - b.predatorSpeciesId || a.preySpeciesId - b.preySpeciesId);
}

/** Filtra eventi per tipo, tick o corsa (filtraggio esplicito, nessuna inferenza). */
export function filterEvents(
  events: readonly EcologicalEvent[],
  criteria: { types?: readonly EcologicalEventType[]; tick?: number; runId?: string; correlationId?: string },
): EcologicalEvent[] {
  return events.filter((event) => {
    if (criteria.types && !criteria.types.includes(event.eventType)) return false;
    if (criteria.tick !== undefined && event.tick !== criteria.tick) return false;
    if (criteria.runId !== undefined && event.runId !== criteria.runId) return false;
    if (criteria.correlationId !== undefined && event.correlationId !== criteria.correlationId) return false;
    return true;
  });
}
