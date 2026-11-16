import type { Cell, Genome } from "../../types";
import { TRAIT_RANGES } from "./genome";
import { phenotypeOf, FUR_COLD_Z, FUR_HEAT_Z } from "./geneExpression";

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
 *
 * v1.11.0 — due modulatori opzionali (neutri a 1 e 0): `zScale` moltiplica la deviazione normalizzata (pelo, MOR-01) e
 * `peakRecovery` recupera parte della perdita di picco della tolleranza larga (termoregolazione/idratazione, FIS-03/04).
 */
function nicheFitness(
  value: number,
  preferred: number,
  tolerance: number,
  minPeak: number,
  maxPeak: number,
  maxTolerance: number,
  zScale: number = 1,
  peakRecovery: number = 0,
): number {
  const toleranceFraction = Math.min(1, Math.max(0, tolerance / maxTolerance));
  const peak = maxPeak - toleranceFraction * (maxPeak - minPeak) * (1 - peakRecovery);
  const safeTolerance = Math.max(tolerance, 0.001);
  const z = ((value - preferred) / safeTolerance) * zScale;
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
 *
 * v1.11.0 — modulatori dei geni estesi, composti in quest'ordine (PROVVISORIO, decisione aperta di Mattia): robustezza
 * stagionale (ADA-01) sulla temperatura, pelo (MOR-01) sulla deviazione, termoregolazione/idratazione (FIS-03/04) sul
 * picco, adattamento altitudinale (ADA-02) sul risultato. Senza `ext` tutto è esattamente come nella v1.10.
 */
export function environmentalFitness(genome: Genome, cell: Cell): number {
  if (!genome.ext) {
    const tempFitness = nicheFitness(cell.temperature, genome.preferredTemperature, genome.temperatureTolerance, TEMP_MIN_PEAK, TEMP_MAX_PEAK, TRAIT_RANGES.temperatureTolerance.max);
    const waterFitness = nicheFitness(cell.water, genome.preferredWater, genome.waterTolerance, WATER_MIN_PEAK, WATER_MAX_PEAK, TRAIT_RANGES.waterTolerance.max);
    return tempFitness * waterFitness;
  }
  const ph = phenotypeOf(genome);
  // ADA-01: una parte dello scostamento stagionale (già incluso in cell.temperature) viene ammortizzata
  const temperature = ph.seasonalDamping > 0 ? cell.temperature - (cell.seasonalOffset ?? 0) * ph.seasonalDamping : cell.temperature;
  // MOR-01: il pelo riduce la deviazione dal lato freddo e la aumenta dal lato caldo
  const furScale = temperature < genome.preferredTemperature ? 1 - FUR_COLD_Z * ph.coldInsulation : 1 + FUR_HEAT_Z * ph.heatPenalty;
  const tempFitness = nicheFitness(temperature, genome.preferredTemperature, genome.temperatureTolerance, TEMP_MIN_PEAK, TEMP_MAX_PEAK, TRAIT_RANGES.temperatureTolerance.max, furScale, ph.tempPeakRecovery);
  const waterFitness = nicheFitness(cell.water, genome.preferredWater, genome.waterTolerance, WATER_MIN_PEAK, WATER_MAX_PEAK, TRAIT_RANGES.waterTolerance.max, 1, ph.waterPeakRecovery);
  // ADA-02: la quota (elevation 0..1) rende più idonei chi è adattato; a = 0 → fattore 1
  return tempFitness * waterFitness * (1 + ph.altitudeFactor * cell.elevation);
}
