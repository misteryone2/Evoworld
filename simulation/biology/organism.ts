import type { Genome, Organism } from "../../types";
import { Random } from "../core/random";
import { randomGenome } from "./genome";
import { BRAIN_SIZE, randomBrain } from "./brain";

const STARTING_ENERGY = 50;

export function createOrganism(
  id: number,
  speciesId: number,
  x: number,
  y: number,
  genome: Genome,
  energy: number = STARTING_ENERGY,
  // Deterministic all-zero default (not a random brain — that would
  // require an rng and break reproducibility from a seed for any caller
  // that doesn't explicitly care about brains, e.g. most tests). Every
  // real gameplay path (seedPopulation in world.ts, reproduceOrganisms)
  // always passes an explicit, properly-seeded brain.
  brain: Float32Array = new Float32Array(BRAIN_SIZE),
): Organism {
  return {
    id,
    speciesId,
    position: { x, y },
    energy,
    age: 0,
    genome,
    alive: true,
    home: { x, y },
    memory: null,
    brain,
  };
}

export function createRandomOrganism(
  id: number,
  speciesId: number,
  x: number,
  y: number,
  rng: Random,
): Organism {
  return createOrganism(id, speciesId, x, y, randomGenome(rng), undefined, randomBrain(rng));
}

/**
 * Energy cost paid every tick just for being alive. Larger, faster and more
 * carnivorous organisms cost more energy per tick (a real tradeoff: no
 * trait is free), scaled by the organism's own metabolism trait.
 *
 * Carnivory's cost is convex (linear term + cubic term), not just linear
 * (v0.3.1): a moderately carnivorous build is only mildly more expensive
 * than a herbivore, but pushing toward the extreme gets disproportionately
 * costly. This creates a genuine interior fitness optimum for diet instead
 * of "more carnivory is always better", which previously caused the whole
 * population to converge on maximal carnivory regardless of how much
 * hunting was actually succeeding.
 *
 * evasion and huntingSkill (v0.3.3) each carry their own mild, linear
 * upkeep cost too — maintaining constant vigilance or specialized hunting
 * acumen is metabolically expensive whether or not it's ever put to use
 * that particular tick.
 */
/**
 * v1.2 — multiplies the base upkeep formula below. Metabolic cost used to
 * be negligible next to feeding income (up to ~40 energy/tick vs. a
 * fraction of one energy/tick of upkeep for a typical genome) — meaning
 * almost all feeding gain became pure reproductive surplus regardless of
 * local resource pressure, which is what let population grow explosively
 * even where feeding.ts's regional carrying-capacity throttle (see
 * simulation/ecology/feeding.ts) hadn't yet engaged. Raising the real,
 * ongoing cost of simply being alive is itself a resource-based
 * mechanism, not a population cap: it changes how much of an organism's
 * income is *surplus* (available for reproduction) versus *maintenance*,
 * the same lever real metabolisms are under.
 *
 * v1.2.3 — recalibrated from ×4 down to ×1 after a controlled sweep
 * (×1/1.5/2/2.5/3/4, same seed/world/population, dispersal cost +
 * settlement both enabled) run once feeding.ts's sustainable-yield
 * ceiling and the region-scoped dispersal cost were both already
 * validated on their own: every value ≥1.5 consistently crushed the
 * founding population before it could establish (extinction within
 * 1,700–7,500 ticks on the test seed, never recovering from the initial
 * post-founding bottleneck); ×1 was the only value that produced a real,
 * sustained boom/bust dynamic — oscillating population, never exploding,
 * surviving a full 10,000-tick run on a second seed. It is not immune to
 * extinction (a sparse founding population scattered across a huge world
 * is a genuine minimum-viable-population risk, same as in real ecology),
 * just the least fragile of the values tested.
 *
 * v1.2.5 — CONSOLIDATED BASELINE, part of a four-parameter set validated
 * together (see this same version's changes to MATE_SEARCH_RADIUS in
 * reproduction.ts and temperatureTolerance/waterTolerance in genome.ts):
 * ×1 upkeep + a 4-cell mate search radius + widened niche tolerances
 * survived 3/5 ten-thousand-tick test seeds with populations of 32-102
 * and, for the first time in this whole balancing investigation,
 * observed speciation actually occurring. Extinction on unlucky seeds
 * remains a real, accepted possibility, not a bug to chase further right
 * now — see HANDOFF for the full experimental history.
 */
const UPKEEP_MULTIPLIER = 1;

export function upkeepCost(organism: Organism): number {
  const { size, speed, metabolism, vision, carnivory, evasion, huntingSkill } = organism.genome;
  const carnivoryCost = carnivory * 0.08 + Math.pow(carnivory, 3) * 0.55;
  return (
    (0.05 + size * 0.06 + speed * 0.05 + vision * 0.01 + carnivoryCost + evasion * 0.04 + huntingSkill * 0.04) *
    metabolism *
    UPKEEP_MULTIPLIER
  );
}

/** Returns true if the organism should die this tick (starvation or old age). */
export function isDying(organism: Organism): boolean {
  if (organism.energy <= 0) return true;
  if (organism.age >= organism.genome.lifespan) return true;
  return false;
}

/**
 * v1.2.2 — REVISED. Extra energy cost for being in unfamiliar,
 * still-unsettled territory — genuine dispersal/colonization, not
 * ordinary daily movement. Biologically motivated: unfamiliar territory
 * means no known shelter, unknown local hazards, and the cost of
 * actually finding food/water sources rather than already knowing where
 * they are.
 *
 * v1.2 (original) tied this to raw pixel distance from Organism.home
 * (fixed at birth). That penalized *any* movement away from the exact
 * birth point, including completely ordinary foraging/flocking/fleeing/
 * hunting drift within an organism's own established home range — a
 * region (see simulation/ecology/feeding.ts's FEEDING_REGION_SIZE) is
 * ~8 cells wide, and normal daily movement routinely covers more ground
 * than that over a handful of ticks. Combined with the tighter
 * sustainable-yield energy ceiling introduced afterward, this caused
 * total extinction of stable, already-settled populations for no reason
 * other than moving normally (verified empirically).
 *
 * v1.2.2 instead keys the cost on things the caller (World.step)
 * computes and passes in:
 *  - the *region-grid distance* (Chebyshev, in region units, torus-
 *    wrapped) between the organism's home region and its current one —
 *    coarser than pixel distance, and specifically tolerant of a whole
 *    neighborhood of regions around home (DISPERSAL_HOME_RADIUS), not
 *    just the exact 8-cell region it was born in. A single region is
 *    already comparable in size to how far ordinary foraging/flocking/
 *    hunting drift can carry an organism over a handful of ticks, so
 *    "home region only" was still effectively taxing normal movement —
 *    verified empirically (a stable, fully-settled population still
 *    collapsed to extinction). A multi-region radius gives real day-to-
 *    day roaming room while still leaving unambiguous genuine long-range
 *    dispersal (several regions away) costly;
 *  - how *unestablished* the current region still is (see
 *    RegionEstablishment), once outside that radius — cost fades to 0 as
 *    a region matures, whether through this organism's own presence or
 *    others', which is what makes it a genuine colonization cost rather
 *    than a permanent tax on ever having left home.
 *
 * Deliberately NOT a hard boundary or migration blocker: any region can
 * still be reached and settled, it's just not free while it's new and
 * genuinely far from familiar territory.
 */
const DISPERSAL_COST_MAX = 6; // energy/tick, in a completely unestablished region
/** Region-grid radius (Chebyshev, in FEEDING_REGION_SIZE units) treated as "home territory" — no cost anywhere inside it, regardless of establishment. Exported so World's initial seeding (see world.ts) can mark this same neighborhood as already-established for the founding population, keeping the two consistent. */
export const DISPERSAL_HOME_RADIUS = 2;

export function dispersalCost(
  homeRegionX: number,
  homeRegionY: number,
  currentRegionX: number,
  currentRegionY: number,
  regionGridWidth: number,
  regionGridHeight: number,
  currentRegionEstablishment: number,
): number {
  const dx = Math.min(Math.abs(currentRegionX - homeRegionX), regionGridWidth - Math.abs(currentRegionX - homeRegionX));
  const dy = Math.min(Math.abs(currentRegionY - homeRegionY), regionGridHeight - Math.abs(currentRegionY - homeRegionY));
  const regionDistance = Math.max(dx, dy);
  if (regionDistance <= DISPERSAL_HOME_RADIUS) return 0;
  return DISPERSAL_COST_MAX * (1 - currentRegionEstablishment);
}
