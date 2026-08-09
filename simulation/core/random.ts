/**
 * Deterministic, seedable pseudo-random number generator.
 *
 * We intentionally avoid Math.random() anywhere in the simulation so that a
 * run can be reproduced exactly from a numeric seed. This uses the
 * mulberry32 algorithm: small, fast, and good enough statistical quality for
 * a simulation (not for cryptography).
 */
export class Random {
  private state: number;

  constructor(seed: number) {
    // Ensure a non-zero 32-bit integer seed.
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Returns the internal state, useful for serializing/resuming a run. */
  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns an integer in [min, max]. */
  intRange(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Returns true with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Standard-normal-ish sample via sum of uniforms (cheap approximation). */
  gaussian(mean = 0, stdDev = 1): number {
    let sum = 0;
    for (let i = 0; i < 6; i++) sum += this.next();
    // sum of 6 uniforms has mean 3, variance 0.5 -> normalize
    const z = (sum - 3) / Math.sqrt(0.5);
    return mean + z * stdDev;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.intRange(0, items.length - 1)];
  }
}
