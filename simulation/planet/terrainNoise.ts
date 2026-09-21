import type { TerrainType } from "../../types";

/**
 * v1.2.3 — pure noise/elevation/water primitives, extracted verbatim from
 * planet.ts (bit-for-bit identical formulas — this is a pure code-motion
 * refactor, NOT a regeneration change) so simulation/planet/hydrology.ts
 * can sample the exact same elevation/water field the terrain itself uses,
 * without duplicating the formulas or coupling to the Planet class.
 * Planet.computeElevation/computeWater/classifyBase now delegate to these
 * same functions — see planet.ts.
 */

/** Deterministic pseudo-random value in [-1, 1], a function of (seed, x, y) only. */
export function hashNoise(seed: number, x: number, y: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ x, 0x27d4eb2d);
  h = Math.imul(h ^ y, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  const u = (h >>> 0) / 4294967296;
  return u * 2 - 1;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function wrapLattice(v: number, count: number): number {
  let w = v % count;
  if (w < 0) w += count;
  return w;
}

function valueNoise2D(seed: number, x: number, y: number, frequency: number, worldWidth: number, worldHeight: number): number {
  const latticeCountX = Math.max(1, Math.round(worldWidth / frequency));
  const latticeCountY = Math.max(1, Math.round(worldHeight / frequency));
  const fx = (x / worldWidth) * latticeCountX;
  const fy = (y / worldHeight) * latticeCountY;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smoothstep(fx - x0);
  const ty = smoothstep(fy - y0);
  const lx0 = wrapLattice(x0, latticeCountX);
  const lx1 = wrapLattice(x0 + 1, latticeCountX);
  const ly0 = wrapLattice(y0, latticeCountY);
  const ly1 = wrapLattice(y0 + 1, latticeCountY);
  const v00 = hashNoise(seed, lx0, ly0);
  const v10 = hashNoise(seed, lx1, ly0);
  const v01 = hashNoise(seed, lx0, ly1);
  const v11 = hashNoise(seed, lx1, ly1);
  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * ty;
}

function fbm2D(seed: number, x: number, y: number, worldWidth: number, worldHeight: number, octaves: number, baseFrequency: number, lacunarity: number, persistence: number, seedOffset: number): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = baseFrequency;
  let maxAmplitude = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(seed + seedOffset + i * 104729, x, y, frequency, worldWidth, worldHeight) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= persistence;
    frequency /= lacunarity;
  }
  return sum / maxAmplitude;
}

/** v1.2.1 power curve, extracted unchanged from planet.ts. */
const ELEVATION_REDISTRIBUTION_POWER = 1.35;

/** Continent/ocean/mountain-scale elevation at (x, y) — identical formula to Planet's private computeElevation. */
export function computeElevationAt(seed: number, x: number, y: number, width: number, height: number): number {
  const continental = fbm2D(seed, x, y, width, height, 4, width * 0.35, 2, 0.5, 0);
  const ridgedRaw = fbm2D(seed, x, y, width, height, 4, width * 0.09, 2.2, 0.5, 9973);
  const ridged = 1 - Math.abs(ridgedRaw);
  const detail = fbm2D(seed, x, y, width, height, 3, width * 0.02, 2, 0.5, 40009);

  const landMask = Math.max(0, Math.min(1, smoothstep((continental + 0.15) / 0.4)));

  const combined = continental * 0.62 + (ridged * 2 - 1) * 0.28 * landMask + detail * 0.1;
  const normalized = Math.max(0, Math.min(1, (combined + 1) / 2));
  return Math.pow(normalized, ELEVATION_REDISTRIBUTION_POWER);
}

/** Water field at (x, y) — identical formula to Planet's private computeWater. */
export function computeWaterAt(seed: number, x: number, y: number, width: number, height: number, elevation: number): number {
  const noise = fbm2D(seed, x, y, width, height, 4, width * 0.28, 2, 0.55, 70211);
  const noiseComponent = (noise + 1) / 2;
  const elevationBias = 1 - elevation;
  return Math.max(0, Math.min(1, noiseComponent * 0.75 + elevationBias * 0.25));
}

/** Structural classification from elevation/water — identical to Planet's private static classifyBase. */
export function classifyBaseAt(elevation: number, water: number): "ocean" | "mountain" | null {
  if (water > 0.65) return "ocean";
  if (elevation > 0.75) return "mountain";
  return null;
}

export type { TerrainType };
