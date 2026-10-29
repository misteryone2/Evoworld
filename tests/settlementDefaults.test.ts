import { describe, it, expect } from "vitest";
import { World } from "../simulation/core/world";

const config = { width: 512, height: 512, seed: 1 } as never;

describe("v1.2.6 — settlement off by default", () => {
  it("a new World tracks no settlement state and charges no dispersal cost", () => {
    const world = new World(config, 50) as unknown as Record<string, unknown>;
    expect(world.regionEstablishment).toBeNull();
    expect(world.enableDispersalCost).toBe(false);
  });

  it("the experimental toggles can still be switched on explicitly", () => {
    const world = new World(config, 50, { enableSettlement: true, enableDispersalCost: true }) as unknown as Record<string, unknown>;
    expect(world.regionEstablishment).not.toBeNull();
    expect(world.enableDispersalCost).toBe(true);
  });

  it("a restored World resumes with the same defaults as a fresh one", () => {
    const original = new World(config, 50);
    for (let i = 0; i < 20; i++) original.step();
    const restored = World.fromSnapshot(original.toSnapshot()) as unknown as Record<string, unknown>;
    expect(restored.regionEstablishment).toBeNull();
    expect(restored.enableDispersalCost).toBe(false);
  });

  it("the founding population of a standard world survives its first 1500 ticks (seed 1)", () => {
    const world = new World(config, 300);
    for (let i = 0; i < 1500; i++) world.step();
    expect(world.organisms.length).toBeGreaterThan(20);
  }, 120_000);
});
