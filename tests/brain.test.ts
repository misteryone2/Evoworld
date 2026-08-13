import { describe, it, expect } from "vitest";
import { Random } from "../simulation/core/random";
import {
  randomBrain,
  inheritBrain,
  cloneBrainWithMutation,
  evaluateBrain,
  BRAIN_SIZE,
  SENSORY_INPUT_SIZE,
  HIDDEN_SIZE,
  OUTPUT_SIZE,
} from "../simulation/biology/brain";

describe("randomBrain", () => {
  it("produces a Float32Array of exactly BRAIN_SIZE weights", () => {
    const brain = randomBrain(new Random(1));
    expect(brain.length).toBe(BRAIN_SIZE);
  });

  it("is deterministic for a given seed", () => {
    const a = randomBrain(new Random(42));
    const b = randomBrain(new Random(42));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("produces varied (not all-identical) weights", () => {
    const brain = randomBrain(new Random(7));
    const distinct = new Set(Array.from(brain).map((v) => v.toFixed(6)));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("keeps all weights within the documented clamp range", () => {
    const brain = randomBrain(new Random(99));
    for (const w of brain) {
      expect(w).toBeGreaterThanOrEqual(-4);
      expect(w).toBeLessThanOrEqual(4);
    }
  });
});

describe("inheritBrain", () => {
  it("produces a child of length BRAIN_SIZE", () => {
    const rng = new Random(1);
    const a = randomBrain(rng);
    const b = randomBrain(rng);
    const child = inheritBrain(a, b, rng);
    expect(child.length).toBe(BRAIN_SIZE);
  });

  it("every weight comes from one parent or the other, possibly mutated — child is not simply a blend/average", () => {
    const rng = new Random(3);
    // Two very distinct parents so we can check per-weight provenance.
    const a = new Float32Array(BRAIN_SIZE).fill(-2);
    const b = new Float32Array(BRAIN_SIZE).fill(2);
    const child = inheritBrain(a, b, rng);
    // With mutation std 0.3, a mutated -2 or 2 stays far from the exact
    // average (0) with overwhelming probability across BRAIN_SIZE weights.
    const closeToAverage = Array.from(child).filter((v) => Math.abs(v) < 0.5).length;
    expect(closeToAverage).toBe(0);
  });

  it("keeps all weights within the documented clamp range even after mutation", () => {
    const rng = new Random(5);
    const a = new Float32Array(BRAIN_SIZE).fill(3.9);
    const b = new Float32Array(BRAIN_SIZE).fill(-3.9);
    for (let i = 0; i < 50; i++) {
      const child = inheritBrain(a, b, rng);
      for (const w of child) {
        expect(w).toBeGreaterThanOrEqual(-4);
        expect(w).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe("cloneBrainWithMutation", () => {
  it("produces a child of length BRAIN_SIZE, close to the parent but not always identical", () => {
    const rng = new Random(11);
    const parent = randomBrain(rng);
    let anyDifference = false;
    for (let i = 0; i < 20; i++) {
      const child = cloneBrainWithMutation(parent, rng);
      expect(child.length).toBe(BRAIN_SIZE);
      if (Array.from(child).some((v, idx) => v !== parent[idx])) anyDifference = true;
    }
    expect(anyDifference).toBe(true);
  });
});

describe("evaluateBrain", () => {
  it("produces exactly OUTPUT_SIZE outputs, each within [-1, 1] (tanh-bounded)", () => {
    const rng = new Random(13);
    const brain = randomBrain(rng);
    const inputs = Array.from({ length: SENSORY_INPUT_SIZE }, () => rng.range(-1, 1));
    const output = evaluateBrain(brain, inputs);
    expect(output.length).toBe(OUTPUT_SIZE);
    for (const v of output) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("is a pure function: same brain and inputs always produce the same output", () => {
    const rng = new Random(21);
    const brain = randomBrain(rng);
    const inputs = Array.from({ length: SENSORY_INPUT_SIZE }, () => rng.range(-1, 1));
    const a = evaluateBrain(brain, inputs);
    const b = evaluateBrain(brain, inputs);
    expect(a).toEqual(b);
  });

  it("an all-zero brain produces all-zero output regardless of input (tanh(0) = 0)", () => {
    const brain = new Float32Array(BRAIN_SIZE); // all zeros
    const inputs = Array.from({ length: SENSORY_INPUT_SIZE }, (_, i) => (i % 2 === 0 ? 1 : -1));
    const output = evaluateBrain(brain, inputs);
    expect(output[0]).toBe(0);
    expect(output[1]).toBe(0);
  });

  it("matches a hand-computed result for a brain isolating a single input-to-output path", () => {
    // Wire only input[0] -> hidden[0] -> output[0], all other weights and
    // biases zero, to verify the exact feedforward formula rather than
    // just its shape/bounds.
    const brain = new Float32Array(BRAIN_SIZE); // starts all zero
    const w1Index = 0 * HIDDEN_SIZE + 0; // input 0 -> hidden 0
    const w2Offset = SENSORY_INPUT_SIZE * HIDDEN_SIZE + HIDDEN_SIZE; // start of W2
    const w2Index = w2Offset + 0 * OUTPUT_SIZE + 0; // hidden 0 -> output 0
    brain[w1Index] = 2;
    brain[w2Index] = 3;

    const inputs = new Array(SENSORY_INPUT_SIZE).fill(0);
    inputs[0] = 0.5;

    const expectedHidden0 = Math.tanh(0.5 * 2); // no bias, only input[0] feeds hidden[0]
    const expectedOutput0 = Math.tanh(expectedHidden0 * 3); // no bias, only hidden[0] feeds output[0]

    const [out0, out1] = evaluateBrain(brain, inputs);
    expect(out0).toBeCloseTo(expectedOutput0, 10);
    expect(out1).toBe(0); // untouched path
  });
});
