import type { Cell, Genome } from "../../types";
import { TRAIT_RANGES } from "./genome";

/**
 * Peak fitness bounds for a narrow-tolerance specialist vs a
 * broad-tolerance generalist. A specialist (low tolerance) can reach a
 * fitness *above* 1 right at its preferred conditions — a real advantage
 * in its home niche — while a generalist (high tolerance) tops out below
 * 1 even in ideal conditions, in exchange for staying usable across a much
 * wider range. This is what makes tolerance an actual tradeoff instead of
 * "broad is strictly safer".
 */
const TEMP_MIN_PEAK = 0.55;
const TEMP_MAX_PEAK = 1.35;
const WATER_MIN_PEAK = 0.6;
const WATER_MAX_PEAK = 1.25;

/**
 * Gaussian-shaped fitness curve centered on `preferred`, with `tolerance`
 * controlling both the width of the curve and (inversely) its peak height.
 */
function nicheFitness(
  value: number,
  preferred: number,
  tolerance: number,
  minPeak: number,
  maxPeak: number,
  maxTolerance: number,
): number {
  const toleranceFraction = Math.min(1, Math.max(0, tolerance / maxTolerance));
  const peak = maxPeak - toleranceFraction * (maxPeak - minPeak);
  const safeTolerance = Math.max(tolerance, 0.001);
  const z = (value - preferred) / safeTolerance;
  return peak * Math.exp(-0.5 * z * z);
}

/**
 * Combined environmental fitness (0..~1.4) of a genome in a given cell,
 * multiplying independent temperature and water niche fitness. This is
 * used to scale how efficiently an organism can forage vegetation in that
 * cell (see feeding.ts): being well-adapted to the local climate makes the
 * same plants worth more, which is what creates real selective pressure to
 * specialize toward — or spread across — particular biomes, rather than
 * every genome performing identically everywhere on the planet.
 */
export function environmentalFitness(genome: Genome, cell: Cell): number {
  const tempFitness = nicheFitness(
    cell.temperature,
    genome.preferredTemperature,
    genome.temperatureTolerance,
    TEMP_MIN_PEAK,
    TEMP_MAX_PEAK,
    TRAIT_RANGES.temperatureTolerance.max,
  );
  const waterFitness = nicheFitness(
    cell.water,
    genome.preferredWater,
    genome.waterTolerance,
    WATER_MIN_PEAK,
    WATER_MAX_PEAK,
    TRAIT_RANGES.waterTolerance.max,
  );
  return tempFitness * waterFitness;
}
