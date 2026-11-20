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

/** Deterministic float in [0, 1) for one cell in a time-indexed grid. */
export function random3D(seed: number, x: number, y: number, z: number): number {
  const h = hash2D(seed, x, y);
  return hash2D(h, z, 0x5bf03635) / 4294967296;
}

export function smoothstep01(t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return clamped * clamped * (3 - 2 * clamped);
}

function wrap(value: number, period: number | undefined): number {
  if (period === undefined || period <= 0) return value;
  return ((value % period) + period) % period;
}

/**
 * Tiling value noise in [0, 1]. `periodX`/`periodY` keep longitude and latitude
 * seams continuous; the same seed always yields the same lattice values.
 */
export function valueNoise2D(
  seed: number,
  x: number,
  y: number,
  periodX?: number,
  periodY?: number,
): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep01(x - x0);
  const ty = smoothstep01(y - y0);
  const x1 = wrap(x0 + 1, periodX);
  const y1 = wrap(y0 + 1, periodY);
  const wx0 = wrap(x0, periodX);
  const wy0 = wrap(y0, periodY);

  const n00 = random2D(seed, wx0, wy0);
  const n10 = random2D(seed, x1, wy0);
  const n01 = random2D(seed, wx0, y1);
  const n11 = random2D(seed, x1, y1);

  const a = n00 + (n10 - n00) * tx;
  const b = n01 + (n11 - n01) * tx;
  return a + (b - a) * ty;
}

/** Deterministic fractal noise in [0, 1] with octave-stable tiling periods. */
export function fbm2D(
  seed: number,
  x: number,
  y: number,
  octaves: number,
  periodX: number,
  periodY: number,
): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * valueNoise2D(
      hashSeed(seed, `octave-${octave}`),
      x * frequency,
      y * frequency,
      periodX * frequency,
      periodY * frequency,
    );
    normalization += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return normalization > 0 ? sum / normalization : 0;
}
