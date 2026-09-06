import { describe, it, expect } from "vitest";
import { World } from "../simulation/core/world";
import { buildViewportFrame } from "../simulation/core/viewportFrame";

/**
 * v1.2.2 — Real 3D Surface. Verifies the new ViewportFrame.elevation
 * channel: existence, bounded size (viewport-resolution-dependent, not
 * world-size-dependent), valid range, and determinism.
 */

function makeRequest(width: number, height: number, maxWidth: number, maxHeight: number) {
  return { centerX: width / 2, centerY: height / 2, radiusX: width / 2, radiusY: height / 2, maxWidth, maxHeight };
}

describe("buildViewportFrame — v1.2.2 elevation channel", () => {
  it("includes an elevation channel sized exactly texWidth * texHeight", () => {
    const world = new World({ width: 512, height: 512, seed: 1 }, 50);
    const frame = buildViewportFrame(world, makeRequest(512, 512, 64, 32));
    expect(frame.elevation).toBeInstanceOf(Float32Array);
    expect(frame.elevation.length).toBe(frame.texWidth * frame.texHeight);
  });

  it("elevation payload size depends only on the requested viewport resolution, not on world size", () => {
    const small = new World({ width: 512, height: 512, seed: 1 }, 50);
    const large = new World({ width: 2048, height: 2048, seed: 1 }, 50);
    const frameSmall = buildViewportFrame(small, makeRequest(512, 512, 64, 32));
    const frameLarge = buildViewportFrame(large, makeRequest(2048, 2048, 64, 32));
    expect(frameLarge.elevation.length).toBe(frameSmall.elevation.length);
  });

  it("every elevation value is finite and within [0,1]", () => {
    const world = new World({ width: 1024, height: 1024, seed: 7 }, 50);
    const frame = buildViewportFrame(world, makeRequest(1024, 1024, 96, 48));
    for (let i = 0; i < frame.elevation.length; i++) {
      expect(Number.isFinite(frame.elevation[i])).toBe(true);
      expect(frame.elevation[i]).toBeGreaterThanOrEqual(0);
      expect(frame.elevation[i]).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for the same world/request", () => {
    const worldA = new World({ width: 512, height: 512, seed: 42 }, 50);
    const worldB = new World({ width: 512, height: 512, seed: 42 }, 50);
    const frameA = buildViewportFrame(worldA, makeRequest(512, 512, 64, 32));
    const frameB = buildViewportFrame(worldB, makeRequest(512, 512, 64, 32));
    expect(Array.from(frameA.elevation)).toEqual(Array.from(frameB.elevation));
  });
});
