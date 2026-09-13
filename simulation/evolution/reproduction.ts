import type { Organism } from "../../types";
import { Random } from "../core/random";
import { inheritGenome, cloneWithMutation, areGeneticallyCompatible } from "../biology/genome";
import { inheritBrain, cloneBrainWithMutation } from "../biology/brain";
import { createOrganism } from "../biology/organism";
import { Planet } from "../planet/planet";
import { buildOrganismBuckets, nearbyOrganisms, distanceWrapped as bucketDistanceWrapped } from "../ecology/spatialIndex";

const REPRODUCTION_ENERGY_THRESHOLD = 130;
const REPRODUCTION_ENERGY_COST = 55;
const MIN_REPRODUCTION_AGE_FRACTION = 0.1; // must reach 10% of lifespan first
/**
 * v1.2.4 — CONSOLIDATED BASELINE. Raised from 2 to 4 cells after a
 * controlled sweep (2/4/8/12/16, same 5 seeds, everything else fixed at
 * the rest of this file's v1.2 baseline): 4 tripled 10,000-tick survival
 * (20% -> 60%) versus the original radius, and — counterintuitively —
 * outperformed every larger radius tested too (8/12/16 all did worse,
 * despite each measurably raising how often an eligible organism actually
 * had a reachable mate). Verified NOT to create artificially global
 * mating at any tested value: even at radius 16 on a 1024-wide world,
 * mate availability among eligible organisms never exceeded ~80% and was
 * usually far lower — the radius stays a real geographic constraint, not
 * a loophole. See HANDOFF for the full experimental history.
 */
const MATE_SEARCH_RADIUS = 4;

/**
 * Attempts reproduction for the current population. An organism can
 * reproduce only if it has enough energy and has matured past a minimum
 * fraction of its lifespan. Whether reproduction actually happens (and
 * whether a mate is found) is probabilistic and scaled by the fertility
 * trait, so fertility is a real, selectable trait rather than a formality.
 *
 * Mate compatibility (v0.2.1) is based on genetic distance, not on sharing
 * the same speciesId label: this is what allows speciation to be a real
 * emergent consequence of accumulated drift. Right after a species splits,
 * the two new populations are already reproductively isolated from each
 * other (by construction, since the split only happens once their genomes
 * are far enough apart), but this function never checks speciesId directly.
 *
 * v1.2 — REPRODUCTION_ENERGY_THRESHOLD/COST raised (90/40 -> 130/55) and
 * the per-tick attempt probability lowered (fertility*0.3 -> fertility*
 * 0.05): the original values let a well-fed organism reproduce almost
 * every tick once eligible, since feeding income could vastly outpace
 * these costs — recalibrated together with feeding.ts's regional
 * carrying capacity so reproduction rate stays coupled to real resource
 * availability instead of being nearly unconstrained by it. See HANDOFF
 * for the full experimental history behind these numbers.
 *
 * v1.2.4 — mate search uses the same spatial-bucket approach as predation
 * and behavior (see spatialIndex.ts) instead of scanning every eligible
 * organism on the planet for every eligible organism: a linear scan per
 * candidate was O(n^2) in the worst case, which became a real cost once
 * populations reached the thousands. The selection logic itself (nearest
 * compatible, unpaired mate within MATE_SEARCH_RADIUS) is unchanged.
 */
export function reproduceOrganisms(
  organisms: Organism[],
  planet: Planet,
  rng: Random,
  nextId: () => number,
): Organism[] {
  const offspring: Organism[] = [];
  const eligible = organisms.filter(
    (o) =>
      o.alive &&
      o.energy >= REPRODUCTION_ENERGY_THRESHOLD &&
      o.age >= o.genome.lifespan * MIN_REPRODUCTION_AGE_FRACTION,
  );

  const buckets = buildOrganismBuckets(eligible, MATE_SEARCH_RADIUS);
  const paired = new Set<number>();

  for (const organism of eligible) {
    if (paired.has(organism.id)) continue;
    // v1.2 — lowered from 0.3: even with abundant local resources,
    // reproduction attempts now happen at a realistically slower cadence,
    // giving mortality (predation, old age, and feeding.ts's regional
    // scarcity as newly-colonized territory itself fills up) real time to
    // act as a counterbalance before a generation compounds into the
    // next. fertility remains the actual selected trait — this only
    // recalibrates its overall pace to a computationally sustainable one.
    if (!rng.chance(organism.genome.fertility * 0.05)) continue;

    // Look for a nearby, genetically compatible, unpaired mate — only
    // among the small set of candidates in the same/adjacent buckets,
    // not the entire eligible population.
    const candidates = nearbyOrganisms(organism.position, buckets, MATE_SEARCH_RADIUS);
    let mate: Organism | null = null;
    let bestDistance = Infinity;
    for (const other of candidates) {
      if (other.id === organism.id || paired.has(other.id)) continue;
      if (!areGeneticallyCompatible(organism.genome, other.genome)) continue;
      const d = bucketDistanceWrapped(organism.position.x, organism.position.y, other.position.x, other.position.y, planet);
      if (d <= MATE_SEARCH_RADIUS && d < bestDistance) {
        bestDistance = d;
        mate = other;
      }
    }

    let childGenome;
    let childBrain;
    if (mate) {
      paired.add(organism.id);
      paired.add(mate.id);
      childGenome = inheritGenome(organism.genome, mate.genome, rng);
      childBrain = inheritBrain(organism.brain, mate.brain, rng);
      mate.energy -= REPRODUCTION_ENERGY_COST;
    } else {
      // Asexual fallback so isolated populations are not permanently stuck,
      // at a higher energy cost to keep sexual reproduction favored when
      // compatible mates are available.
      if (!rng.chance(0.15)) continue;
      paired.add(organism.id);
      childGenome = cloneWithMutation(organism.genome, rng);
      childBrain = cloneBrainWithMutation(organism.brain, rng);
    }

    organism.energy -= REPRODUCTION_ENERGY_COST;

    const child = createOrganism(
      nextId(),
      organism.speciesId,
      organism.position.x,
      organism.position.y,
      childGenome,
      undefined,
      childBrain,
    );
    offspring.push(child);
  }

  return offspring;
}
