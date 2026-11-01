import { describe, it, expect } from "vitest";
import { wrappedDelta, nextHeading } from "../lib/creatureHeading";

describe("v1.5.0 — creature heading", () => {
  it("wrappedDelta takes the short way around the planet", () => {
    expect(wrappedDelta(510, 2, 512)).toBe(4);
    expect(wrappedDelta(2, 510, 512)).toBe(-4);
    expect(wrappedDelta(10, 20, 512)).toBe(10);
  });

  it("a first movement sets a unit heading", () => {
    const h = nextHeading(null, 3, 4)!;
    expect(h.hx).toBeCloseTo(0.6, 6);
    expect(h.hy).toBeCloseTo(0.8, 6);
  });

  it("without movement the previous heading is kept, and with no history there is none", () => {
    const prev = { hx: 1, hy: 0 };
    expect(nextHeading(prev, 0, 0)).toBe(prev);
    expect(nextHeading(null, 0, 0)).toBeNull();
  });

  it("turns smoothly toward a new direction without overshooting", () => {
    const h = nextHeading({ hx: 1, hy: 0 }, 0, 5)!;
    expect(h.hx).toBeGreaterThan(0);
    expect(h.hy).toBeGreaterThan(0);
    expect(Math.hypot(h.hx, h.hy)).toBeCloseTo(1, 6);
  });

  it("handles an exact U-turn", () => {
    const h = nextHeading({ hx: 1, hy: 0 }, -2, 0, 0.5)!;
    expect(Math.hypot(h.hx, h.hy)).toBeCloseTo(1, 6);
  });
});
