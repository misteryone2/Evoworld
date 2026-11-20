/**
 * SIMULATION_DETERMINISM
 *
 * Stateless, platform-independent helpers. Math.random, Date.now and wall-clock
 * values must not be used anywhere in `simulation/planetEngine`.
 */

/** Mix an integer seed and a string salt into an unsigned 32-bit seed. */
export function hashSeed(seed: number, salt = ""): number {
  let h = (Math.trunc(seed) ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < salt.length; i += 1) {
    h = Math.imul(h ^ salt.charCodeAt(i), 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Mulberry32: compact, deterministic, sufficient for reproducible simulation. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic integer hash for grid coordinates. */
export function hash2D(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(Math.trunc(x), 0x27d4eb2d)) >>> 0;
  h = Math.imul(h ^ Math.imul(Math.trunc(y), 0x165667b1), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deterministic float in [0, 1) for one grid cell. */
export function random2D(seed: number, x: number, y: number): number {
  return hash2D(seed, x, y) / 4294967296;
}
