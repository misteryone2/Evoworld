import { describe, it, expect } from "vitest";
import { Planet } from "../simulation/planet/planet";
import { createOrganism } from "../simulation/biology/organism";
import { buildOrganismBuckets } from "../simulation/ecology/spatialIndex";
import { computeSensoryChannels, recordFoodMemory, recordDangerMemory, BEHAVIOR_BUCKET_SIZE } from "../simulation/ecology/behavior";
import type { Genome } from "../types";

const baseGenome: Genome = {
  size: 1,
  speed: 1,
  metabolism: 1,
  vision: 10, // socialRadius = max(2, vision) = 10, generous for these tests
  fertility: 0.5,
  lifespan: 500,
  carnivory: 0,
  preferredTemperature: 20,
  temperatureTolerance: 20,
  preferredWater: 0.4,
  waterTolerance: 0.5,
  evasion: 0.2,
  huntingSkill: 0.2,
};

function sense(organisms: ReturnType<typeof createOrganism>[], planet: Planet, self: ReturnType<typeof createOrganism>, tick = 0) {
  const buckets = buildOrganismBuckets(organisms, BEHAVIOR_BUCKET_SIZE);
  return computeSensoryChannels(self, planet, buckets, BEHAVIOR_BUCKET_SIZE, tick);
}

describe("computeSensoryChannels — energy", () => {
  it("reports energy normalized to roughly [0, 1]", () => {
    const planet = new Planet({ width: 40, height: 40, seed: 1 });
    const self = createOrganism(1, 1, 20, 20, { ...baseGenome }, 75);
    const result = sense([self], planet, self);
    expect(result.energyNorm).toBeCloseTo(0.5, 1); // 75 / MAX_ENERGY(150)
  });
});

describe("computeSensoryChannels — flocking", () => {
  it("flock channel points toward a same-species neighbor at moderate distance (cohesion)", () => {
    const planet = new Planet({ width: 40, height: 40, seed: 1 });
    const self = createOrganism(1, 1, 20, 20, { ...baseGenome });
    const neighbor = createOrganism(2, 1, 20, 24, { ...baseGenome }); // 4 cells away, above separation radius
    const result = sense([self, neighbor], planet, self);
    expect(result.flockY).toBeGreaterThan(0);
  });

  it("flock channel points away from a same-species neighbor that is too close (separation)", () => {
    const planet = new Planet({ width: 40, height: 40, seed: 1 });
    const self = createOrganism(1, 1, 20, 20, { ...baseGenome });
    const neighbor = createOrganism(2, 1, 20, 20.5, { ...baseGenome }); // well within separation radius
    const result = sense([self, neighbor], planet, self);
    expect(result.flockY).toBeLessThan(0);
  });

  it("is all-zero with no neighbors at all", () => {
    const planet = new Planet({ width: 40, height: 40, seed: 1 });
    const self = createOrganism(1, 1, 20, 20, { ...baseGenome });
    const result = sense([self], planet, self);
    expect(result.flockX).toBe(0);
    expect(result.flockY).toBe(0);
    expect(result.fearX).toBe(0);
    expect(result.huntX).toBe(0);
    expect(result.territoryX).toBe(0);
  });
});

describe("computeSensoryChannels — fear", () => {
  it("fear channel points away from a nearby organism that could hunt it (higher carnivory, above threshold)", () => {
    const planet = new Planet({ width: 40, height: 40, seed: 1 });
    const prey = createOrganism(1, 1, 20, 20, { ...baseGenome, carnivory: 0 });
    const predator = createOrganism(2, 2, 20, 24, { ...baseGenome, carnivory: 0.8 });
    const result = sense([prey, predator], planet, prey);
    expect(result.fearY).toBeLessThan(0);
  });

  it("stays zero for a same-or-lower-carnivory organism", () => {
    const planet = new Planet({ width: 40, height: 40, seed: 1 });
    // High energy (well-fed) so self is not itself an eligible hunter here —
    // isolates the fear check from the hunt channel firing on the same pair.
    const self = createOrganism(1, 1, 20, 20, { ...baseGenome, carnivory: 0.5 }, 149);
    const other = createOrganism(2, 2, 20, 24, { ...baseGenome, carnivory: 0.3 });
    const result = sense([self, other], planet, self);
    expect(result.fearX).toBe(0);
    expect(result.fearY).toBe(0);
  });
});

describe("computeSensoryChannels — hunting", () => {
  it("hunt channel points toward nearby weaker prey for a hungry, sufficiently carnivorous organism", () => {
    const planet = new Planet({ width: 40, height: 40, seed: 1 });
    const predator = createOrganism(1, 1, 20, 20, { ...baseGenome, carnivory: 0.8 }, 50); // low energy = hungry
    const prey = createOrganism(2, 2, 20, 24, { ...baseGenome, carnivory: 0.1 });
    const result = sense([predator, prey], planet, predator);
    expect(result.huntY).toBeGreaterThan(0);
  });

  it("stays zero for a well-fed carnivore (energy above hunger threshold)", () => {
    const planet = new Planet({ width: 40, height: 40, seed: 1 });
    const predator = createOrganism(1, 1, 20, 20, { ...baseGenome, carnivory: 0.8 }, 149);
    const prey = createOrganism(2, 2, 20, 24, { ...baseGenome, carnivory: 0.1 });
    const result = sense([predator, prey], planet, predator);
    expect(result.huntX).toBe(0);
    expect(result.huntY).toBe(0);
  });

  it("stays zero for an herbivore (carnivory below threshold) even if hungry", () => {
    const planet = new Planet({ width: 40, height: 40, seed: 1 });
    const herbivore = createOrganism(1, 1, 20, 20, { ...baseGenome, carnivory: 0 }, 30);
    const other = createOrganism(2, 2, 20, 24, { ...baseGenome, carnivory: 0 });
    const result = sense([herbivore, other], planet, herbivore);
    expect(result.huntX).toBe(0);
    expect(result.huntY).toBe(0);
  });
});

describe("computeSensoryChannels — territoriality", () => {
  it("territory channel repels an intruder away from a same-species neighbor's defended home", () => {
    const planet = new Planet({ width: 40, height: 40, seed: 1 });
    const defender = createOrganism(1, 1, 20, 20, { ...baseGenome });
    const intruder = createOrganism(2, 1, 23, 20, { ...baseGenome });
    intruder.home = { x: 0, y: 0 }; // intruder's home is far away, so it's not defending here
    const result = sense([defender, intruder], planet, intruder);
    expect(result.territoryX).toBeGreaterThan(0); // intruder at x=23 relative to defender's home at x=20: pushed further away (+x)
  });
});

describe("computeSensoryChannels — spatial memory", () => {
  it("memory channel attracts toward a fresh food memory", () => {
    const planet = new Planet({ width: 40, height: 40, seed: 1 });
    const self = createOrganism(1, 1, 20, 20, { ...baseGenome });
    self.memory = { x: 20, y: 25, tick: 100, kind: "food" };
    const result = sense([self], planet, self, 105);
    expect(result.memoryY).toBeGreaterThan(0);
  });

  it("memory channel repels from a fresh danger memory", () => {
    const planet = new Planet({ width: 40, height: 40, seed: 1 });
    const self = createOrganism(1, 1, 20, 20, { ...baseGenome });
    self.memory = { x: 20, y: 25, tick: 100, kind: "danger" };
    const result = sense([self], planet, self, 105);
    expect(result.memoryY).toBeLessThan(0);
  });

  it("clears and ignores memory once it exceeds the decay window", () => {
    const planet = new Planet({ width: 40, height: 40, seed: 1 });
    const self = createOrganism(1, 1, 20, 20, { ...baseGenome });
    self.memory = { x: 20, y: 25, tick: 0, kind: "food" };
    const result = sense([self], planet, self, 10000); // far beyond MEMORY_DECAY_TICKS
    expect(result.memoryX).toBe(0);
    expect(result.memoryY).toBe(0);
    expect(self.memory).toBeNull();
  });
});

describe("recordFoodMemory / recordDangerMemory", () => {
  it("records food memory only when vegetation clears the threshold", () => {
    const self = createOrganism(1, 1, 5, 5, { ...baseGenome });
    recordFoodMemory(self, 0.2, 50); // below threshold
    expect(self.memory).toBeNull();
    recordFoodMemory(self, 0.9, 60); // above threshold
    expect(self.memory).toEqual({ x: 5, y: 5, tick: 60, kind: "food" });
  });

  it("danger memory always overwrites, regardless of prior memory", () => {
    const self = createOrganism(1, 1, 5, 5, { ...baseGenome });
    recordFoodMemory(self, 0.9, 60);
    recordDangerMemory(self, 61);
    expect(self.memory).toEqual({ x: 5, y: 5, tick: 61, kind: "danger" });
  });
});
