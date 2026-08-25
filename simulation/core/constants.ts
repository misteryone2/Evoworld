/**
 * Shared timing constants used by both the planet's climate cycle and the
 * world's year/statistics calculation, so they always stay in sync.
 */
export const TICKS_PER_YEAR = 400;

/**
 * v1.1 — World Scale. Side length (in cells) of one square terrain chunk.
 * The world is generated and simulated lazily per chunk — see
 * simulation/planet/planet.ts — so this is the unit of "how much terrain
 * gets touched at once", independent of the planet's total declared size.
 */
export const DEFAULT_CHUNK_SIZE = 32;

/**
 * v1.1 — how many rings of chunks around every living organism's own
 * chunk stay "active" (simulated every tick) each tick, beyond the
 * organism's own chunk. Sized generously above the maximum any organism
 * can see or move in one tick (vision radius up to 3 cells, movement up
 * to ~3 cells/tick — see genome.ts's TRAIT_RANGES and movement.ts), so an
 * organism near a chunk boundary always has fresh, non-dormant terrain to
 * sense and step into.
 */
export const CHUNK_ACTIVATION_HALO = 1;

