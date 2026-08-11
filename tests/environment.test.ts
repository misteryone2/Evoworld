import { describe, it, expect } from "vitest";
import { environmentalFitness } from "../simulation/biology/environment";
import { TRAIT_RANGES } from "../simulation/biology/genome";
import type { Cell, Genome } from "../types";

const baseGenome: Genome = {
  size: 1,
  speed: 1,
  metabolism: 1,
  vision: 5,
  fertility: 0.5,
  lifespan: 500,
  carnivory: 0,
  preferredTemperature: 20,
  temperatureTolerance: 10,
  preferredWater: 0.4,
  waterTolerance: 0.2,
};

function makeCell(temperature: number, water: number): Cell {
  return { elevation: 0.3, temperature, water, vegetation: 0.6, terrain: "plains" };
}

describe("environmentalFitness", () => {
  it("is highest exactly at the organism's preferred temperature and water", () => {
    const perfectCell = makeCell(baseGenome.preferredTemperature, baseGenome.preferredWater);
    const offCell = makeCell(baseGenome.preferredTemperature + 15, baseGenome.preferredWater);
    expect(environmentalFitness(baseGenome, perfectCell)).toBeGreaterThan(environmentalFitness(baseGenome, offCell));
  });

  it("decreases as conditions move further from the preferred niche", () => {
    const near = makeCell(baseGenome.preferredTemperature + 2, baseGenome.preferredWater);
    const mid = makeCell(baseGenome.preferredTemperature + 8, baseGenome.preferredWater);
    const far = makeCell(baseGenome.preferredTemperature + 20, baseGenome.preferredWater);
    const fNear = environmentalFitness(baseGenome, near);
    const fMid = environmentalFitness(baseGenome, mid);
    const fFar = environmentalFitness(baseGenome, far);
    expect(fNear).toBeGreaterThan(fMid);
    expect(fMid).toBeGreaterThan(fFar);
  });

  it("is always non-negative", () => {
    const extremeCell = makeCell(TRAIT_RANGES.preferredTemperature.max + 50, 1);
    expect(environmentalFitness(baseGenome, extremeCell)).toBeGreaterThanOrEqual(0);
  });

  describe("specialist vs generalist tradeoff", () => {
    const specialist: Genome = { ...baseGenome, temperatureTolerance: TRAIT_RANGES.temperatureTolerance.min, waterTolerance: TRAIT_RANGES.waterTolerance.min };
    const generalist: Genome = { ...baseGenome, temperatureTolerance: TRAIT_RANGES.temperatureTolerance.max, waterTolerance: TRAIT_RANGES.waterTolerance.max };

    it("a specialist reaches a higher fitness peak than a generalist at the exact preferred niche", () => {
      const perfectCell = makeCell(baseGenome.preferredTemperature, baseGenome.preferredWater);
      const specialistFitness = environmentalFitness(specialist, perfectCell);
      const generalistFitness = environmentalFitness(generalist, perfectCell);
      expect(specialistFitness).toBeGreaterThan(generalistFitness);
    });

    it("a generalist outperforms a specialist far from the specialist's home niche", () => {
      const farCell = makeCell(baseGenome.preferredTemperature + 18, baseGenome.preferredWater + 0.35);
      const specialistFitness = environmentalFitness(specialist, farCell);
      const generalistFitness = environmentalFitness(generalist, farCell);
      expect(generalistFitness).toBeGreaterThan(specialistFitness);
    });
  });
});
