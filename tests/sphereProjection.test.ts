import { describe, it, expect } from "vitest";
import { projectToSphere, elevationDisplacement, sampleViewportChannelBilinear, sampleViewportTerrainIsOcean, sampleViewportElevationNearest, PLANET_HEIGHT_SCALE, OCEAN_DEPTH_SCALE } from "../lib/sphereProjection";

const RADIUS = 5;
const WIDTH = 100;
const HEIGHT = 60;

function magnitude(p: { x: number; y: number; z: number }): number {
  return Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
}

describe("projectToSphere", () => {
  it("always returns a point at exactly the given radius from the origin", () => {
    const samples: [number, number][] = [
      [0, 0],
      [50, 30],
      [99, 59],
      [25, 15],
      [0, 30],
      [50, 0],
    ];
    for (const [gx, gy] of samples) {
      const p = projectToSphere(gx, gy, WIDTH, HEIGHT, RADIUS);
      expect(magnitude(p)).toBeCloseTo(RADIUS, 6);
    }
  });

  it("the returned normal is a unit vector", () => {
    const p = projectToSphere(37, 12, WIDTH, HEIGHT, RADIUS);
    const normalMag = Math.sqrt(p.normalX ** 2 + p.normalY ** 2 + p.normalZ ** 2);
    expect(normalMag).toBeCloseTo(1, 6);
  });

  it("position equals normal scaled by radius", () => {
    const p = projectToSphere(10, 40, WIDTH, HEIGHT, RADIUS);
    expect(p.x).toBeCloseTo(p.normalX * RADIUS, 6);
    expect(p.y).toBeCloseTo(p.normalY * RADIUS, 6);
    expect(p.z).toBeCloseTo(p.normalZ * RADIUS, 6);
  });

  it("gridY = 0 always maps to the north pole (y = radius), regardless of gridX", () => {
    const a = projectToSphere(0, 0, WIDTH, HEIGHT, RADIUS);
    const b = projectToSphere(80, 0, WIDTH, HEIGHT, RADIUS);
    expect(a.y).toBeCloseTo(RADIUS, 6);
    expect(b.y).toBeCloseTo(RADIUS, 6);
  });

  it("gridY at the equator (half of gridHeight) has y close to 0", () => {
    const p = projectToSphere(20, HEIGHT / 2, WIDTH, HEIGHT, RADIUS);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it("wraps out-of-range grid coordinates the same as in-range equivalents", () => {
    const inRange = projectToSphere(10, 5, WIDTH, HEIGHT, RADIUS);
    const wrapped = projectToSphere(10 + WIDTH, 5 + HEIGHT, WIDTH, HEIGHT, RADIUS);
    expect(wrapped.x).toBeCloseTo(inRange.x, 6);
    expect(wrapped.y).toBeCloseTo(inRange.y, 6);
    expect(wrapped.z).toBeCloseTo(inRange.z, 6);
  });

  it("varying gridX at a fixed non-polar gridY changes the position", () => {
    const a = projectToSphere(0, HEIGHT / 2, WIDTH, HEIGHT, RADIUS);
    const b = projectToSphere(WIDTH / 4, HEIGHT / 2, WIDTH, HEIGHT, RADIUS);
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    expect(Math.sqrt(dx * dx + dz * dz)).toBeGreaterThan(0.1);
  });
});

/**
 * v1.2.2 — Real 3D Surface: elevation → displacement, and viewport
 * heightmap sampling used to drive it.
 */
describe("elevationDisplacement", () => {
  it("stays finite and bounded for the full valid elevation range, land and ocean", () => {
    for (let e = 0; e <= 1; e += 0.1) {
      for (const isOcean of [false, true]) {
        const d = elevationDisplacement(e, isOcean);
        expect(Number.isFinite(d)).toBe(true);
        expect(Math.abs(d)).toBeLessThanOrEqual(Math.max(PLANET_HEIGHT_SCALE, OCEAN_DEPTH_SCALE));
      }
    }
  });

  it("never produces NaN or Infinity even for out-of-range or non-finite input", () => {
    for (const e of [-5, 2, NaN, Infinity, -Infinity]) {
      const dLand = elevationDisplacement(e, false);
      const dOcean = elevationDisplacement(e, true);
      expect(Number.isFinite(dLand)).toBe(true);
      expect(Number.isFinite(dOcean)).toBe(true);
    }
  });

  it("higher land elevation produces a larger (or equal) outward displacement", () => {
    const low = elevationDisplacement(0.2, false);
    const high = elevationDisplacement(0.9, false);
    expect(high).toBeGreaterThan(low);
  });

  it("identical elevation and ocean-flag always produce identical displacement", () => {
    expect(elevationDisplacement(0.6, false)).toBe(elevationDisplacement(0.6, false));
    expect(elevationDisplacement(0.6, true)).toBe(elevationDisplacement(0.6, true));
  });

  it("ocean recesses inward (negative) while land at the same elevation rises outward (non-negative)", () => {
    expect(elevationDisplacement(0.5, true)).toBeLessThan(0);
    expect(elevationDisplacement(0.5, false)).toBeGreaterThanOrEqual(0);
  });

  it("radius = PLANET_RADIUS + displacement never collapses or inverts the sphere (radius stays positive and close to PLANET_RADIUS)", () => {
    const RADIUS = 5;
    for (let e = 0; e <= 1; e += 0.25) {
      for (const isOcean of [false, true]) {
        const radius = RADIUS + elevationDisplacement(e, isOcean);
        expect(radius).toBeGreaterThan(0);
        expect(Math.abs(radius - RADIUS)).toBeLessThan(RADIUS * 0.5); // relief stays small relative to the planet, per the brief
      }
    }
  });
});

describe("sampleViewportChannelBilinear / sampleViewportTerrainIsOcean / sampleViewportElevationNearest", () => {
  const texWidth = 8;
  const texHeight = 8;
  const cellsWidth = 800;
  const cellsHeight = 800;
  const originX = 0;
  const originY = 0;
  const elevationChannel = new Float32Array(texWidth * texHeight);
  for (let i = 0; i < elevationChannel.length; i++) elevationChannel[i] = i / elevationChannel.length;
  const terrainChannel = new Uint8Array(texWidth * texHeight); // all 0 == ocean code
  terrainChannel[10] = 1; // one non-ocean texel

  it("a given world coordinate always maps to a coherent, in-range sample", () => {
    const v = sampleViewportChannelBilinear(123, 456, elevationChannel, originX, originY, cellsWidth, cellsHeight, texWidth, texHeight);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it("bilinear sampling is deterministic for the same coordinate", () => {
    const a = sampleViewportChannelBilinear(300, 300, elevationChannel, originX, originY, cellsWidth, cellsHeight, texWidth, texHeight);
    const b = sampleViewportChannelBilinear(300, 300, elevationChannel, originX, originY, cellsWidth, cellsHeight, texWidth, texHeight);
    expect(a).toBe(b);
  });

  it("terrain-is-ocean lookup is deterministic and boolean", () => {
    const a = sampleViewportTerrainIsOcean(50, 50, terrainChannel, originX, originY, cellsWidth, cellsHeight, texWidth, texHeight);
    const b = sampleViewportTerrainIsOcean(50, 50, terrainChannel, originX, originY, cellsWidth, cellsHeight, texWidth, texHeight);
    expect(typeof a).toBe("boolean");
    expect(a).toBe(b);
  });

  it("nearest elevation sampling is deterministic and in range", () => {
    const a = sampleViewportElevationNearest(400, 400, elevationChannel, originX, originY, cellsWidth, cellsHeight, texWidth, texHeight);
    const b = sampleViewportElevationNearest(400, 400, elevationChannel, originX, originY, cellsWidth, cellsHeight, texWidth, texHeight);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
  });

  it("wraps world coordinates outside the viewport's cell range the same as their in-range equivalents (torus)", () => {
    const inRange = sampleViewportChannelBilinear(50, 50, elevationChannel, originX, originY, cellsWidth, cellsHeight, texWidth, texHeight);
    const wrapped = sampleViewportChannelBilinear(50 + cellsWidth, 50 + cellsHeight, elevationChannel, originX, originY, cellsWidth, cellsHeight, texWidth, texHeight);
    expect(wrapped).toBeCloseTo(inRange, 6);
  });
});
