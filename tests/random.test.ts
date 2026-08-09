import { describe, it, expect } from "vitest";
import { Random } from "../simulation/core/random";

describe("Random", () => {
  it("produces the same sequence for the same seed", () => {
    const a = new Random(42);
    const b = new Random(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = new Random(1);
    const b = new Random(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("next() always returns a value in [0, 1)", () => {
    const rng = new Random(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("can resume from a saved state deterministically", () => {
    const rng = new Random(99);
    rng.next();
    rng.next();
    const state = rng.getState();
    const continued = Array.from({ length: 5 }, () => rng.next());

    const resumed = new Random(99);
    resumed.next();
    resumed.next();
    resumed.setState(state);
    const replay = Array.from({ length: 5 }, () => resumed.next());

    expect(replay).toEqual(continued);
  });
});
