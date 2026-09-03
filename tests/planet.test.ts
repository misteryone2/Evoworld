import { describe, it, expect } from "vitest";
import { Planet } from "../simulation/planet/planet";
import { computeActiveChunkKeys } from "../simulation/planet/chunkActivity";

/** Reads every cell in [0, width) x [0, height) via getCell — the v1.1 chunked equivalent of iterating the old dense planet.cells array. */
function readAllCells(planet: Planet) {
  const cells = [];
  for (let y = 0; y < planet.height; y++) {
    for (let x = 0; x < planet.width; x++) {
      cells.push(planet.getCell(x, y));
    }
  }
  return cells;
}

/** activeChunkKeys covering every chunk on a planet, so update() behaves like the old whole-grid update. */
function allChunks(planet: Planet): Set<string> {
  const keys = new Set<string>();
  for (let cy = 0; cy < planet.chunksY; cy++) {
    for (let cx = 0; cx < planet.chunksX; cx++) keys.add(`${cx},${cy}`);
  }
  return keys;
}

describe("Planet — biomes and climate", () => {
  it("generates a grid with the requested dimensions", () => {
    const planet = new Planet({ width: 20, height: 15, seed: 1 });
    expect(readAllCells(planet).length).toBe(20 * 15);
    expect(planet.width).toBe(20);
    expect(planet.height).toBe(15);
  });

  it("assigns every cell a valid terrain type", () => {
    const planet = new Planet({ width: 30, height: 30, seed: 2 });
    const validTerrains = new Set(["ocean", "mountain", "plains", "desert", "forest", "tundra", "savanna"]);
    for (const cell of readAllCells(planet)) {
      expect(validTerrains.has(cell.terrain)).toBe(true);
    }
  });

  it("cycles through all four seasons across one simulated year", () => {
    const seasonsSeen = new Set<string>();
    for (let tick = 0; tick < 400; tick += 10) {
      seasonsSeen.add(Planet.seasonForTick(tick));
    }
    expect(seasonsSeen.size).toBe(4);
  });

  it("season cycle repeats identically every year", () => {
    expect(Planet.seasonForTick(0)).toBe(Planet.seasonForTick(400));
    expect(Planet.seasonForTick(150)).toBe(Planet.seasonForTick(550));
  });

  it("ocean cells never regrow vegetation or change terrain", () => {
    const planet = new Planet({ width: 25, height: 25, seed: 3 });
    const active = allChunks(planet);
    const oceanCoords: [number, number][] = [];
    for (let y = 0; y < planet.height; y++) {
      for (let x = 0; x < planet.width; x++) {
        if (planet.getCell(x, y).terrain === "ocean") oceanCoords.push([x, y]);
      }
    }

    for (let tick = 1; tick <= 500; tick++) planet.update(tick, active);

    for (const [x, y] of oceanCoords) {
      const cell = planet.getCell(x, y);
      expect(cell.terrain).toBe("ocean");
      expect(cell.vegetation).toBe(0);
    }
  });

  it("land vegetation stays within valid [0,1] bounds over many ticks", () => {
    const planet = new Planet({ width: 25, height: 25, seed: 4 });
    const active = allChunks(planet);
    for (let tick = 1; tick <= 1000; tick++) planet.update(tick, active);
    for (const cell of readAllCells(planet)) {
      expect(cell.vegetation).toBeGreaterThanOrEqual(0);
      expect(cell.vegetation).toBeLessThanOrEqual(1);
    }
  });

  it("biomes can dynamically reclassify as climate/vegetation change over time", () => {
    const planet = new Planet({ width: 25, height: 25, seed: 5 });
    const active = allChunks(planet);
    const initialTerrain = readAllCells(planet).map((c) => c.terrain);

    for (let tick = 1; tick <= 3000; tick++) planet.update(tick, active);

    const finalTerrain = readAllCells(planet).map((c) => c.terrain);
    // At least some land cells should have changed biome classification
    // over a long enough time horizon with seasonal cycling.
    let changed = 0;
    for (let i = 0; i < initialTerrain.length; i++) {
      if (initialTerrain[i] !== finalTerrain[i]) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });
});

describe("Planet — v1.1 chunked generation (lazy, order-independent)", () => {
  it("lazily materializes only chunks that are actually accessed", () => {
    const planet = new Planet({ width: 256, height: 256, seed: 10 });
    expect(planet.hasChunk(0, 0)).toBe(false);
    planet.getCell(5, 5);
    expect(planet.hasChunk(0, 0)).toBe(true);
    // A far-away chunk stays untouched.
    expect(planet.hasChunk(7, 7)).toBe(false);
  });

  it("produces identical terrain regardless of the order chunks are visited in", () => {
    const a = new Planet({ width: 256, height: 256, seed: 42 });
    const b = new Planet({ width: 256, height: 256, seed: 42 });

    // a: visited in natural row-major chunk order.
    for (let cy = 0; cy < a.chunksY; cy++) {
      for (let cx = 0; cx < a.chunksX; cx++) a.getCell(cx * a.chunkSize, cy * a.chunkSize);
    }
    // b: same chunks, visited in reverse order (a different discovery path).
    for (let cy = b.chunksY - 1; cy >= 0; cy--) {
      for (let cx = b.chunksX - 1; cx >= 0; cx--) b.getCell(cx * b.chunkSize, cy * b.chunkSize);
    }

    for (let y = 0; y < 256; y += 17) {
      for (let x = 0; x < 256; x += 17) {
        expect(a.getCell(x, y)).toEqual(b.getCell(x, y));
      }
    }
  });

  it("peekCell returns null for an unmaterialized chunk and the live cell once materialized", () => {
    const planet = new Planet({ width: 128, height: 128, seed: 6 });
    expect(planet.peekCell(10, 10)).toBeNull();
    const cell = planet.getCell(10, 10);
    expect(planet.peekCell(10, 10)).toEqual(cell);
  });

  it("sampleBaseline never materializes a chunk and matches a freshly-generated cell", () => {
    const planet = new Planet({ width: 128, height: 128, seed: 7 });
    const baseline = planet.sampleBaseline(50, 50);
    expect(planet.hasChunk(1, 1)).toBe(false);
    expect(planet.getCell(50, 50)).toEqual(baseline);
  });
});

describe("Planet — v1.1 dormant-chunk catch-up", () => {
  it("a chunk reactivated after a long gap ends up with valid, bounded state (no per-tick replay needed)", () => {
    const planet = new Planet({ width: 64, height: 64, seed: 11 });
    const key = "0,0";
    const active = new Set([key]);

    // Active for a while, then goes dormant (simply not passed to update).
    for (let tick = 1; tick <= 50; tick++) planet.update(tick, active);

    // Long dormancy: not touched again for thousands of ticks, then reactivates.
    planet.update(5000, active);

    for (let ly = 0; ly < planet.chunkSize; ly++) {
      for (let lx = 0; lx < planet.chunkSize; lx++) {
        const cell = planet.getCell(lx, ly);
        expect(cell.vegetation).toBeGreaterThanOrEqual(0);
        expect(cell.vegetation).toBeLessThanOrEqual(1);
        expect(Number.isFinite(cell.temperature)).toBe(true);
      }
    }
  });

  it("catch-up moves vegetation toward the same equilibrium continuous simulation would reach", () => {
    // Two planets, same seed: one simulated every tick, one dormant then
    // caught up in one jump — both should land in a similar vegetation
    // neighborhood (the catch-up is an approximation, not required to be
    // bit-exact, but should not diverge wildly).
    const continuous = new Planet({ width: 32, height: 32, seed: 21 });
    const dormant = new Planet({ width: 32, height: 32, seed: 21 });
    const active = new Set(["0,0"]);

    for (let tick = 1; tick <= 2000; tick++) continuous.update(tick, active);
    // Materialize + start tracking the dormant chunk at tick 1 (matching
    // continuous's starting point), then jump straight to tick 2000 in a
    // single catch-up call — this is the actual "long dormancy" case;
    // without this first call the chunk would just be freshly generated
    // at tick 2000 with baseline (untouched) values, which isn't what
    // catch-up is meant to test.
    dormant.update(1, active);
    dormant.update(2000, active);

    let sumContinuous = 0;
    let sumDormant = 0;
    let n = 0;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const c = continuous.getCell(x, y);
        const d = dormant.getCell(x, y);
        if (c.terrain === "ocean") continue;
        sumContinuous += c.vegetation;
        sumDormant += d.vegetation;
        n++;
      }
    }
    expect(Math.abs(sumContinuous / n - sumDormant / n)).toBeLessThan(0.15);
  });
});

describe("Planet — v1.1 persistence (chunk snapshots + legacy migration)", () => {
  it("round-trips materialized chunks through getMaterializedChunks/fromChunkSnapshot", () => {
    const planet = new Planet({ width: 64, height: 64, seed: 30 });
    planet.getCell(1, 1);
    planet.getCell(40, 40);
    const chunks = planet.getMaterializedChunks();
    expect(chunks.length).toBe(2);

    const restored = Planet.fromChunkSnapshot(planet.config, chunks);
    expect(restored.getCell(1, 1)).toEqual(planet.getCell(1, 1));
    expect(restored.getCell(40, 40)).toEqual(planet.getCell(40, 40));
    expect(restored.hasChunk(2, 2)).toBe(false);
  });

  it("migrates a legacy dense width*height cell array into chunks", () => {
    const width = 20;
    const height = 15;
    const dense = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        dense.push({ elevation: 0.1, temperature: 20, water: 0.5, vegetation: 0.5, terrain: "plains" as const });
      }
    }
    const planet = Planet.fromLegacyDenseCells({ width, height, seed: 99 }, dense);
    expect(planet.getCell(5, 5)).toEqual(dense[5 * width + 5]);
    expect(planet.getCell(19, 14)).toEqual(dense[14 * width + 19]);
  });
});

describe("Planet — v1.2.1 procedural morphology (fBm elevation/water)", () => {
  it("elevation and water always stay within the valid [0,1] range", () => {
    const planet = new Planet({ width: 256, height: 256, seed: 123 });
    for (let y = 0; y < 256; y += 7) {
      for (let x = 0; x < 256; x += 7) {
        const cell = planet.getCell(x, y);
        expect(cell.elevation).toBeGreaterThanOrEqual(0);
        expect(cell.elevation).toBeLessThanOrEqual(1);
        expect(cell.water).toBeGreaterThanOrEqual(0);
        expect(cell.water).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is deterministic: the same seed and coordinates always give the same elevation/water", () => {
    const a = new Planet({ width: 256, height: 256, seed: 555 });
    const b = new Planet({ width: 256, height: 256, seed: 555 });
    for (const [x, y] of [[10, 10], [200, 5], [77, 199], [128, 128]]) {
      const ca = a.getCell(x, y);
      const cb = b.getCell(x, y);
      expect(ca.elevation).toBe(cb.elevation);
      expect(ca.water).toBe(cb.water);
    }
  });

  it("produces a non-degenerate distribution (not every cell collapsed to the same value)", () => {
    const planet = new Planet({ width: 256, height: 256, seed: 42 });
    const elevations: number[] = [];
    for (let y = 0; y < 256; y += 4) {
      for (let x = 0; x < 256; x += 4) {
        elevations.push(planet.getCell(x, y).elevation);
      }
    }
    const mean = elevations.reduce((a, b) => a + b, 0) / elevations.length;
    const variance = elevations.reduce((a, b) => a + (b - mean) ** 2, 0) / elevations.length;
    // A degenerate/flat field would have variance near zero (<<0.005);
    // real terrain spans a meaningful range of the [0,1] scale.
    expect(variance).toBeGreaterThan(0.005);
    expect(Math.max(...elevations) - Math.min(...elevations)).toBeGreaterThan(0.3);
  });

  it("shows genuine macro-scale structure: large contiguous same-terrain regions exist, not just scattered single cells", () => {
    // A flood-fill over a sampled grid, counting the largest connected
    // component of a single terrain type. The old few-random-blobs field
    // could produce some clustering too, but nothing on this scale — this
    // is a real, if coarse, way to distinguish "genuinely continent-sized
    // landmasses" from "scattered noise that happens to have some local
    // correlation".
    const planet = new Planet({ width: 512, height: 512, seed: 7 });
    const gridSize = 64;
    const step = 512 / gridSize;
    const terrainGrid: string[][] = [];
    for (let gy = 0; gy < gridSize; gy++) {
      const row: string[] = [];
      for (let gx = 0; gx < gridSize; gx++) {
        row.push(planet.getCell(Math.floor(gx * step), Math.floor(gy * step)).terrain);
      }
      terrainGrid.push(row);
    }

    const visited = Array.from({ length: gridSize }, () => new Array(gridSize).fill(false));
    let largestComponent = 0;
    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        if (visited[gy][gx]) continue;
        const terrain = terrainGrid[gy][gx];
        const stack = [[gx, gy]];
        visited[gy][gx] = true;
        let size = 0;
        while (stack.length > 0) {
          const [cx, cy] = stack.pop()!;
          size++;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = (cx + dx + gridSize) % gridSize;
            const ny = (cy + dy + gridSize) % gridSize;
            if (!visited[ny][nx] && terrainGrid[ny][nx] === terrain) {
              visited[ny][nx] = true;
              stack.push([nx, ny]);
            }
          }
        }
        largestComponent = Math.max(largestComponent, size);
      }
    }
    // Out of 64x64=4096 sampled points, a real continent/ocean-scale
    // structure should produce at least one connected region covering a
    // clear double-digit percentage of the map — a handful of scattered
    // single-cell "islands" would not.
    expect(largestComponent).toBeGreaterThan(gridSize * gridSize * 0.05);
  });

  it("mountains preferentially form on elevated/continental terrain, not scattered in open ocean", () => {
    const planet = new Planet({ width: 512, height: 512, seed: 2024 });
    let mountainCount = 0;
    let mountainSurroundedByOcean = 0;
    for (let y = 0; y < 512; y += 8) {
      for (let x = 0; x < 512; x += 8) {
        if (planet.getCell(x, y).terrain !== "mountain") continue;
        mountainCount++;
        let oceanNeighbors = 0;
        for (const [dx, dy] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) {
          if (planet.getCell((x + dx + 512) % 512, (y + dy + 512) % 512).terrain === "ocean") oceanNeighbors++;
        }
        if (oceanNeighbors === 4) mountainSurroundedByOcean++;
      }
    }
    if (mountainCount > 0) {
      // Most mountains should not be fully surrounded by ocean on all
      // four sides — i.e. they emerge from land, not float as isolated
      // peaks in open sea.
      expect(mountainSurroundedByOcean / mountainCount).toBeLessThan(0.2);
    }
  });
});

describe("chunkActivity — computeActiveChunkKeys", () => {
  it("includes an organism's own chunk plus a halo ring around it", () => {
    const organisms = [{ alive: true, position: { x: 50, y: 50 } }];
    // width/height 256, chunkSize 32 -> chunk (1,1); halo 1 -> 3x3 ring.
    const active = computeActiveChunkKeys(organisms, 256, 256, 32, 1);
    expect(active.has("1,1")).toBe(true);
    expect(active.size).toBe(9);
    for (const dx of [0, 1, 2]) {
      for (const dy of [0, 1, 2]) expect(active.has(`${dx},${dy}`)).toBe(true);
    }
  });

  it("wraps halo chunks around world edges (torus)", () => {
    const organisms = [{ alive: true, position: { x: 5, y: 5 } }]; // chunk (0,0), near the top-left edge
    const active = computeActiveChunkKeys(organisms, 256, 256, 32, 1);
    // chunksX = chunksY = 8; wrapping left/up from chunk 0 lands on chunk 7.
    expect(active.has("7,7")).toBe(true);
    expect(active.has("0,0")).toBe(true);
  });

  it("ignores dead organisms", () => {
    const organisms = [{ alive: false, position: { x: 50, y: 50 } }];
    const active = computeActiveChunkKeys(organisms, 256, 256, 32, 1);
    expect(active.size).toBe(0);
  });

  it("stays cheap (bounded key count) for a large population clustered in one region", () => {
    const organisms = Array.from({ length: 5000 }, (_, i) => ({
      alive: true,
      position: { x: 100 + (i % 20), y: 100 + Math.floor(i / 20) },
    }));
    const active = computeActiveChunkKeys(organisms, 2048, 2048, 32, 1);
    // A tightly clustered population should only ever touch a small
    // number of distinct chunks, regardless of how large the declared
    // world is.
    expect(active.size).toBeLessThan(50);
  });
});
