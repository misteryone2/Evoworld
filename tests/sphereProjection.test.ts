import { describe, it, expect } from "vitest";
import { projectToSphere } from "../lib/sphereProjection";

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
