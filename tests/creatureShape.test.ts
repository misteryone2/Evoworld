import { describe, it, expect } from "vitest";
import { computeCreatureShape } from "../lib/creatureShape";
import { TRAIT_RANGES } from "../simulation/biology/genome";

const midTraits = {
  speed: (TRAIT_RANGES.speed.min + TRAIT_RANGES.speed.max) / 2,
  carnivory: (TRAIT_RANGES.carnivory.min + TRAIT_RANGES.carnivory.max) / 2,
  vision: (TRAIT_RANGES.vision.min + TRAIT_RANGES.vision.max) / 2,
  evasion: (TRAIT_RANGES.evasion.min + TRAIT_RANGES.evasion.max) / 2,
  huntingSkill: (TRAIT_RANGES.huntingSkill.min + TRAIT_RANGES.huntingSkill.max) / 2,
};

describe("computeCreatureShape", () => {
  it("maps each trait's minimum value to 0", () => {
    const shape = computeCreatureShape({
      speed: TRAIT_RANGES.speed.min,
      carnivory: TRAIT_RANGES.carnivory.min,
      vision: TRAIT_RANGES.vision.min,
      evasion: TRAIT_RANGES.evasion.min,
      huntingSkill: TRAIT_RANGES.huntingSkill.min,
    });
    expect(shape.elongation).toBe(0);
    expect(shape.aggression).toBe(0);
    expect(shape.eyeSize).toBe(0);
    expect(shape.spikiness).toBe(0);
    expect(shape.jawSize).toBe(0);
  });

  it("maps each trait's maximum value to 1", () => {
    const shape = computeCreatureShape({
      speed: TRAIT_RANGES.speed.max,
      carnivory: TRAIT_RANGES.carnivory.max,
      vision: TRAIT_RANGES.vision.max,
      evasion: TRAIT_RANGES.evasion.max,
      huntingSkill: TRAIT_RANGES.huntingSkill.max,
    });
    expect(shape.elongation).toBe(1);
    expect(shape.aggression).toBe(1);
    expect(shape.eyeSize).toBe(1);
    expect(shape.spikiness).toBe(1);
    expect(shape.jawSize).toBe(1);
  });

  it("maps a mid-range value to approximately 0.5", () => {
    const shape = computeCreatureShape(midTraits);
    expect(shape.elongation).toBeCloseTo(0.5, 5);
    expect(shape.aggression).toBeCloseTo(0.5, 5);
    expect(shape.eyeSize).toBeCloseTo(0.5, 5);
    expect(shape.spikiness).toBeCloseTo(0.5, 5);
    expect(shape.jawSize).toBeCloseTo(0.5, 5);
  });

  it("clamps values below the trait's minimum to 0", () => {
    const shape = computeCreatureShape({ ...midTraits, speed: TRAIT_RANGES.speed.min - 10 });
    expect(shape.elongation).toBe(0);
  });

  it("clamps values above the trait's maximum to 1", () => {
    const shape = computeCreatureShape({ ...midTraits, carnivory: TRAIT_RANGES.carnivory.max + 10 });
    expect(shape.aggression).toBe(1);
  });
});
