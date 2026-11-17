import { WORLD_RADIUS_UNITS } from "../../../simulation/core/scale";

export const PLANET_RADIUS = WORLD_RADIUS_UNITS;
/**
 * v1.6.0 — Modalità leggera. How many creatures get an instance, how detailed
 * each one is, the resolution of the screen buffer and of the terrain all come
 * from the active QualityProfile (lib/qualityProfile.ts) instead of fixed
 * constants. Above the profile's maxCreatures the renderer draws a
 * deterministic stride-sampled subset (see lib/renderSampling.ts, v1.0.2):
 * the simulation engine has no population cap and never will; this only
 * bounds what gets drawn. Instance buffers are sized to that same number
 * (plus a little slack for striding), so a light profile also uses far less
 * memory than a full one.
 */
export const CREATURE_BUFFER_SLACK = 16;

export const LEGS_PER_CREATURE = 4;

/** Below this normalized carnivory value, no aggression tint is applied (matches the 2D drawCreature threshold). */
export const AGGRESSION_VISIBLE_THRESHOLD = 0.15;

/** Radius of the unit cone geometry used for tail, jaw and spikes (see ConeGeometry below). */
export const CONE_BASE_RADIUS = 0.35;
