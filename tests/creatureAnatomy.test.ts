import { describe, it, expect } from "vitest";
import { TRAIT_RANGES } from "../simulation/biology/genome";
import { computeCreatureAnatomy, JAW_VISIBLE_THRESHOLD, MAX_SPIKES, type CreatureTraits } from "../lib/creatureAnatomy";

const lo = (k: keyof CreatureTraits) => TRAIT_RANGES[k].min;
const hi = (k: keyof CreatureTraits) => TRAIT_RANGES[k].max;
const mid = (k: keyof CreatureTraits) => (TRAIT_RANGES[k].min + TRAIT_RANGES[k].max) / 2;

function traits(over: Partial<CreatureTraits> = {}): CreatureTraits {
  return {
    speed: mid("speed"),
    carnivory: mid("carnivory"),
    vision: mid("vision"),
    evasion: mid("evasion"),
    huntingSkill: mid("huntingSkill"),
    ...over,
  };
}

describe("v1.5.0 — creature anatomy", () => {
  it("is deterministic: same traits, same body", () => {
    expect(computeCreatureAnatomy(traits())).toEqual(computeCreatureAnatomy(traits()));
  });

  it("fast creatures are longer, slimmer and have longer tails than slow ones", () => {
    const slow = computeCreatureAnatomy(traits({ speed: lo("speed") }));
    const fast = computeCreatureAnatomy(traits({ speed: hi("speed") }));
    expect(fast.bodyHalfLength).toBeGreaterThan(slow.bodyHalfLength);
    expect(fast.bodyHalfWidth).toBeLessThan(slow.bodyHalfWidth);
    expect(fast.tailLength).toBeGreaterThan(slow.tailLength);
  });

  it("better vision means bigger eyes", () => {
    const blind = computeCreatureAnatomy(traits({ vision: lo("vision") }));
    const sharp = computeCreatureAnatomy(traits({ vision: hi("vision") }));
    expect(sharp.eyeRadius).toBeGreaterThan(blind.eyeRadius);
  });

  it("only carnivores get a jaw, and hunting skill makes it bigger", () => {
    const herbivore = computeCreatureAnatomy(traits({ carnivory: lo("carnivory") }));
    expect(herbivore.jawVisible).toBe(false);
    const clumsy = computeCreatureAnatomy(traits({ carnivory: hi("carnivory"), huntingSkill: lo("huntingSkill") }));
    const skilled = computeCreatureAnatomy(traits({ carnivory: hi("carnivory"), huntingSkill: hi("huntingSkill") }));
    expect(clumsy.jawVisible).toBe(true);
    expect(skilled.jawLength).toBeGreaterThan(clumsy.jawLength);
    expect(skilled.aggression).toBeGreaterThan(JAW_VISIBLE_THRESHOLD);
  });

  it("spikes appear with evasion: none at the bottom, up to three, taller with more evasion", () => {
    const none = computeCreatureAnatomy(traits({ evasion: lo("evasion") }));
    const max = computeCreatureAnatomy(traits({ evasion: hi("evasion") }));
    expect(none.spikes).toHaveLength(0);
    expect(max.spikes.length).toBeGreaterThan(0);
    expect(max.spikes.length).toBeLessThanOrEqual(MAX_SPIKES);
    const some = computeCreatureAnatomy(traits({ evasion: lo("evasion") + (hi("evasion") - lo("evasion")) * 0.3 }));
    if (some.spikes.length > 0) expect(max.spikes[0].height).toBeGreaterThan(some.spikes[0].height);
  });

  it("the head sits in front of the torso and the tail behind it", () => {
    const a = computeCreatureAnatomy(traits());
    expect(a.headZ).toBeGreaterThan(0);
    expect(a.tailZ).toBeLessThan(0);
    expect(a.eyeZ).toBeGreaterThan(a.headZ);
  });

  it("clamps out-of-range traits instead of producing broken shapes", () => {
    const wild = computeCreatureAnatomy(traits({ speed: 999, vision: -50, evasion: 999, carnivory: -3, huntingSkill: 999 }));
    for (const v of Object.values(wild)) {
      if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
    }
    expect(wild.spikes.length).toBeLessThanOrEqual(MAX_SPIKES);
  });
});
