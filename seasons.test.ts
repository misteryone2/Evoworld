import { describe, it, expect } from "vitest";
import { Planet } from "../simulation/planet/planet";
import { World } from "../simulation/core/world";
import { buildViewportFrame } from "../simulation/core/viewportFrame";
import {
  SEASONAL_TEMPERATURE_AMPLITUDE,
  annualMeanTemperature,
  seasonalTemperatureOffset,
  yearPhase,
} from "../simulation/planet/seasons";
import { applySeasonalTintRGB, terrainColorRGB } from "../lib/terrainColor";
import { TICKS_PER_YEAR } from "../simulation/core/constants";

const H = 512;
const MID_ESTATE = Math.round(TICKS_PER_YEAR * 0.375);
const MID_INVERNO = Math.round(TICKS_PER_YEAR * 0.875);

describe("v1.3.0 — seasonal temperature model", () => {
  it("yearPhase stays in [0, 1) and repeats every year", () => {
    for (const tick of [0, 1, 99, 399, 400, 401, 12345]) {
      const p = yearPhase(tick);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
      expect(yearPhase(tick + TICKS_PER_YEAR)).toBeCloseTo(p, 10);
    }
  });

  it("the equator has no temperature seasons", () => {
    for (const tick of [0, 50, MID_ESTATE, MID_INVERNO, 300]) {
      expect(Math.abs(seasonalTemperatureOffset(H / 2, H, tick))).toBeLessThan(1e-9);
    }
  });

  it("the northern hemisphere is warmest in the middle of summer and coldest in the middle of winter", () => {
    const y = H * 0.25; // mid-latitude, north
    const summer = seasonalTemperatureOffset(y, H, MID_ESTATE);
    const winter = seasonalTemperatureOffset(y, H, MID_INVERNO);
    expect(summer).toBeGreaterThan(0);
    expect(winter).toBeLessThan(0);
    expect(summer).toBeCloseTo(-winter, 6);
  });

  it("the southern hemisphere is the mirror image of the northern one", () => {
    const north = seasonalTemperatureOffset(H * 0.25, H, MID_ESTATE);
    const south = seasonalTemperatureOffset(H * 0.75, H, MID_ESTATE);
    expect(south).toBeCloseTo(-north, 6);
  });

  it("the swing grows with latitude and reaches the full amplitude at the poles", () => {
    const mid = Math.abs(seasonalTemperatureOffset(H * 0.25, H, MID_ESTATE));
    const nearPole = Math.abs(seasonalTemperatureOffset(1, H, MID_ESTATE));
    expect(nearPole).toBeGreaterThan(mid);
    expect(nearPole).toBeLessThanOrEqual(SEASONAL_TEMPERATURE_AMPLITUDE + 1e-9);
    expect(nearPole).toBeGreaterThan(SEASONAL_TEMPERATURE_AMPLITUDE * 0.95);
  });
});

describe("v1.3.0 — Planet applies the seasonal temperature", () => {
  function findLandCell(planet: Planet, predicate: (c: ReturnType<Planet["getCell"]>) => boolean, rows: [number, number]) {
    for (let y = rows[0]; y < rows[1]; y++) {
      for (let x = 0; x < planet.width; x++) {
        const c = planet.getCell(x, y);
        if (c.terrain !== "ocean" && c.terrain !== "mountain" && predicate(c)) return { x, y };
      }
    }
    return null;
  }

  function keysFor(planet: Planet, x: number, y: number): Set<string> {
    return new Set([`${Math.floor(x / planet.chunkSize)},${Math.floor(y / planet.chunkSize)}`]);
  }

  it("a high-latitude land cell is warmer in summer than in winter by the expected swing", () => {
    const planet = new Planet({ width: 256, height: 256, seed: 7 } as never);
    const spot = findLandCell(planet, () => true, [10, 60]);
    expect(spot).not.toBeNull();
    const { x, y } = spot!;
    const keys = keysFor(planet, x, y);
    // first call only registers the chunk's activity; later ticks step it
    planet.update(MID_ESTATE - 1, keys);
    planet.update(MID_ESTATE, keys);
    const summer = planet.getCell(x, y).temperature;
    planet.update(MID_INVERNO - 1, keys);
    planet.update(MID_INVERNO, keys);
    const winter = planet.getCell(x, y).temperature;
    const expectedSwing = 2 * Math.abs(seasonalTemperatureOffset(y, 256, MID_ESTATE));
    expect(summer - winter).toBeGreaterThan(expectedSwing * 0.99);
    expect(summer - winter).toBeLessThan(expectedSwing * 1.01);
  });

  it("a chunk that was dormant for years lands on the same temperature as one simulated every tick", () => {
    const a = new Planet({ width: 256, height: 256, seed: 7 } as never);
    const b = new Planet({ width: 256, height: 256, seed: 7 } as never);
    const spot = findLandCell(a, () => true, [10, 60])!;
    const keys = keysFor(a, spot.x, spot.y);
    b.getCell(spot.x, spot.y);
    const target = TICKS_PER_YEAR * 3 + 123;
    for (let t = 1; t <= target; t++) a.update(t, keys);
    b.update(1, keys);
    b.update(target, keys); // one long jump = the dormant catch-up path
    expect(b.getCell(spot.x, spot.y).temperature).toBeCloseTo(a.getCell(spot.x, spot.y).temperature, 6);
  });

  it("a tundra cell stays tundra through the whole year (the seasons do not flip the biome label)", () => {
    const planet = new Planet({ width: 256, height: 256, seed: 7 } as never);
    const spot = findLandCell(planet, (c) => c.terrain === "tundra", [0, 40]);
    expect(spot).not.toBeNull();
    const keys = keysFor(planet, spot!.x, spot!.y);
    let tick = 0;
    const seen = new Set<string>();
    for (let step = 0; step < 8; step++) {
      tick += Math.round(TICKS_PER_YEAR / 8);
      planet.update(tick, keys);
      seen.add(planet.getCell(spot!.x, spot!.y).terrain);
    }
    expect(Array.from(seen)).toEqual(["tundra"]);
  });
});

describe("v1.3.0 — ViewportFrame.temperature", () => {
  const request = { centerX: 256, centerY: 256, radiusX: 256, radiusY: 256, maxWidth: 64, maxHeight: 32 };

  it("has one value per texel and reports the planet height", () => {
    const world = new World({ width: 512, height: 512, seed: 1 }, 20);
    const frame = buildViewportFrame(world, request);
    expect(frame.temperature).toBeInstanceOf(Float32Array);
    expect(frame.temperature.length).toBe(frame.texWidth * frame.texHeight);
    expect(frame.planetHeight).toBe(512);
  });

  it("a northern texel is warmer in summer than in winter, and a southern one the opposite", () => {
    const world = new World({ width: 512, height: 512, seed: 1 }, 20);
    world.tick = MID_ESTATE;
    const summer = buildViewportFrame(world, request);
    world.tick = MID_INVERNO;
    const winter = buildViewportFrame(world, request);
    const northRow = 4;
    const southRow = summer.texHeight - 5;
    const col = 10;
    const iN = northRow * summer.texWidth + col;
    const iS = southRow * summer.texWidth + col;
    expect(summer.temperature[iN]).toBeGreaterThan(winter.temperature[iN]);
    expect(summer.temperature[iS]).toBeLessThan(winter.temperature[iS]);
  });

  it("matches the stateless model for a given texel", () => {
    const world = new World({ width: 512, height: 512, seed: 1 }, 20);
    world.tick = 123;
    const frame = buildViewportFrame(world, request);
    const ty = 8;
    const tx = 20;
    const wx = Math.floor(frame.originX + ((tx + 0.5) / frame.texWidth) * frame.cellsWidth);
    const wy = Math.floor(frame.originY + ((ty + 0.5) / frame.texHeight) * frame.cellsHeight);
    const elevation = frame.elevation[ty * frame.texWidth + tx];
    const expected = annualMeanTemperature(1, wx, wy, 512, elevation) + seasonalTemperatureOffset(wy, 512, 123);
    expect(frame.temperature[ty * frame.texWidth + tx]).toBeCloseTo(expected, 3);
  });
});

describe("v1.3.0 — seasonal tint", () => {
  const plains = terrainColorRGB(1, 0.7);
  const ocean = terrainColorRGB(0, 0);

  it("leaves a warm land cell outside autumn untouched", () => {
    expect(applySeasonalTintRGB(plains, 1, 0.7, 18, 0.375)).toEqual(plains);
  });

  it("covers a freezing land cell with snow (lighter than its base color)", () => {
    const snowy = applySeasonalTintRGB(plains, 1, 0.7, -8, 0.875);
    expect(snowy[0] + snowy[1] + snowy[2]).toBeGreaterThan(plains[0] + plains[1] + plains[2]);
  });

  it("freezes cold ocean but not warm ocean", () => {
    expect(applySeasonalTintRGB(ocean, 0, 0, 15, 0.5)).toEqual(ocean);
    const ice = applySeasonalTintRGB(ocean, 0, 0, -10, 0.875);
    expect(ice[0] + ice[1] + ice[2]).toBeGreaterThan(ocean[0] + ocean[1] + ocean[2]);
  });

  it("turns vegetated land toward autumn tones only around autumn", () => {
    const autumn = applySeasonalTintRGB(plains, 1, 0.7, 14, 0.625);
    const spring = applySeasonalTintRGB(plains, 1, 0.7, 14, 0.125);
    expect(autumn[0]).toBeGreaterThan(plains[0]);
    expect(spring).toEqual(plains);
  });

  it("never tints desert or mountain terrain with autumn colors", () => {
    const desert = terrainColorRGB(2, 0.1);
    expect(applySeasonalTintRGB(desert, 2, 0.1, 25, 0.625)).toEqual(desert);
  });
});
