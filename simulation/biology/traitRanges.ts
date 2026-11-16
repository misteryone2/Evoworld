import type { TraitRanges } from "../../types";

// v1.11.0 — spostato qui da genome.ts (nessuna modifica ai valori) per evitare dipendenze circolari con il registro dei geni.
// genome.ts continua a esportare TRAIT_RANGES, MUTATION_RATE e la frazione di mutazione.

/**
 * Valid ranges for every heritable trait. Values are always clamped into
 * these ranges after mutation so the genome cannot drift into nonsensical
 * territory (e.g. negative size).
 *
 * carnivory's max is capped at 0.85, not 1.0 (v0.3): if genetic drift ever
 * fixed the *entire* population at carnivory = 1, no organism could hunt
 * any other (prey must have strictly lower carnivory) or get any energy
 * from vegetation — a fatal absorbing state discovered during testing. The
 * cap guarantees a small vegetation fallback always remains available.
 */
export const TRAIT_RANGES: TraitRanges = {
  size: { min: 0.2, max: 3.0 },
  speed: { min: 0.1, max: 3.0 },
  metabolism: { min: 0.2, max: 2.5 },
  vision: { min: 1, max: 15 },
  fertility: { min: 0.05, max: 1.0 },
  lifespan: { min: 50, max: 2000 },
  carnivory: { min: 0, max: 0.85 },
  // Matches the planet's realistic temperature spread (see planet.ts:
  // 32 - latitude*40 - elevation*10 +- noise, roughly -18..34).
  preferredTemperature: { min: -15, max: 34 },
  // Narrow (specialist) to broad (generalist) tolerance, in the same
  // units as temperature.
  //
  // v1.2.5 — max raised from 25 to 50 after a controlled sweep
  // (baseline/+25%/+50%/+75%/x2, same seeds, everything else held
  // fixed) diagnosed WHY the founding population was collapsing on most
  // seeds: genomes are generated independently of spawn position (by
  // design — see createRandomOrganism; this stays true, nothing here
  // correlates genome to biome), so a founder's environmental fitness at
  // its actual spawn cell was essentially a random pairing. Measured
  // average founder fitness at the old max was only ~0.23 (84-88% of
  // founders below 0.5), which — combined with the already-validated
  // regional carrying capacity and upkeep baseline — left almost no
  // energy margin for most founders to ever reach reproductive age. x2
  // raised average spawn fitness to ~0.425 (58% below 0.5) and was the
  // first configuration in this whole investigation where speciation was
  // observed to occur at all. This does NOT correlate genome to spawn
  // biome (still fully independent) and does NOT remove the
  // specialist/generalist tradeoff: environment.ts's peak-height formula
  // normalizes against TRAIT_RANGES.temperatureTolerance.max itself, and
  // `min` is unchanged here, so a true specialist (tolerance near 2)
  // still reaches the same maximum peak fitness (1.35) at its ideal
  // conditions as before — only how far a *generalist* can stretch
  // changed. Not a full fix on its own: extinction is still possible on
  // unlucky seeds (a sparse founding population scattered across a huge
  // world remains a genuine minimum-viable-population risk) — see
  // HANDOFF for the full v1.2 series of experiments this was validated
  // against.
  temperatureTolerance: { min: 2, max: 50 },
  preferredWater: { min: 0, max: 1 },
  // v1.2.5 — same rationale/validation as temperatureTolerance above.
  waterTolerance: { min: 0.05, max: 1.2 },
  // Capped below 1.0, same precedent as carnivory: leaving some residual
  // vulnerability/inefficiency avoids a degenerate all-or-nothing extreme.
  evasion: { min: 0, max: 0.8 },
  huntingSkill: { min: 0, max: 0.8 },
};

/** How much a trait can drift per mutation, expressed as a fraction of its range. */
export const MUTATION_STD_FRACTION = 0.04;

/** Probability that any single trait mutates during reproduction. */
export const MUTATION_RATE = 0.15;
