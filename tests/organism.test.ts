import { describe, it, expect } from "vitest";
import { createOrganism, isDying, upkeepCost } from "../simulation/biology/organism";
import type { Genome } from "../types";

const baseGenome: Genome = {
  size: 1,
  speed: 1,
  metabolism: 1,
  vision: 5,
  fertility: 0.5,
  lifespan: 100,
};

describe("organism lifecycle", () => {
  it("dies from starvation when energy reaches zero or below", () => {
    const organism = createOrganism(1, 1, 0, 0, baseGenome, 0);
    expect(isDying(organism)).toBe(true);
  });

  it("does not die while it has energy and has not reached lifespan", () => {
    const organism = createOrganism(1, 1, 0, 0, baseGenome, 50);
    organism.age = 10;
    expect(isDying(organism)).toBe(false);
  });

  it("dies of old age once age reaches its genome's lifespan", () => {
    const organism = createOrganism(1, 1, 0, 0, baseGenome, 100);
    organism.age = baseGenome.lifespan;
    expect(isDying(organism)).toBe(true);
  });

  it("upkeep cost is always positive and scales with size/speed/vision", () => {
    const small = createOrganism(1, 1, 0, 0, { ...baseGenome, size: 0.3, speed: 0.3, vision: 1 });
    const large = createOrganism(2, 1, 0, 0, { ...baseGenome, size: 2.5, speed: 2.5, vision: 12 });
    expect(upkeepCost(small)).toBeGreaterThan(0);
    expect(upkeepCost(large)).toBeGreaterThan(upkeepCost(small));
  });
});
