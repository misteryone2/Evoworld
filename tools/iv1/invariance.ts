/**
 * IV1-A — harness di invarianza biologica per G3.1 + E2.3.1.
 *
 * Il confronto usa lo stato biologico canonico del World (snapshot + statistiche
 * derivate), NON frame di rendering, NON eventi osservativi e NON tempi di
 * esecuzione. Ogni fingerprint e' una SHA-256 di una serializzazione canonica:
 * chiavi ordinate, array di insiemi (organismi, specie, chunk) ordinati per
 * identificatore stabile, numeri normalizzati.
 *
 * Nessuna funzione di qui modifica il motore: l'unica mutazione e' la
 * condizione iniziale controllata (energia/fertilita'/eta' dei fondatori),
 * applicata in modo identico a tutte le configurazioni prima del primo step.
 */
import * as THREE from "three";
import { createRuntimeAnatomyRenderSource } from "../../lib/visual/runtimeAnatomyRenderSource";
import { createSceneRefs } from "../../scripts/g31Fixtures";
import { updateCreatureInstances, type SceneRefs } from "../../components/simulation/Planet3DView";
import { buildRenderFrame } from "../../simulation/core/renderFrame";
import { World } from "../../simulation/core/world";
import {
  ECOLOGICAL_EVENT_TYPES,
  InMemoryEventSink,
  type EcologicalEventType,
} from "../../simulation/ecology/observability";
import type { Genome, SimulationStats, WorldSnapshot } from "../../types";
import { sha256, stableStringify } from "../e1/dataset";

export const IV1_SCHEMA = "evoworld.iv1-a.biological-state.v1";

/** Parametri scientifici fissati per tutta la matrice IV1-A. */
export interface IV1Settings {
  readonly width: number;
  readonly height: number;
  readonly population: number;
  readonly ticks: number;
  readonly initialEnergy: number;
  readonly fertility: number;
  readonly founderMaturityFraction: number;
  readonly renderCapacity: number;
  readonly farStride: number;
  readonly nearDistanceScales: number;
}

export const IV1_DEFAULTS: Readonly<IV1Settings> = Object.freeze({
  width: 32,
  height: 32,
  population: 60,
  ticks: 40,
  initialEnergy: 220,
  fertility: 20,
  founderMaturityFraction: 0.25,
  renderCapacity: 192,
  farStride: 4,
  nearDistanceScales: 8,
});

export const IV1_SEEDS = Object.freeze([7, 11, 13, 17, 31]);
export const IV1_REPETITIONS = Object.freeze([1, 2, 3]);

export type RenderingMode = "OFF" | "ON";
export type ObservabilityMode = "OFF" | "ON";

export interface IV1CaseConfig {
  readonly seed: number;
  readonly repetition: number;
  readonly rendering: RenderingMode;
  readonly observability: ObservabilityMode;
  readonly ticks?: number;
  readonly anatomySource?: boolean;
}

export type ResolvedIV1CaseConfig = IV1Settings & Required<IV1CaseConfig>;

export interface CanonicalState {
  readonly schema: string;
  readonly tick: number;
  readonly planet: unknown;
  readonly organisms: readonly unknown[];
  readonly nextOrganismId: number;
  readonly nextSpeciesId: number;
  readonly randomState: number;
  readonly speciesRegistry: readonly unknown[];
  readonly genomeVersion: number | null;
  readonly advancedGenome: boolean | null;
  readonly geneEffects: boolean | null;
  readonly stats: unknown;
}

export interface TickObservation {
  readonly tick: number;
  readonly sha256: string;
  readonly population: number;
  readonly randomState: number;
  readonly births: number;
  readonly deaths: number;
  readonly predationKills: number;
  readonly cumulativeBirths: number;
  readonly cumulativeDeaths: number;
  readonly cumulativePredationKills: number;
  readonly speciesAlive: number;
  readonly speciesExtinct: number;
  readonly speciesTotalEver: number;
}

export interface IV1RunResult {
  readonly config: ResolvedIV1CaseConfig;
  readonly ticks: readonly TickObservation[];
  readonly finalSha256: string;
  readonly finalState: CanonicalState;
  readonly completedTicks: number;
  readonly eventCountsByType: Readonly<Record<string, number>>;
  readonly reproductionModes: Readonly<{ ASEXUAL: number; SEXUAL: number }>;
  readonly renderCounters: Readonly<Record<string, unknown>> | null;
  /** Variabile: mai inclusa in fingerprint, report canonico o confronto. */
  readonly elapsedMs: number;
}

export interface DivergenceReport {
  readonly diverged: boolean;
  readonly tick: number | null;
  readonly baselineSha256: string | null;
  readonly otherSha256: string | null;
  readonly baseline: TickObservation | null;
  readonly other: TickObservation | null;
  readonly suspectedFields: readonly string[];
  readonly diagnosis: string;
}

/** Rappresentazione JSON-safe dei numeri: -0 e non-finiti non cambiano hash tra run. */
function normalizeNumber(value: number): number | string {
  if (Number.isNaN(value)) return "NaN";
  if (value === Number.POSITIVE_INFINITY) return "Infinity";
  if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
  if (Object.is(value, -0)) return 0;
  return value;
}

/** Serializzazione canonica: chiavi ordinate ricorsivamente, undefined rimosso. */
function canonicalObject(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return normalizeNumber(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalObject);
  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (source[key] === undefined) continue;
    output[key] = canonicalObject(source[key]);
  }
  return output;
}

function canonicalGenome(genome: Genome | null | undefined): unknown {
  if (!genome) return null;
  return canonicalObject({ ...genome, ext: genome.ext ? canonicalObject(genome.ext) : null });
}

/**
 * Stato biologico completo. ESCLUSIONI dichiarate:
 * - RenderFrame/typed array grafici, mesh, camera, contatori di rendering;
 * - eventi E2.3 e checksum degli eventi (osservabilita' non e' stato);
 * - elapsedMs/Date.now e qualsiasi metadato di filesystem.
 * INCLUSIONI: RNG, ID successivi, organismi (genoma/brain/memoria/posizione),
 * registro specie, celle materializzate del pianeta e statistiche per tick.
 */
export function buildCanonicalBiologicalState(snapshot: WorldSnapshot, stats: SimulationStats): CanonicalState {
  const chunks = [...(snapshot.planet.chunks ?? [])]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((chunk) => ({
      key: chunk.key,
      lastActiveTick: normalizeNumber(chunk.lastActiveTick),
      cells: chunk.cells.map((cell) =>
        canonicalObject({
          elevation: cell.elevation,
          temperature: cell.temperature,
          water: cell.water,
          vegetation: cell.vegetation,
          terrain: cell.terrain,
          riverFlow: cell.riverFlow ?? null,
          isLake: cell.isLake ?? null,
          seasonalOffset: cell.seasonalOffset ?? null,
        }),
      ),
    }));

  const organisms = [...snapshot.organisms]
    .sort((a, b) => a.id - b.id)
    .map((organism) =>
      canonicalObject({
        id: organism.id,
        speciesId: organism.speciesId,
        position: { x: organism.position.x, y: organism.position.y },
        home: { x: organism.home.x, y: organism.home.y },
        energy: organism.energy,
        age: organism.age,
        alive: organism.alive,
        genome: canonicalGenome(organism.genome),
        memory: organism.memory ? { ...organism.memory } : null,
        brain: Array.from(organism.brain, normalizeNumber),
      }),
    );

  const speciesRegistry = [...snapshot.speciesRegistry]
    .sort((a, b) => a.speciesId - b.speciesId)
    .map((record) =>
      canonicalObject({
        ...record,
        originGenomeSnapshot: canonicalGenome(record.originGenomeSnapshot),
      }),
    );

  return {
    schema: IV1_SCHEMA,
    tick: snapshot.tick,
    planet: {
      config: canonicalObject(snapshot.planet.config),
      chunks,
      legacyCells: snapshot.planet.cells ? snapshot.planet.cells.map(canonicalObject) : null,
    },
    organisms,
    nextOrganismId: snapshot.nextOrganismId,
    nextSpeciesId: snapshot.nextSpeciesId,
    randomState: normalizeNumber(snapshot.randomState) as number,
    speciesRegistry,
    genomeVersion: snapshot.genomeVersion ?? null,
    advancedGenome: snapshot.advancedGenome ?? null,
    geneEffects: snapshot.geneEffects ?? null,
    stats: canonicalObject(stats),
  };
}

export function fingerprintState(state: CanonicalState): string {
  return sha256(stableStringify(state));
}

export function fingerprintWorld(world: World): { tick: number; sha256: string; state: CanonicalState } {
  const state = buildCanonicalBiologicalState(world.toSnapshot(), world.getStats());
  return { tick: world.tick, sha256: fingerprintState(state), state };
}

interface CumulativeCounts {
  births: number;
  deaths: number;
  predationKills: number;
}

function observationFrom(
  world: World,
  fingerprint: ReturnType<typeof fingerprintWorld>,
  cumulative: CumulativeCounts,
): TickObservation {
  const stats = world.getStats();
  return {
    tick: fingerprint.tick,
    sha256: fingerprint.sha256,
    population: world.organisms.length,
    randomState: fingerprint.state.randomState,
    births: stats.births,
    deaths: stats.deaths,
    predationKills: stats.predationKills,
    cumulativeBirths: cumulative.births,
    cumulativeDeaths: cumulative.deaths,
    cumulativePredationKills: cumulative.predationKills,
    speciesAlive: stats.speciesAlive,
    speciesExtinct: stats.speciesExtinct,
    speciesTotalEver: stats.speciesTotalEver,
  };
}

function applyInitialCondition(world: World, cfg: ResolvedIV1CaseConfig): void {
  for (const organism of world.organisms) {
    organism.energy = cfg.initialEnergy;
    organism.genome.fertility = cfg.fertility;
    organism.age = Math.ceil(organism.genome.lifespan * cfg.founderMaturityFraction);
  }
}

function createRenderingRefs(cfg: ResolvedIV1CaseConfig): {
  refs: SceneRefs;
  source: ReturnType<typeof createRuntimeAnatomyRenderSource> | null;
} {
  const refs = createSceneRefs(THREE, cfg.renderCapacity, 3, true, true);
  refs.maxCreatures = cfg.renderCapacity;
  refs.adaptive = {
    enabled: true,
    nearDistanceScales: cfg.nearDistanceScales,
    farStride: cfg.farStride,
    cullBehindCamera: false,
    cullMarginUnits: 4,
  };
  refs.adaptiveState = null;
  // Camera lontana: esercita lo stride G3.1 senza cullare le creature.
  refs.camera!.position.set(1000, 0, 0);
  refs.camera!.lookAt(1001, 0, 0);
  refs.camera!.updateMatrixWorld(true);
  const source = cfg.anatomySource ? createRuntimeAnatomyRenderSource(`iv1-a-${cfg.seed}-${cfg.repetition}`) : null;
  return { refs, source };
}

/** Esegue un caso completo restituendo hash biologici tick-per-tick. */
export function runInvarianceCase(input: IV1CaseConfig): IV1RunResult {
  const started = Date.now();
  const cfg: ResolvedIV1CaseConfig = {
    ...IV1_DEFAULTS,
    anatomySource: true,
    ...input,
  };

  const world = new World(
    { width: cfg.width, height: cfg.height, seed: cfg.seed },
    cfg.population,
    { enableAdvancedGenome: true, enableGeneEffects: true },
  );
  applyInitialCondition(world, cfg);

  let sink: InMemoryEventSink | null = null;
  if (cfg.observability === "ON") {
    sink = new InMemoryEventSink({
      simulationId: "iv1-a-invariance",
      experimentId: "IV1-A",
      runId: `seed-${cfg.seed}-rep-${cfg.repetition}-${cfg.rendering}-${cfg.observability}`,
      enabledTypes: [...ECOLOGICAL_EVENT_TYPES],
      profile: "scientific_full",
      tickDuration: 1,
      ticksPerYear: 400,
      snapshotEveryTicks: 1,
      samplingSeed: 1,
    });
    world.setEventSink(sink);
  }

  const rendering = cfg.rendering === "ON" ? createRenderingRefs(cfg) : null;
  const observations: TickObservation[] = [];
  const cumulative: CumulativeCounts = { births: 0, deaths: 0, predationKills: 0 };

  const initial = fingerprintWorld(world);
  let finalState: CanonicalState = initial.state;
  observations.push(observationFrom(world, initial, cumulative));

  for (let i = 0; i < cfg.ticks; i++) {
    world.step();
    const tickStats = world.getStats();
    cumulative.births += tickStats.births;
    cumulative.deaths += tickStats.deaths;
    cumulative.predationKills += tickStats.predationKills;

    // La fingerprint e' SEMPRE calcolata sullo stato dopo lo step, prima e
    // indipendentemente da qualsiasi chiamata al renderer.
    const fingerprint = fingerprintWorld(world);
    finalState = fingerprint.state;
    observations.push(observationFrom(world, fingerprint, cumulative));

    if (rendering) {
      // Cambio periodico di viewport: esercita il refresh completo G3.1.
      if (i > 0 && i % 10 === 0) {
        rendering.refs.camera!.fov = 45 + (i % 20);
        rendering.refs.camera!.updateProjectionMatrix();
      }
      const frame = buildRenderFrame(world);
      rendering.source?.syncFrame(frame);
      updateCreatureInstances(
        rendering.refs,
        frame,
        null,
        null,
        16,
        rendering.refs.camera!.position,
        rendering.source,
      );
    }
  }

  if (sink) sink.flush();
  const summary = sink?.summary();
  const events = sink?.eventsSnapshot() ?? [];
  const reproductionModes = { ASEXUAL: 0, SEXUAL: 0 };
  for (const event of events) {
    if (event.eventType !== "REPRODUCTION") continue;
    const mode = (event.payload as { mode?: unknown }).mode;
    if (mode === "ASEXUAL" || mode === "SEXUAL") reproductionModes[mode]++;
  }
  const counters = rendering?.refs.creatureRenderStats
    ? { ...rendering.refs.creatureRenderStats, poolGrowth: undefined }
    : null;

  return {
    config: cfg,
    ticks: observations,
    finalSha256: observations[observations.length - 1].sha256,
    finalState,
    completedTicks: world.tick,
    eventCountsByType: summary ? { ...summary.byType } : {},
    reproductionModes,
    renderCounters: counters,
    elapsedMs: Date.now() - started,
  };
}

const SUMMARY_FIELDS: readonly (keyof TickObservation)[] = [
  "population",
  "randomState",
  "births",
  "deaths",
  "predationKills",
  "speciesAlive",
  "speciesExtinct",
  "speciesTotalEver",
];

/** Confronto tick-per-tick: restituisce il PRIMO tick divergente. */
export function compareRuns(baseline: IV1RunResult, other: IV1RunResult): DivergenceReport {
  const limit = Math.min(baseline.ticks.length, other.ticks.length);
  for (let i = 0; i < limit; i++) {
    const a = baseline.ticks[i];
    const b = other.ticks[i];
    if (a.sha256 === b.sha256) continue;
    const suspectedFields = SUMMARY_FIELDS.filter((field) => {
      const av = a[field];
      const bv = b[field];
      return typeof av === "number" && typeof bv === "number" ? av !== bv : stableStringify(av) !== stableStringify(bv);
    });
    const diagnosis = suspectedFields.length
      ? `Divergenza biologica al tick ${a.tick}: campi riassuntivi divergenti (${suspectedFields.join(", ")}). ` +
        `Verificare che la configurazione osservativa o di rendering non consumi RNG o non modifichi lo stato.`
      : `Divergenza biologica al tick ${a.tick}: i campi riassuntivi coincidono, quindi la differenza e' in campi ` +
        `di dettaglio del fingerprint (genoma/brain/posizione/energia/celle/registro specie).`;
    return {
      diverged: true,
      tick: a.tick,
      baselineSha256: a.sha256,
      otherSha256: b.sha256,
      baseline: a,
      other: b,
      suspectedFields,
      diagnosis,
    };
  }
  if (baseline.ticks.length !== other.ticks.length) {
    const tick = Math.max(baseline.ticks.length, other.ticks.length) - 1;
    return {
      diverged: true,
      tick,
      baselineSha256: baseline.finalSha256,
      otherSha256: other.finalSha256,
      baseline: baseline.ticks[baseline.ticks.length - 1] ?? null,
      other: other.ticks[other.ticks.length - 1] ?? null,
      suspectedFields: ["completedTicks"],
      diagnosis: `Numero di tick diverso: baseline=${baseline.completedTicks}, other=${other.completedTicks}.`,
    };
  }
  return {
    diverged: false,
    tick: null,
    baselineSha256: baseline.finalSha256,
    otherSha256: other.finalSha256,
    baseline: baseline.ticks[baseline.ticks.length - 1],
    other: other.ticks[other.ticks.length - 1],
    suspectedFields: [],
    diagnosis: "Nessuna divergenza: tutti i fingerprint biologici coincidono tick per tick.",
  };
}

/** Configurazioni della matrice C: baseline, solo rendering, solo osservabilita', combinata. */
export const IV1_CONFIGURATIONS: ReadonlyArray<{ rendering: RenderingMode; observability: ObservabilityMode; id: string }> = Object.freeze([
  { rendering: "OFF", observability: "OFF", id: "OFF_OFF" },
  { rendering: "ON", observability: "OFF", id: "ON_OFF" },
  { rendering: "OFF", observability: "ON", id: "OFF_ON" },
  { rendering: "ON", observability: "ON", id: "ON_ON" },
]);

export function caseId(seed: number, repetition: number, rendering: RenderingMode, observability: ObservabilityMode): string {
  return `s${seed}-r${repetition}-${rendering}_${observability}`;
}
