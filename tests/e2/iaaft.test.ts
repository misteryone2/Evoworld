import { describe, expect, it } from "vitest";
import {
  exactAmplitudeSpectrum,
  exactIfftReal,
  exactTransform,
  type Complex,
} from "../../tools/e2/fourier";
import {
  IAAFT_AMPLITUDE_TOLERANCE,
  iaaftSurrogatesDetailed,
  mulberry32,
} from "../../tools/e2/surrogateInference";

const naiveDft = (values: number[]): Complex[] =>
  values.map((_, k) => values.reduce<Complex>((sum, value, n) => {
    const angle = (-2 * Math.PI * n * k) / values.length;
    return { re: sum.re + value * Math.cos(angle), im: sum.im + value * Math.sin(angle) };
  }, { re: 0, im: 0 }));

const seriesOfLength = (length: number, seed: number): number[] => {
  const rng = mulberry32(seed);
  let state = 0;
  return Array.from({ length }, (_, index) => {
    state = 0.62 * state + rng() * 2 - 1 + 2 * Math.sin(index * 0.17);
    return state + 0.01 * index;
  });
};

const autocorrelation = (values: number[], lag: number): number => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const centred = values.map((value) => value - mean);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index + lag < values.length; index++) {
    numerator += centred[index] * centred[index + lag];
    denominator += centred[index] ** 2 + centred[index + lag] ** 2;
  }
  return denominator === 0 ? 0 : (2 * numerator) / denominator;
};

const relativeSpectralError = (reference: number[], candidate: number[]): number => {
  const target = exactAmplitudeSpectrum(reference);
  const observed = exactAmplitudeSpectrum(candidate);
  const targetEnergy = target.reduce((sum, value) => sum + value * value, 0);
  if (targetEnergy === 0) return 0;
  const errorEnergy = observed.reduce((sum, value, index) => sum + (value - target[index]) ** 2, 0);
  return Math.sqrt(errorEnergy / targetEnergy);
};

const sortedDeviation = (reference: number[], candidate: number[]): number => {
  const a = [...reference].sort((x, y) => x - y);
  const b = [...candidate].sort((x, y) => x - y);
  return Math.max(...a.map((value, index) => Math.abs(value - b[index])));
};

describe("E2.2 exact-length IAAFT", () => {
  it("matches a naive DFT and inverts exactly for non power-of-two lengths", () => {
    for (const length of [5, 7, 11, 100, 160, 271, 256, 512]) {
      const values = seriesOfLength(length, length + 17);
      const expected = naiveDft(values);
      const actual = exactTransform(values);
      for (let index = 0; index < length; index++) {
        expect(actual[index].re).toBeCloseTo(expected[index].re, 6);
        expect(actual[index].im).toBeCloseTo(expected[index].im, 6);
      }
      exactIfftReal(actual).forEach((value, index) => {
        expect(value).toBeCloseTo(values[index], 6);
      });
    }
  });

  it.each([100, 160, 271, 256, 512])("preserves the required series properties at length %i", (length) => {
    const values = seriesOfLength(length, 0x51aa + length);
    const result = iaaftSurrogatesDetailed(values, 5, mulberry32(0x1234 + length), 24);

    expect(result.surrogates).toHaveLength(5);
    for (const surrogate of result.surrogates) {
      expect(surrogate).toHaveLength(length);
      expect(surrogate.every(Number.isFinite)).toBe(true);
      expect(sortedDeviation(values, surrogate)).toBeLessThan(1e-9);
      expect(relativeSpectralError(values, surrogate)).toBeLessThan(0.05);
    }

    for (const lag of [1, 2, 3, 5]) {
      const observed = autocorrelation(values, lag);
      const surrogateMean = result.surrogates.reduce(
        (sum, surrogate) => sum + autocorrelation(surrogate, lag), 0,
      ) / result.surrogates.length;
      expect(Math.abs(observed - surrogateMean)).toBeLessThan(0.2);
    }

    const repeated = iaaftSurrogatesDetailed(values, 5, mulberry32(0x1234 + length), 24);
    const differentSeed = iaaftSurrogatesDetailed(values, 5, mulberry32(0x4321 + length), 24);
    expect(repeated.surrogates).toEqual(result.surrogates);
    expect(repeated.convergence).toEqual(result.convergence);
    expect(differentSeed.surrogates).not.toEqual(result.surrogates);
    expect(result.convergence.totalSurrogates).toBe(5);
    expect(result.convergence.iterations.max).toBeLessThanOrEqual(24);
    expect(result.convergence.finalRelativeSpectralError.max).toBeLessThanOrEqual(0.05);
    expect(IAAFT_AMPLITUDE_TOLERANCE).toBe(1e-3);
  });

  it("handles constant, near-constant and repeated-value series without changing length", () => {
    const constant = Array.from({ length: 160 }, () => 7);
    const nearConstant = Array.from({ length: 160 }, (_, index) => 7 + (index % 2) * 1e-9);
    const repeated = Array.from({ length: 271 }, (_, index) => [0, 0, 1, 1, 2, 2][index % 6]);

    for (const values of [constant, nearConstant, repeated]) {
      const result = iaaftSurrogatesDetailed(values, 3, mulberry32(0xabcd), 12);
      expect(result.surrogates).toHaveLength(3);
      for (const surrogate of result.surrogates) {
        expect(surrogate).toHaveLength(values.length);
        expect(surrogate.every(Number.isFinite)).toBe(true);
        expect(sortedDeviation(values, surrogate)).toBeLessThan(1e-9);
      }
    }

    expect(iaaftSurrogatesDetailed(constant, 3, mulberry32(0xabcd), 12).surrogates[0])
      .toEqual(constant);
    expect(relativeSpectralError(repeated,
      iaaftSurrogatesDetailed(repeated, 1, mulberry32(0xabcd), 12).surrogates[0]))
      .toBeLessThan(0.25);
  });
});
