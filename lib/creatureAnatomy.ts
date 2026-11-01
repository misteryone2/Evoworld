import { TRAIT_RANGES } from "../simulation/biology/genome";

/**
 * v1.5.0 — Creature 3D. The traits that drive a creature's 3D body. A plain
 * object shape (not the full Genome) so it can be built from a single
 * organism, from a species' mean traits, or from an extinct species' frozen
 * origin snapshot — same reasoning as VisualTraits in creatureShape.ts.
 */
export interface CreatureTraits {
  speed: number;
  carnivory: number;
  vision: number;
  evasion: number;
  huntingSkill: number;
}

export interface SpikeAnatomy {
  /** Position along the body axis (local +Z is forward). */
  z: number;
  height: number;
  radius: number;
}

/**
 * Body plan of one creature in its own local space, for a creature of unit
 * size: +Z is "forward" (the direction it faces), +Y is "up" (away from the
 * ground), +X is its side. All lengths are in the same unit; the renderer
 * multiplies the whole creature by a size scale. Every number is a pure
 * function of the traits — nothing here is random, so a species' look is
 * stable and changes only when its genes do.
 */
export interface CreatureAnatomy {
  /** Ellipsoid semi-axes of the torso. */
  bodyHalfWidth: number;
  bodyHalfHeight: number;
  bodyHalfLength: number;
  headRadius: number;
  headY: number;
  headZ: number;
  eyeRadius: number;
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  tailLength: number;
  tailRadius: number;
  /** Center of the tail cone along Z (negative: behind the body). */
  tailZ: number;
  jawVisible: boolean;
  jawLength: number;
  jawRadius: number;
  jawY: number;
  jawZ: number;
  /** 0 to 3 dorsal spikes. */
  spikes: SpikeAnatomy[];
  /** 0..1 — how predatory it looks (drives color tint). */
  aggression: number;
}

/** Below this normalized carnivory, no jaw is drawn at all. */
export const JAW_VISIBLE_THRESHOLD = 0.15;
/** Below this normalized evasion, no spike is drawn at all. */
export const SPIKE_VISIBLE_THRESHOLD = 0.2;
export const MAX_SPIKES = 3;

function normalize(value: number, key: keyof typeof TRAIT_RANGES): number {
  const { min, max } = TRAIT_RANGES[key];
  if (max === min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export function computeCreatureAnatomy(traits: CreatureTraits): CreatureAnatomy {
  const speed = normalize(traits.speed, "speed");
  const carnivory = normalize(traits.carnivory, "carnivory");
  const vision = normalize(traits.vision, "vision");
  const evasion = normalize(traits.evasion, "evasion");
  const hunting = normalize(traits.huntingSkill, "huntingSkill");

  // Fast creatures are longer and slimmer; slow ones are stocky.
  const bodyHalfLength = 1.0 + speed * 0.55;
  const bodyHalfWidth = 0.8 - speed * 0.15;
  const bodyHalfHeight = 0.7 - speed * 0.12;

  const headRadius = 0.42 + carnivory * 0.08;
  const headY = bodyHalfHeight * 0.25;
  const headZ = bodyHalfLength * 0.85 + headRadius * 0.45;

  // Better vision, bigger eyes.
  const eyeRadius = 0.08 + vision * 0.14;
  const eyeX = headRadius * 0.62;
  const eyeY = headY + headRadius * 0.35;
  const eyeZ = headZ + headRadius * 0.62;

  // Fast creatures trail a longer tail.
  const tailLength = 0.5 + speed * 1.1;
  const tailRadius = 0.28;
  const tailZ = -bodyHalfLength * 0.9 - tailLength * 0.5;

  const jawVisible = carnivory > JAW_VISIBLE_THRESHOLD;
  const jawLength = 0.25 + hunting * 0.45;
  const jawRadius = 0.14 + hunting * 0.12;
  const jawY = headY - headRadius * 0.35;
  const jawZ = headZ + headRadius * 0.8 + jawLength * 0.5;

  const spikes: SpikeAnatomy[] = [];
  if (evasion > SPIKE_VISIBLE_THRESHOLD) {
    const count = Math.min(MAX_SPIKES, 1 + Math.floor(evasion * 2.99));
    const height = 0.35 + evasion * 0.9;
    for (let k = 0; k < count; k++) {
      spikes.push({ z: bodyHalfLength * 0.45 - k * bodyHalfLength * 0.5, height, radius: 0.16 });
    }
  }

  return {
    bodyHalfWidth,
    bodyHalfHeight,
    bodyHalfLength,
    headRadius,
    headY,
    headZ,
    eyeRadius,
    eyeX,
    eyeY,
    eyeZ,
    tailLength,
    tailRadius,
    tailZ,
    jawVisible,
    jawLength,
    jawRadius,
    jawY,
    jawZ,
    spikes,
    aggression: carnivory,
  };
}
