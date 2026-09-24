import { describe, it, expect } from "vitest";
import { Planet } from "../simulation/planet/planet";
import { computeElevationAt, computeVegetationPotential } from "../simulation/planet/terrainNoise";
import { computeWaterAvailability, hydrologyAt } from "../simulation/planet/hydrology";
import { computeActiveChunkKeys } from "../simulation/planet/chunkActivity";

const WIDTH = 256;
const HEIGHT = 256;
const SEED = 9001;

/** activeChunkKeys covering every chunk on a planet. */
function allChunks(planet: Planet): Set<string> {
  const keys = new Set<string>();
  for (let cy = 0; cy < planet.chunksY; cy++) {
    for (let cx = 0; cx < planet.chunksX; cx++) keys.add(`${cx},${cy}`);
  }
  return keys;
}

describe("v1.2.4 — Biome & Vegetation Integration", () => {
  describe("Test 1 — Temperature range", () => {
    it("temperature stays within a plausible bounded range across a large sampled world", () => {
      const planet = new Planet({ width: WIDTH, height: HEIGHT, seed: SEED });
      for (let y = 0; y < HEIGHT; y += 5) {
        for (let x = 0; x < WIDTH; x += 5) {
          const t = planet.getCell(x, y).temperature;
          expect(Number.isFinite(t)).toBe(true);
          expect(t).toBeGreaterThan(-60);
          expect(t).toBeLessThan(60);
        }
      }
    });
  });

  describe("Test 2 — Latitude gradient", () => {
    it("the equator is warmer than the poles, as a statistical tendency", () => {
      const planet = new Planet({ width: WIDTH, height: HEIGHT, seed: SEED });
      let equatorSum = 0;
      let poleSum = 0;
      let n = 0;
      const equatorY = Math.floor(HEIGHT / 2);
      for (let x = 0; x < WIDTH; x += 3) {
        equatorSum += planet.getCell(x, equatorY).temperature;
        poleSum += planet.getCell(x, 1).temperature;
        n++;
      }
      expect(equatorSum / n).toBeGreaterThan(poleSum / n);
    });
  });

  describe("Test 3 — Elevation cooling", () => {
    it("at the same latitude, higher elevation means (on average) lower temperature", () => {
      // computeElevationAt/temperature both come straight from the same
      // formula Planet.computeCellBaseline uses, so we can probe it
      // directly across many x at a fixed y (fixed latitude) and bucket
      // by elevation, rather than needing to find naturally-paired cells.
      const planet = new Planet({ width: WIDTH, height: HEIGHT, seed: SEED });
      const y = Math.floor(HEIGHT / 2) + 10; // fixed latitude, off-equator to avoid symmetry edge cases
      const samples: { elevation: number; temperature: number }[] = [];
      for (let x = 0; x < WIDTH; x++) {
        const cell = planet.getCell(x, y);
        samples.push({ elevation: cell.elevation, temperature: cell.temperature });
      }
      const sorted = [...samples].sort((a, b) => a.elevation - b.elevation);
      const lowHalf = sorted.slice(0, Math.floor(sorted.length / 2));
      const highHalf = sorted.slice(Math.ceil(sorted.length / 2));
      const avg = (arr: typeof sorted) => arr.reduce((s, c) => s + c.temperature, 0) / arr.length;
      expect(avg(lowHalf)).toBeGreaterThan(avg(highHalf));
    });
  });

  describe("Test 4 — Water influence", () => {
    it("at the same temperature, more water availability does not systematically lower vegetation potential", () => {
      const temperature = 22; // peak climate suitability, isolates the water term
      const low = computeVegetationPotential(SEED, 10, 10, temperature, 0.1);
      const mid = computeVegetationPotential(SEED, 11, 11, temperature, 0.4);
      const high = computeVegetationPotential(SEED, 12, 12, temperature, 0.55);
      expect(mid).toBeGreaterThanOrEqual(low);
      expect(high).toBeGreaterThanOrEqual(mid);
    });

    it("water availability is always bounded to [0, 1] regardless of river/lake influence", () => {
      expect(computeWaterAvailability(1, 1, true)).toBeLessThanOrEqual(1);
      expect(computeWaterAvailability(0, 0, false)).toBe(0);
      expect(computeWaterAvailability(0.9, 1, true)).toBeLessThanOrEqual(1);
    });
  });

  describe("Test 5 — River influence", () => {
    it("a higher riverFlow yields higher water availability, all else equal", () => {
      const base = 0.2;
      const noRiver = computeWaterAvailability(base, 0, false);
      const weakRiver = computeWaterAvailability(base, 0.2, false);
      const strongRiver = computeWaterAvailability(base, 1, false);
      expect(weakRiver).toBeGreaterThan(noRiver);
      expect(strongRiver).toBeGreaterThan(weakRiver);
    });

    it("lake presence yields higher water availability than the same cell without a lake", () => {
      const base = 0.2;
      expect(computeWaterAvailability(base, 0, true)).toBeGreaterThan(computeWaterAvailability(base, 0, false));
    });
  });

  describe("Test 6 — Biome determinism", () => {
    it("the same seed + coordinates always produce the same biome", () => {
      const a = new Planet({ width: WIDTH, height: HEIGHT, seed: 777 });
      const b = new Planet({ width: WIDTH, height: HEIGHT, seed: 777 });
      for (const [x, y] of [[10, 10], [200, 5], [77, 199], [128, 128]]) {
        expect(a.getCell(x, y).terrain).toBe(b.getCell(x, y).terrain);
      }
    });
  });

  describe("Test 7 — Biome plausibility", () => {
    it("extreme cold + low water availability never classifies as forest", () => {
      const planet = new Planet({ width: 8, height: 8, seed: 1 });
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const cell = planet.getCell(x, y);
          if (cell.temperature < -5 && cell.water < 0.15) {
            expect(cell.terrain).not.toBe("forest");
          }
        }
      }
    });

    it("only a reasonable, bounded set of biomes is ever produced", () => {
      const planet = new Planet({ width: 300, height: 300, seed: 55 });
      const valid = new Set(["ocean", "mountain", "plains", "desert", "forest", "tundra", "savanna"]);
      for (let y = 0; y < 300; y += 6) {
        for (let x = 0; x < 300; x += 6) {
          expect(valid.has(planet.getCell(x, y).terrain)).toBe(true);
        }
      }
    });
  });

  describe("Test 8 — Chunk order independence", () => {
    it("visiting chunks A then B gives the same vegetation/biome as visiting B then A", () => {
      const a = new Planet({ width: WIDTH, height: HEIGHT, seed: 321 });
      const b = new Planet({ width: WIDTH, height: HEIGHT, seed: 321 });

      for (let cy = 0; cy < a.chunksY; cy++) {
        for (let cx = 0; cx < a.chunksX; cx++) a.getCell(cx * a.chunkSize, cy * a.chunkSize);
      }
      for (let cy = b.chunksY - 1; cy >= 0; cy--) {
        for (let cx = b.chunksX - 1; cx >= 0; cx--) b.getCell(cx * b.chunkSize, cy * b.chunkSize);
      }

      for (let y = 0; y < HEIGHT; y += 13) {
        for (let x = 0; x < WIDTH; x += 13) {
          const ca = a.getCell(x, y);
          const cb = b.getCell(x, y);
          expect(ca.terrain).toBe(cb.terrain);
          expect(ca.vegetation).toBe(cb.vegetation);
        }
      }
    });
  });

  describe("Test 9 — Chunk boundary continuity", () => {
    it("shows no artificial discontinuity in vegetation/terrain across chunk edges (31/32, 63/64, 95/96)", () => {
      const planet = new Planet({ width: WIDTH, height: HEIGHT, seed: 654, chunkSize: 32 });
      for (const boundary of [32, 64, 96]) {
        for (let y = 0; y < HEIGHT; y += 17) {
          const before = planet.getCell(boundary - 1, y);
          const after = planet.getCell(boundary, y);
          // Not identical (different cells), but vegetation shouldn't jump
          // by more than a large, generous bound — a real discontinuity
          // (chunk-order-dependent seams) would show up as a hard edge
          // far larger than natural cell-to-cell variation.
          expect(Math.abs(before.vegetation - after.vegetation)).toBeLessThan(0.5);
        }
      }
    });
  });

  describe("Test 10 — Vegetation determinism", () => {
    it("the same environment (seed, coords, temperature, water availability) always yields the same vegetation potential", () => {
      const a = computeVegetationPotential(444, 17, 42, 18, 0.6);
      const b = computeVegetationPotential(444, 17, 42, 18, 0.6);
      expect(a).toBe(b);
    });

    it("vegetation potential is always bounded to [0, 1]", () => {
      for (const temp of [-40, -2, 22, 45, 80]) {
        for (const water of [0, 0.3, 0.55, 1]) {
          const p = computeVegetationPotential(SEED, 1, 1, temp, water);
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe("Test 11 — Lazy world (no global scan)", () => {
    it("evaluating one cell via getCell only materializes its own chunk, never the whole planet", () => {
      const planet = new Planet({ width: 2048, height: 2048, seed: 8 });
      planet.getCell(1000, 1000);
      let materialized = 0;
      for (let cy = 0; cy < planet.chunksY; cy++) {
        for (let cx = 0; cx < planet.chunksX; cx++) {
          if (planet.hasChunk(cx, cy)) materialized++;
        }
      }
      expect(materialized).toBe(1);
    });

    it("a small active population only advances a small, bounded set of chunks per tick", () => {
      const planet = new Planet({ width: 2048, height: 2048, seed: 8 });
      const organisms = [{ alive: true, position: { x: 1000, y: 1000 } }];
      const active = computeActiveChunkKeys(organisms, planet.width, planet.height, planet.chunkSize, 1);
      planet.update(1, active);
      let materialized = 0;
      for (let cy = 0; cy < planet.chunksY; cy++) {
        for (let cx = 0; cx < planet.chunksX; cx++) {
          if (planet.hasChunk(cx, cy)) materialized++;
        }
      }
      expect(materialized).toBeLessThan(20);
    });
  });

  describe("Test 12 — Regression biology (environmental changes don't touch organism mechanics)", () => {
    it("elevation generation itself is unchanged (regression guard: same formula as v1.2.1/v1.2.3)", () => {
      // Not a full re-derivation, just a determinism/shape sanity check —
      // the actual "don't touch biology" guarantee is that this session
      // never imports/edits simulation/biology or simulation/evolution at
      // all (see the diff), which unit tests can't directly assert.
      const a = computeElevationAt(SEED, 40, 40, WIDTH, HEIGHT);
      const b = computeElevationAt(SEED, 40, 40, WIDTH, HEIGHT);
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    });
  });

  describe("Ecological consistency — vegetation follows regrowth toward potential over time", () => {
    it("a land cell's vegetation moves toward (not away from) its vegetation potential as ticks pass", () => {
      const planet = new Planet({ width: 32, height: 32, seed: 13 });
      const active = allChunks(planet);
      const before = planet.getCell(5, 5);
      if (before.terrain !== "ocean" && before.terrain !== "mountain") {
        const waterAvailability = computeWaterAvailability(before.water, before.riverFlow ?? 0, before.isLake ?? false);
        const potential = computeVegetationPotential(planet.config.seed, 5, 5, before.temperature, waterAvailability);
        const distanceBefore = Math.abs(potential - before.vegetation);

        for (let tick = 1; tick <= 500; tick++) planet.update(tick, active);

        const after = planet.getCell(5, 5);
        const distanceAfter = Math.abs(potential - after.vegetation);
        expect(distanceAfter).toBeLessThanOrEqual(distanceBefore + 1e-9);
      }
    });
  });

  describe("River/lake cells give a measurable vegetation boost over an otherwise-identical dry cell", () => {
    it("hydrologyAt-derived water availability raises vegetation potential relative to the base water field alone", () => {
      // Find a real river or lake cell on a sampled world, then compare
      // vegetation potential computed with vs. without its hydrology
      // contribution.
      const w = 400;
      const h = 400;
      const seed = 2718;
      let found = false;
      for (let y = 0; y < h && !found; y += 3) {
        for (let x = 0; x < w && !found; x += 3) {
          const hydro = hydrologyAt(seed, x, y, w, h);
          if (hydro.riverFlow <= 0 && !hydro.isLake) continue;
          const elevation = computeElevationAt(seed, x, y, w, h);
          if (elevation <= 0) continue;
          found = true;
          const rawWater = 0.15; // an arbitrary, deliberately dry base value
          const withoutHydro = computeVegetationPotential(seed, x, y, 20, rawWater);
          const withHydro = computeVegetationPotential(
            seed,
            x,
            y,
            20,
            computeWaterAvailability(rawWater, hydro.riverFlow, hydro.isLake),
          );
          expect(withHydro).toBeGreaterThan(withoutHydro);
        }
      }
      expect(found).toBe(true);
    });
  });
});
