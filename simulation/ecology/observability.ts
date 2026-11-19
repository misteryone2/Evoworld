/**
 * E2.3 / E2.3.1 — Primitive di osservabilità ecologica.
 *
 * Modulo puro (nessuna dipendenza Node/browser): definisce lo schema evento,
 * il sink passivo usato dagli hook del motore, il logger in memoria, le viste
 * derivate, il ledger energetico e i controlli di integrità delle correlazioni.
 *
 * Semantica fondamentale:
 * - un evento = una transizione reale osservata nel punto in cui avviene;
 * - HUNT_ATTEMPT / HUNT_SUCCESS / HUNT_FAILURE / PREDATION sono VISTE tipizzate
 *   dello stesso record immutabile, non record duplicati (nessun doppio conteggio);
 * - i flussi energetici sono campi dei record canonici; `energyLedger()` li
 *   proietta come vista DERIVED, non come eventi aggiuntivi;
 * - snapshots aggregati sono eventi di tipo distinto (`*_SNAPSHOT`), mai
 *   mescolati con eventi individuali.
 *
 * E2.3.1:
 * - schema v2 con ruoli genitoriali espliciti (correzione E-REV-01);
 * - classificazione centralizzata CRITICAL / NON_CRITICAL / DIAGNOSTIC e
 *   profili scientific_full / partial / diagnostic (correzione E-REV-02);
 * - verifica reale delle correlazioni predazione ↔ morte (E-REV-03).
 */

export const ECOLOGICAL_EVENT_SCHEMA_V1 = "evoworld.e2.3.event.v1";
export const ECOLOGICAL_EVENT_SCHEMA = "evoworld.e2.3.event.v2";
export const SUPPORTED_EVENT_SCHEMAS: readonly string[] = [ECOLOGICAL_EVENT_SCHEMA_V1, ECOLOGICAL_EVENT_SCHEMA];

export type EventSchemaVersion = typeof ECOLOGICAL_EVENT_SCHEMA_V1 | typeof ECOLOGICAL_EVENT_SCHEMA;
export type ObservationCategory = "OBSERVED" | "DERIVED" | "INFERRED" | "NON_EVALUABLE";
export type Completeness = "COMPLETE" | "PARTIAL";
export type HuntView = "HUNT_ATTEMPT" | "HUNT_SUCCESS" | "HUNT_FAILURE" | "PREDATION";
export type EventImportance = "CRITICAL" | "NON_CRITICAL" | "DIAGNOSTIC";
export type ObservationProfile = "scientific_full" | "partial" | "diagnostic";

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
 * E2.3.1 — classificazione centralizzata e documentata.
 * CRITICAL: fondamentali per qualsiasi affermazione scientifica; mai campionati.
 * NON_CRITICAL: eventi reali ma limitabili per motivi di memoria; la limitazione
 *   va dichiarata e degrada la completezza se sono richiesti dal profilo.
 * DIAGNOSTIC: snapshot aggregati; utili al controllo, mai usati come eventi
 *   individuali e mai sufficienti per dichiarare un dataset scientifico completo.
 */
export const EVENT_IMPORTANCE: Readonly<Record<EcologicalEventType, EventImportance>> = {
  HUNT_ATTEMPT: "CRITICAL",
  DEATH: "CRITICAL",
  REPRODUCTION: "CRITICAL",
  RESOURCE_CONSUMPTION: "CRITICAL",
  RESOURCE_DEPLETION: "NON_CRITICAL",
  RESOURCE_REGENERATION: "NON_CRITICAL",
  RESOURCE_SNAPSHOT: "DIAGNOSTIC",
  ECOSYSTEM_SNAPSHOT: "DIAGNOSTIC",
};

export const CRITICAL_EVENT_TYPES: ReadonlySet<EcologicalEventType> = new Set(
  ECOLOGICAL_EVENT_TYPES.filter((type) => EVENT_IMPORTANCE[type] === "CRITICAL"),
);
export const NON_CRITICAL_EVENT_TYPES: ReadonlySet<EcologicalEventType> = new Set(
  ECOLOGICAL_EVENT_TYPES.filter((type) => EVENT_IMPORTANCE[type] === "NON_CRITICAL"),
);
export const DIAGNOSTIC_EVENT_TYPES: ReadonlySet<EcologicalEventType> = new Set(
  ECOLOGICAL_EVENT_TYPES.filter((type) => EVENT_IMPORTANCE[type] === "DIAGNOSTIC"),
);

/** Tipi richiesti per profilo quando non vengono dichiarati esplicitamente. */
export const DEFAULT_REQUIRED_TYPES: Readonly<Record<ObservationProfile, readonly EcologicalEventType[]>> = {
  scientific_full: ECOLOGICAL_EVENT_TYPES.filter((type) => EVENT_IMPORTANCE[type] !== "DIAGNOSTIC"),
  partial: [...CRITICAL_EVENT_TYPES],
  diagnostic: [],
};

/** Campi payload obbligatori nello schema corrente (v2). */
export const REQUIRED_PAYLOAD_FIELDS: Readonly<Record<EcologicalEventType, readonly string[]>> = {
  HUNT_ATTEMPT: ["outcome", "predatorId", "preyId", "predatorSpeciesId", "preySpeciesId", "successChance", "energyTransferred"],
  DEATH: ["cause", "speciesId", "energy", "age"],
  REPRODUCTION: [
    "offspringId",
    "parentIds",
    "mode",
    "primaryParentId",
    "primaryParentEnergyCost",
    "primaryParentEnergyBefore",
    "primaryParentEnergyAfter",
    "secondaryParentId",
    "secondaryParentEnergyCost",
    "secondaryParentEnergyBefore",
    "secondaryParentEnergyAfter",
    "costAttribution",
    "offspringEnergy",
  ],
  RESOURCE_CONSUMPTION: ["organismId", "speciesId", "cellX", "cellY", "energyGained", "stockBefore", "energyBefore", "energyAfter"],
  RESOURCE_DEPLETION: ["cellX", "cellY", "regionKey", "stockBefore", "stockAfter", "quantityRemoved"],
  RESOURCE_REGENERATION: ["cellX", "cellY", "mode", "stockBefore", "stockAfter", "regrowth"],
  RESOURCE_SNAPSHOT: ["cellCount", "landCellCount", "meanVegetation", "totalVegetation"],
  ECOSYSTEM_SNAPSHOT: ["population", "speciesAlive", "meanEnergy", "completedTicks"],
};

/** Campi obbligatori dello schema legacy v1: ancora importabile, mai emesso dal nuovo codice. */
export const LEGACY_REQUIRED_PAYLOAD_FIELDS: Readonly<Record<EcologicalEventType, readonly string[]>> = {
  ...REQUIRED_PAYLOAD_FIELDS,
  REPRODUCTION: ["offspringId", "parentIds", "mode", "parentEnergyCost", "offspringEnergy"],
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
  readonly schemaVersion: EventSchemaVersion;
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

/** Destinatario di batch per flush incrementale; nessuna dipendenza Node. */
export interface EventBatchWriter {
  writeBatch(events: readonly EcologicalEvent[]): void;
}

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
  /** E2.3.1 — limite esplicito di eventi critici (default illimitato). */
  readonly maxCriticalEvents?: number;
  readonly snapshotEveryTicks?: number;
  /** E2.3.1 — profilo di completezza del run. */
  readonly profile?: ObservationProfile;
  /** E2.3.1 — tipi richiesti dal profilo; default derivato dal profilo. */
  readonly requiredTypes?: readonly EcologicalEventType[];
  /** E2.3.1 — motivazione dichiarata per eventuali tipi disabilitati. */
  readonly disabledReason?: string;
  /** E2.3.1 — flush incrementale opzionale. */
  readonly batchWriter?: EventBatchWriter;
  readonly flushEveryEvents?: number;
  /** Rilascia gli eventi dal buffer dopo un flush riuscito (run lunghi). */
  readonly releaseAfterFlush?: boolean;
}

export interface EventSinkSummary {
  /** Eventi registrati in totale (indipendenti dal rilascio del buffer). */
  total: number;
  /** Eventi ancora trattenuti in memoria dopo eventuali flush incrementali. */
  retained: number;
  byType: Record<string, number>;
  sampled: number;
  droppedNonCritical: number;
  completeness: Completeness;
  firstTick: number | null;
  lastTick: number | null;
  criticalDropped: number;
  profile: ObservationProfile;
  requiredTypes: readonly EcologicalEventType[];
  enabledTypes: readonly EcologicalEventType[];
  disabledTypes: readonly EcologicalEventType[];
  disabledReason: string | null;
  attemptsByType: Record<string, number>;
  lostByType: Record<string, number>;
  /** Richiesti e abilitati, ma con tentativi osservati e nessun record scritto. */
  unrecordedRequiredTypes: readonly EcologicalEventType[];
  missingRequiredTypes: readonly EcologicalEventType[];
  missingCategories: readonly EventImportance[];
  declaredCoverageComplete: boolean;
  coverageComplete: boolean;
  flushedBatches: number;
  flushedEvents: number;
  flushErrors: number;
  flushErrorMessages: readonly string[];
}

export interface EventValidation {
  ok: boolean;
  errors: string[];
}

export interface EventValidationOptions {
  /** Se true accetta solo lo schema corrente (v2), non i dataset legacy v1. */
  requireCurrentSchema?: boolean;
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
export function validateEvent(value: unknown, options: EventValidationOptions = {}): EventValidation {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, errors: ["event must be an object"] };
  }
  const e = value as Record<string, unknown>;
  const schema = String(e.schemaVersion);
  if (options.requireCurrentSchema && schema !== ECOLOGICAL_EVENT_SCHEMA) {
    errors.push(`schemaVersion: ${schema} (current schema required)`);
  } else if (!SUPPORTED_EVENT_SCHEMAS.includes(schema)) {
    errors.push(`schemaVersion: ${schema}`);
  }
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
      const fields = schema === ECOLOGICAL_EVENT_SCHEMA_V1 ? LEGACY_REQUIRED_PAYLOAD_FIELDS[type] : REQUIRED_PAYLOAD_FIELDS[type];
      for (const field of fields) {
        if (payloadRecord[field] === undefined) errors.push(`payload.${field}: required for ${type} (${schema})`);
      }
      if (type === "REPRODUCTION" && schema === ECOLOGICAL_EVENT_SCHEMA) {
        const secondaryId = payloadRecord.secondaryParentId;
        if (secondaryId !== null && (!Number.isInteger(secondaryId) || (secondaryId as number) < 0)) {
          errors.push("payload.secondaryParentId: must be a non-negative integer or null");
        }
        if (typeof payloadRecord.costAttribution !== "string") errors.push("payload.costAttribution");
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
 * Logger in memoria, passivo e deterministico.
 * - tipi critici: sempre conservati (salvo limite esplicito, che degrada a PARTIAL);
 * - tipi non critici: campionamento opzionale e buffer limitato;
 * - profilo scientific_full vieta la disabilitazione dei tipi critici;
 * - completeness è calcolata sulla copertura richiesta, non solo sulle perdite
 *   dopo la configurazione.
 */
export class InMemoryEventSink implements EcologicalEventSink {
  readonly snapshotEveryTicks?: number;
  private readonly config: EventSinkConfig;
  private readonly enabled: ReadonlySet<EcologicalEventType>;
  private readonly required: ReadonlySet<EcologicalEventType>;
  private readonly rates: Partial<Record<EcologicalEventType, number>>;
  private readonly sample: () => number;
  private readonly maxNonCritical: number;
  private readonly maxCritical: number;
  private readonly declaredCoverageComplete: boolean;
  private readonly events: EcologicalEvent[] = [];
  private pending: EcologicalEvent[] = [];
  private seq = 0;
  private recordedTotal = 0;
  private recordedByType: Record<string, number> = {};
  private recordedFirstTick: number | null = null;
  private recordedLastTick: number | null = null;
  private nonCriticalRecorded = 0;
  private criticalRecorded = 0;
  private sampledCount = 0;
  private droppedNonCritical = 0;
  private criticalDropped = 0;
  private attemptsByType: Record<string, number> = {};
  private lostByType: Record<string, number> = {};
  private flushedBatches = 0;
  private flushedEvents = 0;
  private flushErrors = 0;
  private flushErrorMessages: string[] = [];
  private flushBlocked = false;

  constructor(config: EventSinkConfig) {
    this.config = config;
    const profile = config.profile ?? "scientific_full";
    if (profile === "scientific_full" && config.enabledTypes) {
      const disabledCritical = [...CRITICAL_EVENT_TYPES].filter((type) => !config.enabledTypes!.includes(type));
      if (disabledCritical.length) {
        throw new Error(`E2.3.1: scientific_full profile forbids disabling critical event types: ${disabledCritical.join(", ")}`);
      }
    }
    this.enabled = new Set(config.enabledTypes ?? ECOLOGICAL_EVENT_TYPES);
    const disabledTypes = ECOLOGICAL_EVENT_TYPES.filter((type) => !this.enabled.has(type));
    this.required = new Set(config.requiredTypes ?? DEFAULT_REQUIRED_TYPES[profile]);
    this.rates = config.sampleRates ?? {};
    for (const type of Object.keys(this.rates) as EcologicalEventType[]) {
      if (this.rates[type] !== undefined && CRITICAL_EVENT_TYPES.has(type)) {
        throw new Error(`E2.3.1: critical event type cannot be sampled: ${type}`);
      }
    }
    this.sample = makeSampler(config.samplingSeed ?? 1);
    this.maxNonCritical = Number.isFinite(config.maxNonCriticalEvents)
      ? Math.max(0, Math.floor(config.maxNonCriticalEvents as number))
      : Number.POSITIVE_INFINITY;
    this.maxCritical = Number.isFinite(config.maxCriticalEvents)
      ? Math.max(0, Math.floor(config.maxCriticalEvents as number))
      : Number.MAX_SAFE_INTEGER;
    // La copertura dichiarata è verificabile già in fase di costruzione:
    // profilo diagnostico, tipi richiesti disabilitati o campionati e limite
    // esplicito sugli eventi critici impediscono sin da subito COMPLETE.
    this.declaredCoverageComplete = profile === "scientific_full"
      && disabledTypes.length === 0
      && config.maxCriticalEvents === undefined
      && [...this.required].every((type) =>
        this.enabled.has(type) && (this.rates[type] ?? 1) >= 1);
    this.snapshotEveryTicks = config.snapshotEveryTicks;
  }

  record(observation: EcologicalObservation): void {
    const type = observation.type;
    this.attemptsByType[type] = (this.attemptsByType[type] ?? 0) + 1;
    if (!this.enabled.has(type)) {
      this.lostByType[type] = (this.lostByType[type] ?? 0) + 1;
      return;
    }

    let sampled = false;
    const rate = this.rates[type] ?? 1;
    if (rate < 1 && !CRITICAL_EVENT_TYPES.has(type)) {
      if (this.sample() >= rate) {
        this.droppedNonCritical++;
        this.lostByType[type] = (this.lostByType[type] ?? 0) + 1;
        return;
      }
      sampled = true;
      this.sampledCount++;
    }

    const critical = CRITICAL_EVENT_TYPES.has(type);
    if (!critical && this.nonCriticalRecorded >= this.maxNonCritical) {
      this.droppedNonCritical++;
      this.lostByType[type] = (this.lostByType[type] ?? 0) + 1;
      return;
    }
    if (critical && this.criticalRecorded >= this.maxCritical) {
      this.criticalDropped++;
      this.lostByType[type] = (this.lostByType[type] ?? 0) + 1;
      return;
    }

    const tick = observation.tick;
    const tickDuration = this.config.tickDuration ?? 1;
    const ticksPerYear = this.config.ticksPerYear ?? 400;
    const eventId = `${this.config.runId}:${String(tick).padStart(10, "0")}:${String(this.seq++).padStart(8, "0")}`;
    const payload = Object.freeze({ ...observation.payload });
    const entityIds = Object.freeze([...observation.entityIds]);
    // I record sono immutabili: la completezza riflette la copertura dichiarata
    // e lo sampling al momento dell'emissione. Perdite sopraggiunte (flush,
    // overflow) sono riportate nel riepilogo/manifest, che è la classificazione
    // autorevole del dataset.
    const metadata = Object.freeze({
      completeness: (sampled || !this.declaredCoverageComplete ? "PARTIAL" : "COMPLETE") as Completeness,
      sampled,
      engineDerived: true,
    });
    const event: EcologicalEvent = Object.freeze({
      eventId,
      eventType: type,
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
    this.pending.push(event);
    this.recordedTotal++;
    this.recordedByType[type] = (this.recordedByType[type] ?? 0) + 1;
    if (this.recordedFirstTick === null || tick < this.recordedFirstTick) this.recordedFirstTick = tick;
    if (this.recordedLastTick === null || tick > this.recordedLastTick) this.recordedLastTick = tick;
    if (critical) this.criticalRecorded++;
    else this.nonCriticalRecorded++;
    const every = this.config.flushEveryEvents;
    if (every && every > 0 && this.pending.length >= every && !this.flushBlocked) this.flush();
  }

  private hasAnyLoss(): boolean {
    return this.sampledCount > 0
      || this.droppedNonCritical > 0
      || this.criticalDropped > 0
      || this.flushErrors > 0
      || Object.values(this.lostByType).some((n) => n > 0);
  }

  /**
   * Flush incrementale. In caso di errore conserva il batch, segna il run come
   * PARTIAL e sospende il flush automatico fino a una chiamata esplicita riuscita.
   */
  flush(): void {
    if (this.pending.length === 0) return;
    const writer = this.config.batchWriter;
    if (!writer) {
      this.pending = [];
      return;
    }
    const batch = [...this.pending];
    try {
      writer.writeBatch(batch);
      this.flushedBatches++;
      this.flushedEvents += batch.length;
      if (this.config.releaseAfterFlush) {
        const released = new Set(batch.map((event) => event.eventId));
        for (let i = this.events.length - 1; i >= 0; i--) {
          if (released.has(this.events[i].eventId)) this.events.splice(i, 1);
        }
      }
      this.pending = [];
      this.flushBlocked = false;
    } catch (error) {
      this.flushErrors++;
      this.flushErrorMessages.push(String(error));
      this.flushBlocked = true;
    }
  }

  /** Copia ordinata degli eventi registrati (ordine di emissione deterministica). */
  eventsSnapshot(): readonly EcologicalEvent[] {
    return [...this.events];
  }

  summary(): EventSinkSummary {
    const profile = this.config.profile ?? "scientific_full";
    const byType = { ...this.recordedByType };
    const enabledTypes = ECOLOGICAL_EVENT_TYPES.filter((type) => this.enabled.has(type));
    const disabledTypes = ECOLOGICAL_EVENT_TYPES.filter((type) => !this.enabled.has(type));
    const unrecordedRequiredTypes = ECOLOGICAL_EVENT_TYPES.filter((type) =>
      this.required.has(type)
      && this.enabled.has(type)
      && (this.attemptsByType[type] ?? 0) > 0
      && (this.recordedByType[type] ?? 0) === 0
      && (this.lostByType[type] ?? 0) === 0,
    );
    const missingRequiredTypes = ECOLOGICAL_EVENT_TYPES.filter((type) =>
      this.required.has(type)
      && (!this.enabled.has(type) || (this.lostByType[type] ?? 0) > 0 || unrecordedRequiredTypes.includes(type)),
    );
    const unavailableTypes = ECOLOGICAL_EVENT_TYPES.filter((type) =>
      disabledTypes.includes(type) || (this.lostByType[type] ?? 0) > 0 || missingRequiredTypes.includes(type));
    const missingCategories = (["CRITICAL", "NON_CRITICAL", "DIAGNOSTIC"] as EventImportance[]).filter((category) =>
      unavailableTypes.some((type) => EVENT_IMPORTANCE[type] === category),
    );
    const coverageComplete = this.declaredCoverageComplete
      && missingRequiredTypes.length === 0
      && !this.hasAnyLoss();
    return {
      total: this.recordedTotal,
      retained: this.events.length,
      byType,
      sampled: this.sampledCount,
      droppedNonCritical: this.droppedNonCritical,
      completeness: coverageComplete ? "COMPLETE" : "PARTIAL",
      firstTick: this.recordedFirstTick,
      lastTick: this.recordedLastTick,
      criticalDropped: this.criticalDropped,
      profile,
      requiredTypes: ECOLOGICAL_EVENT_TYPES.filter((type) => this.required.has(type)),
      enabledTypes,
      disabledTypes,
      disabledReason: this.config.disabledReason ?? null,
      attemptsByType: { ...this.attemptsByType },
      lostByType: { ...this.lostByType },
      unrecordedRequiredTypes,
      missingRequiredTypes,
      missingCategories,
      declaredCoverageComplete: this.declaredCoverageComplete,
      coverageComplete,
      flushedBatches: this.flushedBatches,
      flushedEvents: this.flushedEvents,
      flushErrors: this.flushErrors,
      flushErrorMessages: [...this.flushErrorMessages],
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

/* ------------------------------------------------------------------ */
/* Correlazione predazione ↔ morte (E-REV-03)                          */
/* ------------------------------------------------------------------ */

export type PredationRelationStatus =
  | "VERIFIED"
  | "UNVERIFIED"
  | "INCONSISTENT"
  | "AMBIGUOUS"
  | "ORPHAN"
  | "NON_EVALUABLE";

export interface PredationAttemptCheck {
  readonly eventId: string;
  readonly correlationId: string | null;
  readonly tick: number;
  readonly runId: string;
  readonly predatorId: number | null;
  readonly preyId: number | null;
  readonly deathEventId: string | null;
  readonly status: PredationRelationStatus;
  readonly reasons: readonly string[];
}

export interface PredationCorrelationReport {
  readonly status: PredationRelationStatus;
  readonly attemptChecks: readonly PredationAttemptCheck[];
  readonly orphanDeaths: readonly EcologicalEvent[];
  readonly counts: Readonly<Record<PredationRelationStatus, number>>;
  readonly errors: readonly string[];
}

export interface CorrelationCheckOptions {
  /** Completezza dichiarata del run/dataset: in caso PARTIAL le relazioni mancanti NON_EVALUABLE. */
  readonly completeness?: Completeness;
  /** Tipi richiesti dal profilo; se DEATH non richiesto, la mancanza NON_EVALUABLE. */
  readonly requiredTypes?: readonly EcologicalEventType[];
}

interface AttemptClassification {
  status: PredationRelationStatus;
  reasons: string[];
  death: EcologicalEvent | null;
}

function classifyAttempt(
  attempt: EcologicalEvent,
  deathsById: Map<string, EcologicalEvent[]>,
  deathsByHunt: Map<string, EcologicalEvent[]>,
  options: CorrelationCheckOptions,
): AttemptClassification {
  const reasons: string[] = [];
  const deathCorrelationId = attempt.payload.preyDeathCorrelationId;
  if (typeof deathCorrelationId !== "string" || !deathCorrelationId) {
    return { status: "INCONSISTENT", reasons: ["missing preyDeathCorrelationId on successful hunt"], death: null };
  }
  const candidates = deathsById.get(deathCorrelationId) ?? [];
  if (candidates.length === 0) {
    const partial = options.completeness === "PARTIAL"
      || (options.requiredTypes !== undefined && !options.requiredTypes.includes("DEATH"));
    // Un DEATH che punta allo stesso hunt ma con correlation ID diverso è una
    // anomalia reale, non semplice assenza: va segnalata come integrità errata.
    const mismatched = attempt.correlationId === null ? [] : (deathsByHunt.get(attempt.correlationId) ?? []);
    if (mismatched.length > 0) {
      return {
        status: "INCONSISTENT",
        reasons: ["preyDeathCorrelationId does not match the correlated DEATH event"],
        death: mismatched[0],
      };
    }
    return {
      status: partial ? "NON_EVALUABLE" : "UNVERIFIED",
      reasons: [partial ? "DEATH events not available in this dataset" : "no correlated DEATH event found"],
      death: null,
    };
  }
  if (candidates.length > 1) {
    return { status: "AMBIGUOUS", reasons: [`${candidates.length} DEATH events share preyDeathCorrelationId`], death: candidates[0] };
  }
  const death = candidates[0];
  const attemptPreyId = Number(attempt.payload.preyId);
  const deathPreyId = death.entityIds[0];
  const attemptPredatorId = Number(attempt.payload.predatorId);
  const deathPredatorId = death.payload.predatorId === null || death.payload.predatorId === undefined
    ? null
    : Number(death.payload.predatorId);
  if (!Number.isInteger(deathPreyId) || deathPreyId !== attemptPreyId) reasons.push("prey ID mismatch");
  if (death.payload.cause !== "PREDATION") reasons.push("death cause is not PREDATION");
  if (death.runId !== attempt.runId) reasons.push("runId mismatch");
  if (death.tick !== attempt.tick) reasons.push("tick mismatch");
  if (death.payload.huntCorrelationId !== attempt.correlationId) reasons.push("huntCorrelationId mismatch");
  if (deathPredatorId !== null && deathPredatorId !== attemptPredatorId) reasons.push("predator ID mismatch");
  return { status: reasons.length ? "INCONSISTENT" : "VERIFIED", reasons, death };
}

/** Verifica reale delle relazioni, valida anche su eventi importati. */
export function verifyPredationCorrelations(
  events: readonly EcologicalEvent[],
  options: CorrelationCheckOptions = {},
): PredationCorrelationReport {
  const deathsById = new Map<string, EcologicalEvent[]>();
  const deathsByHunt = new Map<string, EcologicalEvent[]>();
  for (const event of events) {
    if (event.eventType !== "DEATH") continue;
    if (event.correlationId !== null) {
      const list = deathsById.get(event.correlationId) ?? [];
      list.push(event);
      deathsById.set(event.correlationId, list);
    }
    const huntId = event.payload.huntCorrelationId;
    if (typeof huntId === "string" && huntId) {
      const list = deathsByHunt.get(huntId) ?? [];
      list.push(event);
      deathsByHunt.set(huntId, list);
    }
  }

  const attemptsByDeathId = new Map<string, string[]>();
  for (const event of events) {
    if (event.eventType !== "HUNT_ATTEMPT" || event.payload.outcome !== "SUCCESS") continue;
    const ref = event.payload.preyDeathCorrelationId;
    if (typeof ref !== "string" || !ref) continue;
    const users = attemptsByDeathId.get(ref) ?? [];
    users.push(event.eventId);
    attemptsByDeathId.set(ref, users);
  }

  const rawChecks: PredationAttemptCheck[] = [];
  const deathUse = new Map<string, string[]>();
  for (const event of events) {
    if (event.eventType !== "HUNT_ATTEMPT" || event.payload.outcome !== "SUCCESS") continue;
    const classification = classifyAttempt(event, deathsById, deathsByHunt, options);
    const ref = event.payload.preyDeathCorrelationId;
    const sharedAttempts = typeof ref === "string" ? (attemptsByDeathId.get(ref)?.length ?? 0) : 0;
    const status: PredationRelationStatus = sharedAttempts > 1
      ? "AMBIGUOUS"
      : classification.status;
    const reasons = sharedAttempts > 1 && status === "AMBIGUOUS"
      ? [...classification.reasons, `DEATH correlation referenced by ${sharedAttempts} hunt attempts`]
      : classification.reasons;
    rawChecks.push({
      eventId: event.eventId,
      correlationId: event.correlationId,
      tick: event.tick,
      runId: event.runId,
      predatorId: Number.isInteger(Number(event.payload.predatorId)) ? Number(event.payload.predatorId) : null,
      preyId: Number.isInteger(Number(event.payload.preyId)) ? Number(event.payload.preyId) : null,
      deathEventId: classification.death?.eventId ?? null,
      status,
      reasons,
    });
    if (status === "VERIFIED" && classification.death) {
      const users = deathUse.get(classification.death.eventId) ?? [];
      users.push(event.eventId);
      deathUse.set(classification.death.eventId, users);
    }
  }

  // Una stessa DEATH non può confermare più di un tentativo: associazione
  // multipla non consentita → AMBIGUOUS, mai predazione confermata.
  const attemptChecks = rawChecks.map((check) => {
    const users = check.deathEventId ? (deathUse.get(check.deathEventId) ?? []) : [];
    if (check.status === "VERIFIED" && users.length > 1) {
      return {
        ...check,
        status: "AMBIGUOUS" as PredationRelationStatus,
        reasons: [...check.reasons, `DEATH event shared by ${users.length} hunt attempts`],
      };
    }
    return check;
  });
  const verifiedKeys = new Set(
    attemptChecks
      .filter((check) => check.status === "VERIFIED")
      .map((check) => check.correlationId ?? check.eventId),
  );

  const orphanDeaths = events.filter((event) => {
    if (event.eventType !== "DEATH" || event.payload.cause !== "PREDATION") return false;
    const huntId = event.payload.huntCorrelationId;
    return typeof huntId !== "string" || !huntId || !verifiedKeys.has(huntId);
  });

  const counts: Record<PredationRelationStatus, number> = {
    VERIFIED: 0, UNVERIFIED: 0, INCONSISTENT: 0, AMBIGUOUS: 0, ORPHAN: 0, NON_EVALUABLE: 0,
  };
  for (const check of attemptChecks) counts[check.status]++;
  const partial = options.completeness === "PARTIAL"
    || (options.requiredTypes !== undefined && !options.requiredTypes.includes("DEATH"));
  for (const death of orphanDeaths) counts[partial ? "NON_EVALUABLE" : "ORPHAN"]++;
  const errors = attemptChecks
    .filter((check) => check.status === "INCONSISTENT" || check.status === "AMBIGUOUS")
    .map((check) => `${check.eventId}: ${check.status}: ${check.reasons.join("; ")}`)
    .concat(orphanDeaths.map((death) => `${death.eventId}: ${partial ? "unverifiable" : "orphan"} predation death`));
  const status: PredationRelationStatus =
    counts.INCONSISTENT || counts.AMBIGUOUS || (!partial && counts.ORPHAN)
      ? "INCONSISTENT"
      : counts.UNVERIFIED || counts.NON_EVALUABLE || (partial && counts.ORPHAN)
        ? "NON_EVALUABLE"
        : attemptChecks.length === 0
          ? "NON_EVALUABLE" // nessun tentativo osservato: nessuna relazione da verificare
          : "VERIFIED";
  return { status, attemptChecks, orphanDeaths, counts, errors };
}

/**
 * Viste sulla caccia. Un singolo HUNT_ATTEMPT osservato può essere letto come
 * tentativo, successo, fallimento o predazione: sono VISTE, non eventi extra.
 * `PREDATION` richiede una relazione VERIFICATA con un DEATH corrispondente.
 */
export function selectHuntEvents(
  events: readonly EcologicalEvent[],
  view: HuntView,
  correlationOptions: CorrelationCheckOptions = {},
): EcologicalEvent[] {
  const attempts = events.filter((event) => event.eventType === "HUNT_ATTEMPT");
  switch (view) {
    case "HUNT_ATTEMPT":
      return attempts;
    case "HUNT_SUCCESS":
      return attempts.filter((event) => event.payload.outcome === "SUCCESS");
    case "HUNT_FAILURE":
      return attempts.filter((event) => event.payload.outcome === "FAILURE");
    case "PREDATION": {
      const report = verifyPredationCorrelations(events, correlationOptions);
      const verified = new Set(
        report.attemptChecks.filter((check) => check.status === "VERIFIED").map((check) => check.eventId),
      );
      return attempts.filter((event) => event.payload.outcome === "SUCCESS" && verified.has(event.eventId));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Ledger energetico (E-REV-01)                                        */
/* ------------------------------------------------------------------ */

export interface EnergyFlow {
  readonly category: "DERIVED" | "NON_EVALUABLE";
  readonly tick: number;
  readonly entityId: number;
  readonly flowType: string;
  /** `null` = costo/valore non registrato: mai sostituito con zero. */
  readonly amount: number | null;
  readonly correlationId: string | null;
  readonly sourceEventId: string;
  readonly status: "EXPLICIT" | "LEGACY" | "INCOMPLETE" | "UNVERIFIED";
  readonly verified: boolean;
  readonly role: "PRIMARY_PARENT" | "SECONDARY_PARENT" | "OTHER";
  readonly missingFields: readonly string[];
}

export interface EnergyConservationReport {
  readonly ok: boolean;
  readonly checked: number;
  readonly verified: number;
  readonly incomplete: number;
  readonly mismatches: readonly {
    eventId: string;
    role: "PRIMARY_PARENT" | "SECONDARY_PARENT";
    parentId: number;
    expected: number;
    recorded: number;
  }[];
}

const EPSILON = 1e-9;

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integerId(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

interface ReproductionRole {
  role: "PRIMARY_PARENT" | "SECONDARY_PARENT";
  parentId: number | null;
  cost: number | null;
  before: number | null;
  after: number | null;
  missingFields: string[];
}

/** Estrae i ruoli con semantica esplicita; mai deduce un costo da un ID mancante. */
function reproductionRoles(event: EcologicalEvent): ReproductionRole[] {
  const p = event.payload;
  if (event.schemaVersion === ECOLOGICAL_EVENT_SCHEMA) {
    const primary: ReproductionRole = {
      role: "PRIMARY_PARENT",
      parentId: integerId(p.primaryParentId),
      cost: finiteNumber(p.primaryParentEnergyCost),
      before: finiteNumber(p.primaryParentEnergyBefore),
      after: finiteNumber(p.primaryParentEnergyAfter),
      missingFields: [],
    };
    if (primary.parentId === null) primary.missingFields.push("primaryParentId");
    if (primary.cost === null) primary.missingFields.push("primaryParentEnergyCost");
    if (primary.before === null) primary.missingFields.push("primaryParentEnergyBefore");
    if (primary.after === null) primary.missingFields.push("primaryParentEnergyAfter");
    const secondaryId = p.secondaryParentId === null ? null : integerId(p.secondaryParentId);
    if (secondaryId === null && p.secondaryParentId !== null) {
      return [primary, {
        role: "SECONDARY_PARENT",
        parentId: null,
        cost: null,
        before: null,
        after: null,
        missingFields: ["secondaryParentId"],
      }];
    }
    if (secondaryId === null) return [primary]; // asessuata: nessun secondo costo
    const secondary: ReproductionRole = {
      role: "SECONDARY_PARENT",
      parentId: secondaryId,
      cost: finiteNumber(p.secondaryParentEnergyCost),
      before: finiteNumber(p.secondaryParentEnergyBefore),
      after: finiteNumber(p.secondaryParentEnergyAfter),
      missingFields: [],
    };
    if (secondary.cost === null) secondary.missingFields.push("secondaryParentEnergyCost");
    if (secondary.before === null) secondary.missingFields.push("secondaryParentEnergyBefore");
    if (secondary.after === null) secondary.missingFields.push("secondaryParentEnergyAfter");
    return [primary, secondary];
  }
  // Legacy v1: ruoli dedotti ma verificati con i delta prima/dopo registrati.
  const parentIds = String(p.parentIds ?? "").split(",").filter(Boolean).map(Number);
  const primary: ReproductionRole = {
    role: "PRIMARY_PARENT",
    parentId: integerId(parentIds[0]),
    cost: finiteNumber(p.parentEnergyCost),
    before: finiteNumber(p.parentEnergyBefore),
    after: finiteNumber(p.parentEnergyAfter),
    missingFields: [],
  };
  if (primary.parentId === null) primary.missingFields.push("parentIds[0]");
  if (primary.cost === null) primary.missingFields.push("parentEnergyCost");
  if (primary.before === null) primary.missingFields.push("parentEnergyBefore");
  if (primary.after === null) primary.missingFields.push("parentEnergyAfter");
  const mateId = integerId(p.mateId);
  if (mateId === null) return [primary];
  const secondary: ReproductionRole = {
    role: "SECONDARY_PARENT",
    parentId: mateId,
    cost: finiteNumber(p.mateEnergyCost),
    before: finiteNumber(p.mateEnergyBefore),
    after: finiteNumber(p.mateEnergyAfter),
    missingFields: [],
  };
  if (secondary.cost === null) secondary.missingFields.push("mateEnergyCost");
  if (secondary.before === null) secondary.missingFields.push("mateEnergyBefore");
  if (secondary.after === null) secondary.missingFields.push("mateEnergyAfter");
  return [primary, secondary];
}

function roleConsistency(role: ReproductionRole): { verified: boolean; expected: number | null; missingFields: string[] } {
  const missing = [...role.missingFields];
  let expected: number | null = null;
  if (role.before !== null && role.after !== null) expected = role.before - role.after;
  else {
    if (role.before === null) missing.push("energyBefore");
    if (role.after === null) missing.push("energyAfter");
  }
  if (expected === null || role.cost === null) {
    if (role.cost === null && !missing.includes("cost")) missing.push("cost");
    return { verified: false, expected, missingFields: [...new Set(missing)] };
  }
  return { verified: Math.abs(expected - role.cost) <= EPSILON, expected, missingFields: [...new Set(missing)] };
}

/** Verifica esplicita di conservazione dell'energia nei costi di riproduzione. */
export function verifyEnergyConservation(events: readonly EcologicalEvent[]): EnergyConservationReport {
  const mismatches: EnergyConservationReport["mismatches"][number][] = [];
  let checked = 0;
  let verified = 0;
  let incomplete = 0;
  for (const event of events) {
    if (event.eventType !== "REPRODUCTION") continue;
    checked++;
    let allVerified = true;
    let eventIncomplete = false;
    for (const role of reproductionRoles(event)) {
      const consistency = roleConsistency(role);
      if (consistency.missingFields.length > 0) {
        eventIncomplete = true;
        allVerified = false;
        continue;
      }
      if (!consistency.verified && role.parentId !== null && consistency.expected !== null && role.cost !== null) {
        mismatches.push({
          eventId: event.eventId,
          role: role.role,
          parentId: role.parentId,
          expected: consistency.expected,
          recorded: role.cost,
        });
        allVerified = false;
      }
    }
    if (eventIncomplete) incomplete++;
    if (allVerified) verified++;
  }
  return { ok: mismatches.length === 0, checked, verified, incomplete, mismatches };
}

/**
 * Ledger energetico derivato. NON è un inventario di conservazione: il motore
 * non sottrae l'energia residua della preda quando la uccide, quindi il flusso
 * da preda a predatore è una misura del guadagno, non un trasferimento chiuso.
 */
export function energyLedger(events: readonly EcologicalEvent[]): EnergyFlow[] {
  const out: EnergyFlow[] = [];
  const push = (
    event: EcologicalEvent,
    entityId: number,
    flowType: string,
    amount: number | null,
    opts: {
      status?: EnergyFlow["status"];
      verified?: boolean;
      role?: EnergyFlow["role"];
      missingFields?: readonly string[];
      allowZero?: boolean;
    } = {},
  ): void => {
    if (amount === null) {
      out.push({
        category: "NON_EVALUABLE",
        tick: event.tick,
        entityId,
        flowType,
        amount: null,
        correlationId: event.correlationId,
        sourceEventId: event.eventId,
        status: "INCOMPLETE",
        verified: false,
        role: opts.role ?? "OTHER",
        missingFields: opts.missingFields ?? [],
      });
      return;
    }
    if (!Number.isFinite(amount) || (amount === 0 && !opts.allowZero)) return;
    out.push({
      category: opts.verified === false ? "NON_EVALUABLE" : "DERIVED",
      tick: event.tick,
      entityId,
      flowType,
      amount,
      correlationId: event.correlationId,
      sourceEventId: event.eventId,
      status: opts.status ?? "EXPLICIT",
      verified: opts.verified ?? true,
      role: opts.role ?? "OTHER",
      missingFields: opts.missingFields ?? [],
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
      for (const role of reproductionRoles(event)) {
        const consistency = roleConsistency(role);
        const status: EnergyFlow["status"] = event.schemaVersion === ECOLOGICAL_EVENT_SCHEMA ? "EXPLICIT" : "LEGACY";
        const flowType = role.role === "PRIMARY_PARENT" ? "REPRODUCTION_COST" : "MATE_COST";
        if (role.parentId === null || role.cost === null) {
          push(event, role.parentId ?? -1, flowType, null, {
            status: "INCOMPLETE",
            verified: false,
            role: role.role,
            missingFields: [...new Set([...role.missingFields, ...consistency.missingFields])],
          });
          continue;
        }
        push(event, role.parentId, flowType, -role.cost, {
          status: consistency.verified ? status : "UNVERIFIED",
          verified: consistency.verified,
          role: role.role,
          missingFields: consistency.missingFields,
        });
      }
    }
  }
  return out;
}

export interface EnergyLedgerSummary {
  readonly category: "DERIVED";
  readonly byFlowType: Readonly<Record<string, number>>;
  readonly byEntity: Readonly<Record<string, number>>;
  readonly totalAmount: number;
  readonly verifiedFlows: number;
  readonly incompleteFlows: number;
  readonly unverifiedFlows: number;
  readonly conservation: EnergyConservationReport;
}

/**
 * Riepilogo del ledger: somma solo importi numerici registrati; i flussi
 * incompleti vengono contati e descritti, mai azzerati. La conservazione è
 * verificata sui delta prima/dopo esplicitamente emessi dal motore.
 */
export function energyLedgerSummary(events: readonly EcologicalEvent[]): EnergyLedgerSummary {
  const byFlowType: Record<string, number> = {};
  const byEntity: Record<string, number> = {};
  const flows = energyLedger(events);
  let totalAmount = 0;
  let verifiedFlows = 0;
  let incompleteFlows = 0;
  let unverifiedFlows = 0;
  for (const flow of flows) {
    if (flow.amount === null) {
      incompleteFlows++;
      continue;
    }
    byFlowType[flow.flowType] = (byFlowType[flow.flowType] ?? 0) + flow.amount;
    const entity = String(flow.entityId);
    byEntity[entity] = (byEntity[entity] ?? 0) + flow.amount;
    totalAmount += flow.amount;
    if (!flow.verified) unverifiedFlows++;
    else verifiedFlows++;
  }
  return {
    category: "DERIVED",
    byFlowType,
    byEntity,
    totalAmount,
    verifiedFlows,
    incompleteFlows,
    unverifiedFlows,
    conservation: verifyEnergyConservation(events),
  };
}

/** Rete trofica OBSERVED: archi costruiti solo da predazioni verificate. */
export interface ObservedTrophicEdge {
  readonly category: "OBSERVED";
  readonly predatorSpeciesId: number;
  readonly preySpeciesId: number;
  attempts: number;
  successes: number;
  failures: number;
  verifiedPredations: number;
  energyTransferred: number;
  firstTick: number;
  lastTick: number;
}

export function buildObservedFoodWeb(events: readonly EcologicalEvent[]): ObservedTrophicEdge[] {
  const verified = new Set(
    verifyPredationCorrelations(events).attemptChecks.filter((check) => check.status === "VERIFIED").map((check) => check.eventId),
  );
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
        verifiedPredations: 0,
        energyTransferred: 0,
        firstTick: event.tick,
        lastTick: event.tick,
      };
      edges.set(key, edge);
    }
    edge.attempts++;
    if (event.payload.outcome === "SUCCESS") {
      edge.successes++;
      if (verified.has(event.eventId)) {
        edge.verifiedPredations++;
        edge.energyTransferred += Number(event.payload.energyTransferred ?? 0);
      }
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
