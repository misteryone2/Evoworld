import { describe, expect, it } from "vitest";
import { formatAverageGenome } from "../lib/formatAverageGenome";
import { averageGenome, randomGenome, TRAIT_RANGES } from "../simulation/biology/genome";
import { Random } from "../simulation/core/random";
import type { Genome } from "../types";

const withExt = (g: Genome, ext: Record<string, number>): Genome => ({ ...g, ext });

describe("G3 QA — StatsPanel e genoma medio con geni estesi", () => {
  it("non chiama toFixed su un oggetto: ext viene appiattito in righe numeriche", () => {
    const average = {
      size: 1.234,
      carnivory: 0.5,
      ext: { furDensity: 0.678, bodyStature: 0.91 },
    } as unknown as Genome;
    expect(() => formatAverageGenome(average)).not.toThrow();
    const rows = formatAverageGenome(average);
    expect(rows.map((row) => row.key)).toEqual(["size", "carnivory", "ext.furDensity", "ext.bodyStature"]);
    expect(rows.map((row) => row.value)).toEqual(["1.23", "0.50", "0.68", "0.91"]);
  });

  it("scarta valori non finiti e genomi assenti senza nascondere gli altri tratti", () => {
    const average = {
      size: Number.NaN,
      speed: Number.POSITIVE_INFINITY,
      carnivory: 0.4,
      ext: { bad: Number.NaN, good: 0.25 },
    } as unknown as Genome;
    expect(formatAverageGenome(average).map((row) => row.key)).toEqual(["carnivory", "ext.good"]);
    expect(formatAverageGenome(null)).toEqual([]);
    expect(formatAverageGenome(undefined)).toEqual([]);
  });

  it("consuma l'averageGenome prodotto dalla simulazione moderna (default con ext)", () => {
    const genomes = [1, 2, 3].map((seed) => withExt(randomGenome(new Random(seed)), {
      furDensity: 0.2 * seed,
      bodyStature: 0.1 * seed,
    }));
    const average = averageGenome(genomes)!;
    expect(average.ext).toBeDefined();
    const rows = formatAverageGenome(average);
    for (const key of Object.keys(TRAIT_RANGES)) {
      expect(rows.some((row) => row.key === key), key).toBe(true);
    }
    expect(rows.some((row) => row.key === "ext.furDensity")).toBe(true);
    expect(rows.some((row) => row.key === "ext.bodyStature")).toBe(true);
    expect(rows.every((row) => /^-?\d+\.\d{2}$/.test(row.value))).toBe(true);
  });

  it("resta identico al comportamento v1.10 quando ext è assente", () => {
    const average = averageGenome([randomGenome(new Random(1)), randomGenome(new Random(2))])!;
    expect(average.ext).toBeUndefined();
    const rows = formatAverageGenome(average);
    expect(rows).toHaveLength(Object.keys(TRAIT_RANGES).length);
    expect(rows.every((row) => !row.key.startsWith("ext."))).toBe(true);
  });
});
