import { describe, it, expect } from "vitest";
import {
  QUALITY_LEVELS,
  QUALITY_PROFILES,
  classifyDevice,
  parsePreference,
  resolveLevel,
  shouldDowngrade,
  stepDown,
  type DeviceInfo,
} from "../lib/qualityProfile";

const desktop: DeviceInfo = { hasWebGL2: true, isTouch: false, screenWidth: 1920, deviceMemoryGB: 8, cores: 8 };

describe("v1.6.0 — quality profiles", () => {
  it("every level has a profile whose level matches its key, and lighter levels never ask for more", () => {
    for (const level of QUALITY_LEVELS) expect(QUALITY_PROFILES[level].level).toBe(level);
    const order = ["2d", "basso", "medio", "alto"] as const;
    for (let i = 1; i < order.length; i++) {
      const lighter = QUALITY_PROFILES[order[i - 1]];
      const heavier = QUALITY_PROFILES[order[i]];
      expect(lighter.maxCreatures).toBeLessThanOrEqual(heavier.maxCreatures);
      expect(lighter.terrainMaxWidth).toBeLessThanOrEqual(heavier.terrainMaxWidth);
      expect(lighter.pixelRatioCap).toBeLessThanOrEqual(heavier.pixelRatioCap);
      expect(lighter.creatureParts).toBeLessThanOrEqual(heavier.creatureParts);
      expect(lighter.defaultWorldSize).toBeLessThanOrEqual(heavier.defaultWorldSize);
      expect(lighter.workerFrameIntervalMs).toBeGreaterThanOrEqual(heavier.workerFrameIntervalMs);
      expect(lighter.speciesStatsIntervalMs).toBeGreaterThanOrEqual(heavier.speciesStatsIntervalMs);
      expect(lighter.terrainRefreshMs).toBeGreaterThanOrEqual(heavier.terrainRefreshMs);
    }
  });

  it("only the 2d level uses the canvas renderer", () => {
    expect(QUALITY_PROFILES["2d"].renderer).toBe("canvas2d");
    for (const l of ["basso", "medio", "alto"] as const) expect(QUALITY_PROFILES[l].renderer).toBe("webgl");
  });

  it("the smallest default worlds are 256 cells wide, so a weak device starts with a light simulation", () => {
    expect(QUALITY_PROFILES["2d"].defaultWorldSize).toBe(256);
    expect(QUALITY_PROFILES.basso.defaultWorldSize).toBe(256);
  });
});

describe("v1.6.0 — device classification", () => {
  it("a strong desktop gets the full level", () => {
    expect(classifyDevice(desktop)).toBe("alto");
  });

  it("no WebGL2 means the flat 2D map", () => {
    expect(classifyDevice({ ...desktop, hasWebGL2: false })).toBe("2d");
  });

  it("a software renderer (no real GPU) means the flat 2D map", () => {
    expect(classifyDevice({ ...desktop, gpuRenderer: "Google SwiftShader" })).toBe("2d");
    expect(classifyDevice({ ...desktop, gpuRenderer: "llvmpipe (LLVM 15.0.7, 256 bits)" })).toBe("2d");
    expect(classifyDevice({ ...desktop, gpuRenderer: "Microsoft Basic Render Driver" })).toBe("2d");
  });

  it("low memory or very few cores means the light level", () => {
    expect(classifyDevice({ ...desktop, deviceMemoryGB: 2 })).toBe("basso");
    expect(classifyDevice({ ...desktop, deviceMemoryGB: 1 })).toBe("basso");
    expect(classifyDevice({ ...desktop, cores: 2 })).toBe("basso");
  });

  it("a typical phone gets the light level, a very strong phone the balanced one", () => {
    const phone: DeviceInfo = { hasWebGL2: true, isTouch: true, screenWidth: 390, deviceMemoryGB: 4, cores: 8 };
    expect(classifyDevice(phone)).toBe("basso");
    expect(classifyDevice({ ...phone, deviceMemoryGB: 8, cores: 8 })).toBe("medio");
  });

  it("when the browser hides memory, it assumes less, never more", () => {
    expect(classifyDevice({ hasWebGL2: true, isTouch: true, screenWidth: 390 })).toBe("basso");
    expect(classifyDevice({ hasWebGL2: true, isTouch: false, screenWidth: 1920, cores: 16 })).toBe("medio");
  });

  it("an average laptop gets the balanced level", () => {
    expect(classifyDevice({ ...desktop, deviceMemoryGB: 4, cores: 4 })).toBe("medio");
  });
});

describe("v1.6.0 — resolving and stepping the level", () => {
  it("auto follows the detected level; an explicit choice wins", () => {
    expect(resolveLevel("auto", "basso", true)).toBe("basso");
    expect(resolveLevel("alto", "basso", true)).toBe("alto");
    expect(resolveLevel("2d", "alto", true)).toBe("2d");
  });

  it("without WebGL2 nothing but the 2D map is possible, whatever was chosen", () => {
    expect(resolveLevel("alto", "alto", false)).toBe("2d");
    expect(resolveLevel("auto", "medio", false)).toBe("2d");
  });

  it("stepDown goes alto → medio → basso and stops there", () => {
    expect(stepDown("alto")).toBe("medio");
    expect(stepDown("medio")).toBe("basso");
    expect(stepDown("basso")).toBe("basso");
    expect(stepDown("2d")).toBe("2d");
  });
});

describe("v1.6.0 — slow-device detection", () => {
  const frames = (ms: number, n = 80) => Array.from({ length: n }, () => ms);

  it("does not judge before enough frames have been measured", () => {
    expect(shouldDowngrade(frames(100, 10))).toBe(false);
  });

  it("flags a device that consistently takes more than 40 ms per frame", () => {
    expect(shouldDowngrade(frames(60))).toBe(true);
  });

  it("leaves a device alone that holds a steady 60 fps", () => {
    expect(shouldDowngrade(frames(16))).toBe(false);
  });

  it("is not fooled by a few hitches among smooth frames", () => {
    const smooth = frames(16, 70);
    expect(shouldDowngrade([...smooth, 400, 400, 400, 400, 400, 400, 400, 400, 400, 400])).toBe(false);
  });

  it("respects custom thresholds", () => {
    expect(shouldDowngrade(frames(30), { thresholdMs: 25 })).toBe(true);
    expect(shouldDowngrade(frames(30), { thresholdMs: 40 })).toBe(false);
  });
});

describe("v1.6.0 — stored preference", () => {
  it("accepts the known values and falls back to auto for anything else", () => {
    for (const v of ["auto", "2d", "basso", "medio", "alto"]) expect(parsePreference(v)).toBe(v);
    expect(parsePreference(null)).toBe("auto");
    expect(parsePreference(undefined)).toBe("auto");
    expect(parsePreference("ultra")).toBe("auto");
    expect(parsePreference("")).toBe("auto");
  });
});
