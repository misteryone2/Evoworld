import { describe, expect, it } from "vitest";
import {
  createEarthLikeConfig,
  DEFAULT_PLANET_SCHEDULER,
  PLANET_ENGINE_VERSION,
} from "../simulation/planetEngine/core/PlanetCore";
import { PlanetEngine } from "../simulation/planetEngine/runtime/PlanetEngine";
import { PLANET_UNITS } from "../simulation/planetEngine/units";
import type { PlanetPhysicalConfig } from "../simulation/planetEngine/contracts";

/**
 * Planet Engine P2 — reproducible headless benchmark.
 *
 * Esegui: npx vitest run --config vitest.bench.config.ts scripts/planetEngine.benchmark.ts
 *
 * Measures CPU main-thread time only: no renderer, GENOME, browser FPS or GPU
 * upload is involved. Each phase uses a dedicated engine created before timing;
 * construction of those phase engines is excluded from every phase except the
 * explicit `init` row. Heap/RSS deltas are raw process indicators and may be
 * affected by GC, so they are reported as measured, not as allocations.
 */

const SIZES = [64, 128, 256, 512, 1024] as const;
type Size = (typeof SIZES)[number];
type Phase = "init" | "step" | "climate" | "hydrology" | "geology" | "snapshot" | "sample";

const PHASES: readonly Phase[] = ["init", "step", "climate", "hydrology", "geology", "snapshot", "sample"];
const SEED = 7;
const DELTA_S = PLANET_UNITS.secondsPerEarthDay;
const SAMPLE_CELLS = 64;
const WARMUP: Record<Size, number> = { 64: 2, 128: 2, 256: 1, 512: 1, 1024: 1 };

// Reduced at large grids to keep the whole profile within the configured
// 400 s vitest timeout. The exact counts are included in the JSON report.
const ITERATIONS: Record<Size, Record<Phase, number>> = {
  64: { init: 6, step: 6, climate: 20, hydrology: 20, geology: 20, snapshot: 20, sample: 20 },
  128: { init: 5, step: 5, climate: 14, hydrology: 14, geology: 14, snapshot: 14, sample: 14 },
  256: { init: 4, step: 4, climate: 10, hydrology: 10, geology: 10, snapshot: 10, sample: 10 },
  512: { init: 3, step: 3, climate: 6, hydrology: 6, geology: 6, snapshot: 6, sample: 6 },
  1024: { init: 2, step: 2, climate: 3, hydrology: 3, geology: 3, snapshot: 3, sample: 3 },
};

interface MemoryUsage {
  heapUsed: number;
  rss: number;
}

const proc = (globalThis as {
  process?: { version?: string; platform?: string; memoryUsage?: () => MemoryUsage };
}).process;

interface Measurement {
  size: Size;
  phase: Phase;
  iterations: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  heapDeltaKB: number | null;
  rssDeltaKB: number | null;
  checksum: number;
}

function percentile(sorted: readonly number[], q: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function memoryBefore(): MemoryUsage | null {
  const before = proc?.memoryUsage?.();
  return before ? { heapUsed: before.heapUsed, rss: before.rss } : null;
}

function measure(
  size: Size,
  phase: Phase,
  warmup: number,
  iterations: number,
  fn: (iteration: number) => number,
): Measurement {
  for (let i = 0; i < warmup; i += 1) fn(iterations + i);

  const before = memoryBefore();
  const times: number[] = [];
  let checksum = 0;
  for (let i = 0; i < iterations; i += 1) {
    const started = performance.now();
    checksum += fn(i);
    times.push(performance.now() - started);
  }
  const after = proc?.memoryUsage?.();

  const sorted = [...times].sort((a, b) => a - b);
  const meanMs = times.reduce((sum, value) => sum + value, 0) / times.length;
  return {
    size,
    phase,
    iterations,
    meanMs: round(meanMs),
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    heapDeltaKB: before && after ? round((after.heapUsed - before.heapUsed) / 1024) : null,
    rssDeltaKB: before && after ? round((after.rss - before.rss) / 1024) : null,
    checksum,
  };
}

function makeConfig(size: Size): PlanetPhysicalConfig {
  return createEarthLikeConfig({
    seed: SEED,
    surface: { gridWidth: size, gridHeight: size },
    scheduler: { ...DEFAULT_PLANET_SCHEDULER },
  });
}

/** Deterministic cache-miss sampling path; never uses Math.random. */
function sampleCells(engine: PlanetEngine, width: number, height: number, iteration: number): number {
  const snapshot = engine.environmentSnapshot();
  let state = (123456789 + iteration * 1000003) >>> 0;
  let checksum = 0;
  for (let i = 0; i < SAMPLE_CELLS; i += 1) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    const x = state % width;
    const y = (state >>> 16) % height;
    checksum += snapshot.sample(x, y).temperatureK;
  }
  return checksum;
}

function profile(size: Size): Measurement[] {
  const config = makeConfig(size);
  const iterations = ITERATIONS[size];
  const warmup = WARMUP[size];

  const stepEngine = new PlanetEngine(config);
  stepEngine.environmentSnapshot();
  const climateEngine = new PlanetEngine(config);
  const hydrologyEngine = new PlanetEngine(config);
  const geologyEngine = new PlanetEngine(config);
  const snapshotEngine = new PlanetEngine(config);
  snapshotEngine.environmentSnapshot();

  const rows: Measurement[] = [];
  for (const phase of PHASES) {
    switch (phase) {
      case "init":
        rows.push(measure(size, phase, warmup, iterations.init, () => {
          const engine = new PlanetEngine(config);
          return engine.engineVersion.length;
        }));
        break;
      case "step":
        rows.push(measure(size, phase, warmup, iterations.step, () => stepEngine.step(DELTA_S).tick));
        break;
      case "climate":
        rows.push(measure(size, phase, warmup, iterations.climate, () =>
          climateEngine.refreshClimateField().temperatureK[0]));
        break;
      case "hydrology":
        rows.push(measure(size, phase, warmup, iterations.hydrology, () =>
          hydrologyEngine.getHydrologyField(DELTA_S).precipitationMPerYear[0]));
        break;
      case "geology":
        rows.push(measure(size, phase, warmup, iterations.geology, () =>
          geologyEngine.stepGeology(DELTA_S).elevationM[0]));
        break;
      case "snapshot":
        rows.push(measure(size, phase, warmup, iterations.snapshot, () =>
          snapshotEngine.createEnvironmentSnapshot(DELTA_S).timeS));
        break;
      case "sample":
        rows.push(measure(size, phase, warmup, iterations.sample, (i) =>
          sampleCells(snapshotEngine, size, size, i)));
        break;
    }
  }
  return rows;
}

describe("Planet Engine — P2 headless benchmark", () => {
  it(
    "profiles init, step and each subsystem at 64²–1024²",
    () => {
      const rows: Measurement[] = [];
      for (const size of SIZES) rows.push(...profile(size));

      console.table(rows.map((row) => ({
        size: `${row.size}x${row.size}`,
        phase: row.phase,
        iterations: row.iterations,
        mean_ms: row.meanMs.toFixed(3),
        p50_ms: row.p50Ms.toFixed(3),
        p95_ms: row.p95Ms.toFixed(3),
        heap_delta_kb: row.heapDeltaKB,
        rss_delta_kb: row.rssDeltaKB,
      })));

      console.log(`PLANET_ENGINE_BENCHMARK_JSON=${JSON.stringify({
        environment: {
          node: proc?.version ?? null,
          platform: proc?.platform ?? null,
          timer: "performance.now (CPU main thread)",
        },
        config: {
          seed: SEED,
          deltaS: DELTA_S,
          scheduler: DEFAULT_PLANET_SCHEDULER,
          sizes: SIZES,
          sampleCells: SAMPLE_CELLS,
          warmup: WARMUP,
          iterations: ITERATIONS,
          engineVersion: PLANET_ENGINE_VERSION,
          snapshotVersion: 1,
        },
        limits: [
          "No renderer, browser, GPU, GENOME or main-simulation integration is measured.",
          "Heap/RSS deltas are raw process indicators; GC may occur during a series.",
          "Large grids use fewer samples; P50/P95 are nearest-rank quantiles of few observations.",
          "Construction of dedicated phase engines is excluded except in the init row.",
          "Cell sampling uses 64 deterministic cache-miss cells per measured iteration.",
        ],
        rows: rows.map((row) => ({
          ...row,
          meanMs: row.meanMs,
          p50Ms: row.p50Ms,
          p95Ms: row.p95Ms,
        })),
      })}`);

      for (const row of rows) {
        expect(Number.isFinite(row.meanMs)).toBe(true);
        expect(row.meanMs).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(row.checksum)).toBe(true);
      }
    },
    400_000,
  );
});
