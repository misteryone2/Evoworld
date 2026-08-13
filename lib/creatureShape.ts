import { TRAIT_RANGES } from "../simulation/biology/genome";

/**
 * The subset of genome traits that drive a creature's procedural
 * appearance. A plain object shape (not the full Genome type) so it can be
 * built either from a single organism's genome, from a species' current
 * mean trait values (SpeciesGenomeStats), or from a species' frozen
 * originGenomeSnapshot for an extinct species with no living members.
 */
export interface VisualTraits {
  speed: number;
  carnivory: number;
  vision: number;
  evasion: number;
  huntingSkill: number;
}

/** Normalized (0..1) visual parameters derived from VisualTraits, ready to hand to drawCreature. */
export interface CreatureShape {
  /** From speed: how streamlined/elongated the body is. */
  elongation: number;
  /** From carnivory: warm outline strength and whether a jaw is drawn at all. */
  aggression: number;
  /** From vision: eye size. */
  eyeSize: number;
  /** From evasion: number/length of defensive spike ornaments. */
  spikiness: number;
  /** From huntingSkill: size of the jaw/fang wedge (only visible when aggression is present). */
  jawSize: number;
}

function normalize(value: number, key: keyof typeof TRAIT_RANGES): number {
  const { min, max } = TRAIT_RANGES[key];
  if (max === min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/**
 * Maps raw trait values to normalized (0..1) visual parameters (v0.6 —
 * creature procedurali). This is deliberately pure and framework-free: no
 * canvas, no React. The actual drawing lives in
 * components/simulation/drawCreature.ts, which is not unit-tested (canvas
 * painting isn't meaningfully testable here) — but the trait-to-shape
 * mapping itself is, which is where an actual bug (e.g. wrong
 * normalization, wrong clamping) would hide.
 */
export function computeCreatureShape(traits: VisualTraits): CreatureShape {
  return {
    elongation: normalize(traits.speed, "speed"),
    aggression: normalize(traits.carnivory, "carnivory"),
    eyeSize: normalize(traits.vision, "vision"),
    spikiness: normalize(traits.evasion, "evasion"),
    jawSize: normalize(traits.huntingSkill, "huntingSkill"),
  };
}
