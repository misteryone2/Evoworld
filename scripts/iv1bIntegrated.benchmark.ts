import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { performance } from "node:perf_hooks";
import { cpus, freemem, totalmem } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { World } from "../simulation/core/world";
import { buildRenderFrame } from "../simulation/core/renderFrame";
import {
  InMemoryEventSink, NULL_EVENT_SINK,
  type EcologicalEvent, type EventBatchWriter, type EventSinkSummary,
} from "../simulation/ecology/observability";
import { applySetupWithInfo, type SetupKind } from "../tools/e1/initialConditions";
import { createSceneRefs } from "./g31Fixtures";
import { createRuntimeAnatomyRenderSource } from "../lib/visual/runtimeAnatomyRenderSource";
import { updateCreatureInstances, type SceneRefs } from "../components/simulation/Planet3DView";

/**
 * IV1-B — Integrated Performance Benchmark.
 *
 * Misura G3.1 Adaptive Rendering ed E2.3.1 Observability nella stessa istanza
 * di processo, su World reali e RenderFrame reali. Nessuna logica di
 * produzione viene modificata: questo file è solo infrastruttura di misura.
 *
 * Esegui: npx vitest run --config vitest.bench.config.ts scripts/iv1bIntegrated.benchmark.ts
 */

type ConfigName = "baseline" | "rendering" | "observability" | "integrated";

interface MatrixConfig {
  name: ConfigName;
  adaptive: boolean;
  observability: boolean;
}

const CONFIGS: readonly MatrixConfig[] = [
  { name: "baseline", adaptive: false, observability: false },
  { name: "rendering", adaptive: true, observability: false },
  { name: "observability", adaptive: false, observability: true },
  { name: "integrated", adaptive: true, observability: true },
];

const DEFAULT_POPULATIONS = [100, 500, 1500, 3000, 5000, 10000];
const DEFAULT_SEEDS = [7, 11, 31, 47, 59];
const PLANET_SIZE: Record<number, number> = {
  100: 64, 500: 96, 1500: 160, 3000: 224, 5000: 288, 10000: 400,
};

const envInts = (name: string, fallback: number[]): number[] => {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
  if (!raw) return fallback;
  const parsed = raw.split(",").map((v) => Number(v.trim())).filter((v) => Number.isFinite(v) && v > 0);
  return parsed.length ? parsed : fallback;
};
const envInt = (name: string, fallback: number): number => {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};
const envStr = (name: string, fallback: string): string =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name] ?? fallback;

const POPULATIONS = envInts("IV1B_POPULATIONS", DEFAULT_POPULATIONS);
const SEEDS = envInts("IV1B_SEEDS", DEFAULT_SEEDS);
const TICKS = envInt("IV1B_TICKS", 20);
const WARMUP_TICKS = envInt("IV1B_WARMUP_TICKS", 5);
const OUT_DIR = envStr("IV1B_OUT", join(process.cwd(), "docs", "research", "iv1b"));

interface Stats {
  mean: number; median: number; p95: number; p99: number;
  min: number; max: number; stdev: number; count: number;
}

function summarize(values: number[]): Stats | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return {
    mean: num(mean),
    median: num(q(0.5)),
    p95: num(q(0.95)),
    p99: num(q(0.99)),
    min: num(sorted[0]),
    max: num(sorted[sorted.length - 1]),
    stdev: num(Math.sqrt(variance)),
    count: values.length,
  };
}

function num(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

/** Writer di misura: cronometra writeBatch senza I/O su disco. */
class MeasuringWriter implements EventBatchWriter {
  batches = 0;
  events = 0;
  ms = 0;
  bytes = 0;
  writeBatch(batch: readonly EcologicalEvent[]): void {
    const t0 = performance.now();
    let acc = 0;
    for (const event of batch) {
      acc += event.eventType.length + event.entityIds.length + Object.keys(event.payload).length;
    }
    this.ms += performance.now() - t0;
    this.batches++;
    this.events += batch.length;
    this.bytes += acc;
  }
}

interface EventMetrics {
  attempted: number;
  recorded: number;
  retained: number;
  lost: number;
  droppedNonCritical: number;
  criticalDropped: number;
  sampled: number;
  flushedBatches: number;
  flushedEvents: number;
  flushErrors: number;
  byType: Record<string, number>;
  attemptsByType: Record<string, number>;
  lostByType: Record<string, number>;
  bufferBytes: number;
  bufferBytesIsEstimate: boolean;
  eventsPerSecond: number | null;
  attemptsPerSecond: number | null;
}

function eventMetrics(
  summary: EventSinkSummary, retainedEvents: number, bufferBytes: number, wallSeconds: number,
  writer: MeasuringWriter | null,
): EventMetrics {
  const lostTypes = Object.values(summary.lostByType).reduce((a, b) => a + b, 0);
  return {
    attempted: Object.values(summary.attemptsByType).reduce((a, b) => a + b, 0),
    recorded: summary.total,
    retained: retainedEvents,
    lost: summary.droppedNonCritical + summary.criticalDropped + lostTypes,
    droppedNonCritical: summary.droppedNonCritical,
    criticalDropped: summary.criticalDropped,
    sampled: summary.sampled,
    flushedBatches: summary.flushedBatches,
    flushedEvents: summary.flushedEvents,
    flushErrors: summary.flushErrors,
    byType: summary.byType,
    attemptsByType: summary.attemptsByType,
    lostByType: summary.lostByType,
    bufferBytes,
    bufferBytesIsEstimate: true,
    eventsPerSecond: wallSeconds > 0 ? num(summary.total / wallSeconds, 1) : null,
    attemptsPerSecond: wallSeconds > 0
      ? num(Object.values(summary.attemptsByType).reduce((a, b) => a + b, 0) / wallSeconds, 1)
      : null,
    ...(writer ? { writerBatches: writer.batches } : {}),
  } as EventMetrics;
}

interface RunRecord {
  population: number;
  config: ConfigName;
  seed: number;
  planetSize: number;
  initialPopulation: number;
  finalPopulation: number;
  warmupTicks: number;
  measuredTicks: number;
  tickMs: number[];
  frameBuildMs: number[];
  syncMs: number[];
  renderMs: number[];
  heapKB: number[];
  wallMs: number;
  cpuMs: number;
  heapBeforeKB: number;
  heapAfterKB: number;
  heapPeakKB: number;
  heapGrowthKB: number;
  heapSlopeKBPerTick: number;
  rssKB: number;
  flushMs: number;
  measuredWallMs: number;
  retainedPeak: number | null;
  ticksPerSecond: number | null;
  events: EventMetrics | null;
  rendering: Record<string, number | boolean | null>;
}

function linearSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let numAcc = 0;
  let denAcc = 0;
  for (let i = 0; i < n; i++) {
    numAcc += (i - meanX) * (values[i] - meanY);
    denAcc += (i - meanX) ** 2;
  }
  return denAcc === 0 ? 0 : numAcc / denAcc;
}

function makeRenderRefs(capacity: number, adaptive: boolean): SceneRefs {
  const refs = createSceneRefs(THREE, capacity, 3, true, true);
  refs.maxCreatures = capacity;
  if (adaptive) {
    refs.adaptive = {
      enabled: true,
      nearDistanceScales: 8,
      farStride: 4,
      cullBehindCamera: true,
      cullMarginUnits: 0.5,
    };
    refs.camera.position.set(0, 5.5, 0);
    refs.camera.lookAt(0, 4.5, -1);
    refs.camera.updateMatrixWorld(true);
  } else {
    refs.adaptive = { enabled: false };
    refs.camera.position.set(0, 5.5, 0);
    refs.camera.lookAt(0, 4.5, -1);
    refs.camera.updateMatrixWorld(true);
  }
  refs.adaptiveState = null;
  return refs;
}

function runOne(config: MatrixConfig, population: number, seed: number): RunRecord {
  const size = PLANET_SIZE[population] ?? Math.ceil(Math.sqrt(population) * 12);
  const world = new World({ width: size, height: size, seed }, population, {
    enableAdvancedGenome: true,
    enableGeneEffects: true,
    enableSettlement: false,
  });
  const prepared = applySetupWithInfo(world, "mixed" as SetupKind);
  const activeWorld = prepared.world;
  const initialPopulation = activeWorld.organisms.length;

  let writer: MeasuringWriter | null = null;
  let sink: typeof NULL_EVENT_SINK;
  if (config.observability) {
    writer = new MeasuringWriter();
    sink = new InMemoryEventSink({
      simulationId: "iv1b",
      experimentId: "IV1-B",
      runId: `iv1b-${population}-${config.name}-${seed}`,
      profile: "scientific_full",
      snapshotEveryTicks: 0,
      batchWriter: writer,
      flushEveryEvents: 5000,
      // Configurazione produttiva-safe raccomandata da E2.3.1 (report N.12.1):
      // il buffer resta limitato a flushEveryEvents invece di crescere senza
      // limite fino a OOM alle popolazioni elevate. I contatori di summary()
      // conservano comunque i totali Lifetime (recorded/lost/byType).
      releaseAfterFlush: true,
    });
  } else {
    sink = NULL_EVENT_SINK;
  }
  activeWorld.setEventSink(sink);

  const capacity = Math.ceil(population * 1.1);
  const refs = makeRenderRefs(capacity, config.adaptive);
  const source = createRuntimeAnatomyRenderSource(`iv1b-${population}-${config.name}-${seed}`);

  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc) gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const cpuBefore = process.cpuUsage();
  const wallStart = performance.now();

  for (let i = 0; i < WARMUP_TICKS; i++) {
    activeWorld.step();
    const frame = buildRenderFrame(activeWorld);
    source.syncFrame(frame);
    updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position, source);
  }

  const tickMs: number[] = [];
  const frameBuildMs: number[] = [];
  const syncMs: number[] = [];
  const renderMs: number[] = [];
  const heapKB: number[] = [];
  const retainedByTick: number[] = [];
  const measuredWallStart = performance.now();
  for (let i = 0; i < TICKS; i++) {
    let t0 = performance.now();
    activeWorld.step();
    tickMs.push(performance.now() - t0);

    t0 = performance.now();
    const frame = buildRenderFrame(activeWorld);
    frameBuildMs.push(performance.now() - t0);

    t0 = performance.now();
    source.syncFrame(frame);
    syncMs.push(performance.now() - t0);

    t0 = performance.now();
    updateCreatureInstances(refs, frame, null, null, 16, refs.camera.position, source);
    renderMs.push(performance.now() - t0);

    heapKB.push(process.memoryUsage().heapUsed / 1024);
    if (sink instanceof InMemoryEventSink) retainedByTick.push(sink.summary().retained);
  }
  const measuredWallMs = performance.now() - measuredWallStart;
  // Flush finale del batch incompleto: cronometrato separatamente dal tick.
  const finalFlushStart = performance.now();
  if (sink instanceof InMemoryEventSink) sink.flush();
  const finalFlushMs = performance.now() - finalFlushStart;
  const wallMs = performance.now() - wallStart;
  const cpuAfter = process.cpuUsage(cpuBefore);
  const cpuMs = (cpuAfter.user + cpuAfter.system) / 1000;
  const finalPopulation = activeWorld.organisms.length;
  const memory = process.memoryUsage();

  let events: EventMetrics | null = null;
  if (sink instanceof InMemoryEventSink) {
    const summary = sink.summary();
    const peakRetained = retainedByTick.length ? Math.max(...retainedByTick) : summary.retained;
    // STIMA: E2.3.1 misura ~582 byte/evento (report N.9). Con releaseAfterFlush
    // gli eventi vengono rilasciati, quindi non è possibile serializzare il
    // buffer finale; il valore è derivato da peakRetained × 582 e marcato come
    // stima, non come misurazione diretta.
    const bufferBytesEstimate = peakRetained * 582;
    events = eventMetrics(summary, peakRetained, bufferBytesEstimate, measuredWallMs / 1000, writer);
  }

  const stats = refs.creatureRenderStats;
  const rendering: Record<string, number | boolean | null> = {
    drawn: stats?.drawn ?? null,
    adaptive: stats?.adaptive ?? false,
    updated: stats?.updated ?? null,
    skipped: stats?.skipped ?? null,
    culled: stats?.culled ?? null,
    lodNear: stats?.lodNear ?? null,
    lodFar: stats?.lodFar ?? null,
    droppedParts: stats?.droppedParts ?? null,
    mapped: stats?.mapped ?? null,
    legacy: stats?.legacy ?? null,
    fallback: stats?.fallback ?? null,
  };

  const heapArr = heapKB;
  return {
    population,
    config: config.name,
    seed,
    planetSize: size,
    initialPopulation,
    finalPopulation,
    warmupTicks: WARMUP_TICKS,
    measuredTicks: TICKS,
    tickMs: tickMs.map((v) => num(v)),
    frameBuildMs: frameBuildMs.map((v) => num(v)),
    syncMs: syncMs.map((v) => num(v)),
    renderMs: renderMs.map((v) => num(v)),
    heapKB: heapArr.map((v) => num(v, 1)),
    wallMs: num(wallMs, 2),
    cpuMs: num(cpuMs, 2),
    heapBeforeKB: num(heapBefore / 1024, 1),
    heapAfterKB: num(memory.heapUsed / 1024, 1),
    heapPeakKB: num(Math.max(...heapArr), 1),
    heapGrowthKB: num((memory.heapUsed - heapBefore) / 1024, 1),
    heapSlopeKBPerTick: num(linearSlope(heapArr), 2),
    rssKB: num(memory.rss / 1024, 1),
    flushMs: num((writer?.ms ?? 0) + finalFlushMs, 3),
    measuredWallMs: num(measuredWallMs, 2),
    retainedPeak: events ? events.retained : null,
    ticksPerSecond: measuredWallMs > 0 ? num((TICKS / measuredWallMs) * 1000, 2) : null,
    events,
    rendering,
  };
}

interface Aggregate {
  population: number;
  config: ConfigName;
  runs: number;
  tick: Stats | null;
  frameBuild: Stats | null;
  sync: Stats | null;
  render: Stats | null;
  wall: Stats | null;
  cpu: Stats | null;
  heapGrowthKB: Stats | null;
  heapSlopeKBPerTick: Stats | null;
  ticksPerSecond: Stats | null;
  eventsPerSecond: Stats | null;
  recordedEvents: number | null;
  lostEvents: number | null;
  flushMs: Stats | null;
  bufferKB: number | null;
  rendering: Record<string, number | null>;
}

function aggregate(runs: RunRecord[], population: number, config: ConfigName): Aggregate {
  const flat = (key: "tickMs" | "frameBuildMs" | "syncMs" | "renderMs") => runs.flatMap((r) => r[key]);
  const stat = (key: "wallMs" | "cpuMs" | "heapGrowthKB" | "heapSlopeKBPerTick" | "ticksPerSecond") => {
    const values = runs.map((r) => r[key]).filter((v): v is number => v !== null);
    return summarize(values);
  };
  const eventsPresent = runs.some((r) => r.events !== null);
  const rendering: Record<string, number | null> = {};
  const renderKeys = ["drawn", "updated", "skipped", "culled", "lodNear", "lodFar", "droppedParts", "mapped", "legacy", "fallback"];
  for (const key of renderKeys) {
    const values = runs.map((r) => r.rendering[key]).filter((v): v is number => typeof v === "number");
    rendering[key] = values.length ? num(values.reduce((a, b) => a + b, 0) / values.length, 2) : null;
  }
  const bufferValues = runs.map((r) => r.events?.bufferBytes ?? 0);
  return {
    population,
    config,
    runs: runs.length,
    tick: summarize(flat("tickMs")),
    frameBuild: summarize(flat("frameBuildMs")),
    sync: summarize(flat("syncMs")),
    render: summarize(flat("renderMs")),
    wall: stat("wallMs"),
    cpu: stat("cpuMs"),
    heapGrowthKB: stat("heapGrowthKB"),
    heapSlopeKBPerTick: stat("heapSlopeKBPerTick"),
    ticksPerSecond: stat("ticksPerSecond"),
    eventsPerSecond: eventsPresent
      ? summarize(runs.map((r) => r.events?.eventsPerSecond).filter((v): v is number => v !== null)) : null,
    recordedEvents: eventsPresent ? runs.reduce((a, r) => a + (r.events?.recorded ?? 0), 0) : null,
    lostEvents: eventsPresent ? runs.reduce((a, r) => a + (r.events?.lost ?? 0), 0) : null,
    flushMs: eventsPresent ? summarize(runs.map((r) => r.flushMs)) : null,
    bufferKB: eventsPresent ? num(bufferValues.reduce((a, b) => a + b, 0) / bufferValues.length / 1024, 1) : null,
    rendering,
  };
}

/** Grafico SVG a linee: asse X = popolazione, asse Y = metrica, una serie per configurazione. */
function lineChart(
  title: string, yLabel: string, aggregates: Aggregate[],
  valueOf: (a: Aggregate) => number | null, file: string,
): void {
  const width = 720;
  const height = 360;
  const padL = 70;
  const padR = 20;
  const padT = 46;
  const padB = 52;
  const popLabels = POPULATIONS;
  const values = aggregates.map(valueOf).filter((v): v is number => v !== null && Number.isFinite(v));
  if (!values.length) return;
  const yMax = Math.max(...values) * 1.12;
  const yMin = 0;
  const xFor = (i: number) => padL + (i * (width - padL - padR)) / Math.max(1, popLabels.length - 1);
  const yFor = (v: number) => height - padB - ((v - yMin) / Math.max(1e-9, yMax - yMin)) * (height - padT - padB);
  const colors: Record<ConfigName, string> = {
    baseline: "#64748b", rendering: "#2563eb", observability: "#dc2626", integrated: "#7c3aed",
  };
  const lines = CONFIGS.map((cfg) => {
    const pts = popLabels.map((p, i) => {
      const a = aggregates.find((x) => x.population === p && x.config === cfg.name);
      const v = a ? valueOf(a) : null;
      return v === null ? "" : `${xFor(i)},${yFor(v)}`;
    }).filter(Boolean).join(" ");
    return `<polyline fill="none" stroke="${colors[cfg.name]}" stroke-width="2.4" points="${pts}"/>`;
  }).join("\n    ");
  const legend = CONFIGS.map((cfg, i) =>
    `<rect x="${padL + i * 150}" y="14" width="12" height="12" fill="${colors[cfg.name]}"/><text x="${padL + i * 150 + 18}" y="24" font-size="11" fill="#334155">${cfg.name}</text>`,
  ).join("\n    ");
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = yFor(yMax * f);
    return `<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="#e2e8f0"/><text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#64748b">${(yMax * f).toFixed(2)}</text>`;
  }).join("\n    ");
  const xLabels = popLabels.map((p, i) =>
    `<text x="${xFor(i)}" y="${height - padB + 18}" text-anchor="middle" font-size="10" fill="#64748b">${p}</text>`,
  ).join("\n    ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="${width / 2}" y="42" text-anchor="middle" font-size="15" font-weight="600" fill="#0f172a">${title}</text>
    ${legend}
    ${grid}
    ${lines}
    ${xLabels}
  <text x="${width / 2}" y="${height - 8}" text-anchor="middle" font-size="11" fill="#334155">Popolazione iniziale</text>
  <text x="16" y="${height / 2}" transform="rotate(-90 16 ${height / 2})" text-anchor="middle" font-size="11" fill="#334155">${yLabel}</text>
</svg>`;
  writeFileSync(join(OUT_DIR, file), svg, "utf8");
}

describe("IV1-B — Integrated Performance Benchmark", () => {
  it(
    "esegue la matrice 6 popolazioni x 4 configurazioni x 5 seed su World reali",
    () => {
      mkdirSync(OUT_DIR, { recursive: true });
      const runs: RunRecord[] = [];
      const aggregates: Aggregate[] = [];
      const byCell = new Map<string, RunRecord[]>();
      const currentAggregates = (): Aggregate[] => {
        const out: Aggregate[] = [];
        for (const population of POPULATIONS) {
          for (const config of CONFIGS) {
            const bucket = byCell.get(`${population}:${config.name}`);
            if (bucket?.length) out.push(aggregate(bucket, population, config.name));
          }
        }
        return out;
      };
      for (const population of POPULATIONS) {
        for (let seedIndex = 0; seedIndex < SEEDS.length; seedIndex++) {
          const seed = SEEDS[seedIndex];
          // Ordine ruotato per bilanciare posizione nel processo (JIT/GC/thermal):
          // ogni configurazione occupa ogni posizione una volta su 4 seed.
          const order = CONFIGS.map((_, i) => CONFIGS[(i + seedIndex) % CONFIGS.length]);
          for (const config of order) {
            const record = runOne(config, population, seed);
            runs.push(record);
            const key = `${population}:${config.name}`;
            const bucket = byCell.get(key) ?? [];
            bucket.push(record);
            byCell.set(key, bucket);
          }
        }
        // Scrittura incrementale: se una popolazione elevata fallisce, i dati precedenti sopravvivono.
        writeFileSync(join(OUT_DIR, "dataset.raw.json"), JSON.stringify({
          schema: "evoworld.iv1b.dataset.raw.v1",
          protocol: {
            warmupTicks: WARMUP_TICKS, measuredTicks: TICKS, seeds: SEEDS,
            populations: POPULATIONS, configs: CONFIGS.map((c) => c.name),
            planetSize: PLANET_SIZE, snapshotEveryTicks: 0,
            flushEveryEvents: 5000, releaseAfterFlush: true,
            configOrderRotation: "CONFIGS[(i + seedIndex) % 4]",
          },
          environment: {
            node: (process as { version?: string }).version ?? null,
            platform: process.platform,
            arch: process.arch,
            cpu: cpus()[0]?.model ?? null,
            cores: cpus().length,
            ramGB: num(totalmem() / 1024 ** 3, 2),
            freeRamGBAtStart: num(freemem() / 1024 ** 3, 2),
            gpu: null, fps: null, note: "CPU main-thread Node; GPU/FPS non misurabili.",
          },
          runs: runs.map((r) => ({ ...r, events: r.events ? { ...r.events } : null })),
          aggregates: currentAggregates(),
        }, null, 2), "utf8");
      }
      aggregates.push(...currentAggregates());

      lineChart("Tempo medio per tick", "ms", aggregates, (a) => a.tick?.mean ?? null, "chart-tick-mean.svg");
      lineChart("P95 tempo per tick", "ms", aggregates, (a) => a.tick?.p95 ?? null, "chart-tick-p95.svg");
      lineChart("Tempo aggiornamento creature", "ms", aggregates, (a) => a.render?.mean ?? null, "chart-render-mean.svg");
      lineChart("Eventi registrati al secondo", "eventi/s", aggregates, (a) => a.eventsPerSecond?.mean ?? null, "chart-events-per-second.svg");
      lineChart("Crescita heap per run", "KB", aggregates, (a) => a.heapGrowthKB?.mean ?? null, "chart-heap-growth.svg");

      const summaryRows = aggregates.map((a) => ({
        pop: a.population,
        config: a.config,
        tickMean: a.tick?.mean ?? null,
        tickP95: a.tick?.p95 ?? null,
        tickP99: a.tick?.p99 ?? null,
        tps: a.ticksPerSecond?.mean ?? null,
        renderMean: a.render?.mean ?? null,
        cpuMs: a.cpu?.mean ?? null,
        heapKB: a.heapGrowthKB?.mean ?? null,
        evtPerSec: a.eventsPerSecond?.mean ?? null,
        recorded: a.recordedEvents,
        lost: a.lostEvents,
        flushMs: a.flushMs?.mean ?? null,
        bufferKB: a.bufferKB,
        updated: a.rendering.updated,
        skipped: a.rendering.skipped,
        culled: a.rendering.culled,
      }));
      console.table(summaryRows);
      console.log("IV1B_DATASET_JSON=" + JSON.stringify({ path: join(OUT_DIR, "dataset.raw.json"), runs: runs.length, aggregates: aggregates.length }));

      expect(runs.length).toBe(POPULATIONS.length * CONFIGS.length * SEEDS.length);
      for (const run of runs) {
        expect(run.tickMs.length).toBe(TICKS);
        expect(run.renderMs.length).toBe(TICKS);
        expect(Number.isFinite(run.wallMs)).toBe(true);
        if (run.events) expect(run.events.recorded).toBeGreaterThanOrEqual(0);
      }
    },
    3_600_000,
  );
});
