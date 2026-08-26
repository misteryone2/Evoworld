import { World } from "../simulation/core/world";
import { buildRenderFrame } from "../simulation/core/renderFrame";
import { buildViewportFrame } from "../simulation/core/viewportFrame";
import type { PlanetConfig } from "../types";

/**
 * v1.1 — World Scale benchmark.
 *
 * Not part of the normal test suite (npm run test only picks up
 * tests/**\/*.test.ts — see vitest.config.ts) since it's deliberately
 * slow and only meaningful when run on demand, e.g. after touching
 * anything under simulation/planet or simulation/core.
 *
 * Run with:  npm run benchmark
 * (uses vitest.bench.config.ts, which points at this file specifically)
 *
 * Measures, for each world-size preset x population combination:
 *  - average ms/tick in steady state (after a short warmup)
 *  - heap memory delta (a rough, GC-noise-prone but directionally useful
 *    signal — Node's --expose-gc isn't assumed available here)
 *  - how many terrain chunks actually got materialized (this is the
 *    number that should track population footprint, NOT world size)
 *  - RenderFrame (per-tick worker->UI payload) size in bytes — expected
 *    to scale with population only, flat across world sizes
 *  - ViewportFrame (on-demand terrain texture payload) size in bytes at
 *    a representative LOD tier — expected to stay FLAT regardless of
 *    world size, since its resolution is capped independently (see
 *    TERRAIN_LOD_TIERS in components/simulation/Planet3DView.tsx)
 *  - snapshot ("save file") size in bytes, via JSON.stringify of
 *    World.toSnapshot() — expected to track materialized chunk count,
 *    not declared world size
 *
 * HONEST FINDING from the first real run of this benchmark (kept here
 * rather than only in a chat transcript): CPU cost per tick tracks
 * population, not world size, exactly as intended — the active-chunk
 * halo mechanism works. Memory/snapshot size is a more nuanced story:
 * Planet.getCell also materializes a chunk as a side effect of simple
 * presence checks during World.seedPopulation, so a large population
 * scattered randomly across a huge world can end up touching (and
 * permanently materializing — there is no chunk eviction yet) most or
 * all of that world's chunks almost immediately, even though per-tick
 * *update* cost stays bounded to the active set. The memory benefit is
 * therefore strongest when population is sparse relative to world area
 * or the session is short; a very large, densely-populated, long-running
 * world will still see materialized-chunk (and snapshot) size trend
 * toward the old dense-grid cost over time. Chunk eviction for
 * long-dormant chunks (regenerating them from baseline on next visit,
 * exactly like a never-before-seen chunk) would close this gap and is a
 * natural, contained v1.2+ addition — documented here rather than added
 * under time pressure in v1.1.
 */

const WORLD_SIZES: { label: string; width: number; height: number }[] = [
  { label: "512x512 (Piccolo)", width: 512, height: 512 },
  { label: "1024x1024 (Medio)", width: 1024, height: 1024 },
  { label: "2048x2048 (Grande)", width: 2048, height: 2048 },
];

const POPULATIONS = [200, 1000, 5000];

const WARMUP_TICKS = 20;
const MEASURED_TICKS = 100;

interface Row {
  world: string;
  population: number;
  msPerTick: string;
  heapDeltaMB: string;
  materializedChunks: number;
  estimatedChunkMB: string;
  renderFrameBytes: number;
  viewportFrameBytes: number;
  snapshotBytes: number;
}

function approxBytes(value: unknown, seen = new WeakSet<object>()): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return 8;
  if (typeof value === "boolean") return 4;
  if (typeof value === "string") return value.length * 2;
  if (value instanceof Float32Array || value instanceof Uint8Array) return value.byteLength;
  if (Array.isArray(value)) {
    let sum = 0;
    for (const item of value) sum += approxBytes(item, seen);
    return sum;
  }
  if (typeof value === "object") {
    if (seen.has(value as object)) return 0;
    seen.add(value as object);
    let sum = 0;
    for (const key of Object.keys(value as object)) {
      sum += approxBytes((value as Record<string, unknown>)[key], seen);
    }
    return sum;
  }
  return 0;
}

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function runOne(size: { width: number; height: number }, population: number): Row {
  const config: PlanetConfig = { width: size.width, height: size.height, seed: 12345 };

  if (global.gc) global.gc();
  const heapBefore = process.memoryUsage().heapUsed;

  const world = new World(config, population);

  for (let i = 0; i < WARMUP_TICKS; i++) world.step();

  const start = performance.now();
  for (let i = 0; i < MEASURED_TICKS; i++) world.step();
  const elapsed = performance.now() - start;

  const heapAfter = process.memoryUsage().heapUsed;

  const frame = buildRenderFrame(world);
  const renderFrameBytes = approxBytes(frame);

  const viewport = buildViewportFrame(world, {
    centerX: size.width / 2,
    centerY: size.height / 2,
    radiusX: size.width / 2,
    radiusY: size.height / 2,
    maxWidth: 640,
    maxHeight: 320,
  });
  const viewportFrameBytes = approxBytes(viewport);

  const snapshot = world.toSnapshot();
  const snapshotBytes = approxBytes(snapshot);

  const chunkSize = world.planet.chunkSize;
  const materializedChunks = world.planet.getMaterializedChunks().length;
  // ~5 numeric fields/cell, 8 bytes each, plus per-object overhead —
  // deterministic and far more trustworthy than heapDeltaMB (see below),
  // which is subject to GC timing noise since --expose-gc isn't assumed
  // available here.
  const estimatedChunkMB = formatMB(materializedChunks * chunkSize * chunkSize * 48);

  return {
    world: `${size.width}x${size.height}`,
    population,
    msPerTick: (elapsed / MEASURED_TICKS).toFixed(3),
    heapDeltaMB: formatMB(heapAfter - heapBefore),
    materializedChunks,
    estimatedChunkMB,
    renderFrameBytes,
    viewportFrameBytes,
    snapshotBytes,
  };
}

// vitest picks this up as a normal test (it has assertions), but its
// real purpose is the console.table output — see the file header for
// how to run it deliberately, separately from the fast mobile test
// suite.
import { describe, it, expect } from "vitest";

describe("v1.1 World Scale benchmark", () => {
  it(
    "runs World.step() across world sizes and populations, reporting cost/footprint",
    () => {
      const rows: Row[] = [];
      for (const size of WORLD_SIZES) {
        for (const population of POPULATIONS) {
          rows.push(runOne(size, population));
        }
      }

      // eslint-disable-next-line no-console
      console.table(rows);

      // Sanity assertions — not the point of this file, but keep it a
      // real, honest check rather than a script that could silently
      // start reporting nonsense.
      for (const row of rows) {
        expect(Number(row.msPerTick)).toBeGreaterThan(0);
        expect(row.materializedChunks).toBeGreaterThan(0);
      }

      // The core v1.1 claim: ViewportFrame size at a fixed LOD tier stays
      // flat regardless of world size, once the world is at least as
      // large as the requested resolution (a world *smaller* than the
      // request is legitimately served at a lower, clamped resolution —
      // there's no point manufacturing texels for cells that don't
      // exist, so 512x512 is excluded from this comparison on purpose).
      const worldsAtOrAboveRequestedRes = rows.filter((r) => r.world !== "512x512");
      const byPopulation = new Map<number, number[]>();
      for (const row of worldsAtOrAboveRequestedRes) {
        const list = byPopulation.get(row.population) ?? [];
        list.push(row.viewportFrameBytes);
        byPopulation.set(row.population, list);
      }
      for (const sizes of byPopulation.values()) {
        const max = Math.max(...sizes);
        const min = Math.min(...sizes);
        expect(max - min).toBeLessThan(max * 0.05); // within 5% across 1024 and 2048
      }
    },
    240_000,
  );
});
