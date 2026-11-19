import type { Organism } from "../../types";
import { Random } from "../core/random";
import { Planet } from "../planet/planet";
import { buildOrganismBuckets, nearbyOrganisms, distanceWrapped } from "./spatialIndex";
import { recordDangerMemory } from "./behavior";
import { areTouching, maxContactCells } from "./collision";
import { phenotypeOf, BURST_POWER_BONUS, BURST_ENERGY_COST, DEFENSE_BRACKET_CAP } from "../biology/geneExpression";
import { MAX_ENERGY } from "../biology/energy";
import { NULL_EVENT_SINK, type EcologicalEventSink } from "./observability";


/** Below this carnivory value, an organism never attempts to hunt. */
const CARNIVORY_HUNT_THRESHOLD = 0.35;

/** How far (in grid cells) a predator can detect and reach prey. */
const HUNT_RADIUS = 4;

/** Base probability per tick that an eligible predator attempts a hunt at all. */
const HUNT_ATTEMPT_RATE = 0.35;

/** Energy cost paid for every hunt attempt, whether or not it succeeds — hunting has a real metabolic cost and risk, not just an upside. */
const HUNT_ENERGY_COST = 12;

/** Predators only bother hunting when below this energy level — a well-fed organism doesn't hunt "for free" on top of an already full energy reserve. */
const HUNT_HUNGER_THRESHOLD = 110;

/** Energy value of a successful kill before scaling by the predator's carnivory. */
const MEAT_ENERGY_VALUE = 55;

/**
 * Predator hunting power. Both size and speed matter — a predator needs to
 * be able to catch and subdue prey, so this is not just "biggest wins":
 * a fast, smaller predator can still out-hunt a slow, larger one.
 * huntingSkill (v0.3.3) is a direct multiplier on top of raw physical
 * power, representing acumen (ambush timing, tracking, coordination) that
 * specifically evolves in response to how evasive local prey have become.
 */
function huntingPower(o: Organism): number {
  // LOC-02: bonus di scatto nel tentativo di caccia (neutro senza geni estesi)
  return o.genome.size * o.genome.speed * (1 + o.genome.huntingSkill) * (1 + BURST_POWER_BONUS * phenotypeOf(o.genome).burstPower);
}

/**
 * Prey defensive power against a hunt. Uses the same size*speed base (a
 * bigger/faster prey is inherently harder to catch too) plus a fixed
 * baseline evasion advantage, multiplied by the prey's own evasion trait
 * (v0.3.3) — vigilance/agility that specifically evolves in response to
 * how skilled local predators have become. This is the other half of the
 * arms race: evasion directly counters huntingSkill in the same formula,
 * so neither trait can "win" once and for all — a rise in one creates
 * selection pressure for the other to rise too.
 */
function defensivePower(o: Organism): number {
  const phenotype = phenotypeOf(o.genome);
  // MOR-02: la corazza si somma alla parentesi (1,15 + evasion), con tetto totale (PROVVISORIO: il catalogo non definisce il cap);
  // MOR-03: corporatura ×; LOC-02: scatto nella fuga.
  const bracket = Math.min(DEFENSE_BRACKET_CAP, 1.15 + o.genome.evasion + phenotype.defenseBonus);
  const legacyBracket = 1.15 + o.genome.evasion;
  return o.genome.size * o.genome.speed * (phenotype.defenseBonus === 0 ? legacyBracket : Math.max(legacyBracket, bracket)) * phenotype.defenseFactor * (1 + BURST_POWER_BONUS * phenotype.burstPower);
}

/**
 * Groups living organisms into spatial buckets sized to the hunt radius, so
 * a predator only needs to scan its own bucket and its 8 neighbors instead
 * of every organism on the planet — O(n) on average instead of O(n^2),
 * which matters once populations reach the thousands.
 */
function buildBuckets(organisms: Organism[], bucketSize: number): Map<string, Organism[]> {
  return buildOrganismBuckets(organisms, bucketSize);
}

function nearbyCandidates(predator: Organism, buckets: Map<string, Organism[]>, bucketSize: number): Organism[] {
  return nearbyOrganisms(predator.position, buckets, bucketSize);
}

/**
 * Runs one tick of predation. Eligible predators (carnivory above
 * CARNIVORY_HUNT_THRESHOLD) may attempt to hunt the nearest valid prey
 * within HUNT_RADIUS. A predator only targets organisms with strictly
 * lower carnivory than itself — this keeps apex carnivores from endlessly
 * preying on each other and gives the food chain a clear direction
 * (herbivores and lower-carnivory omnivores are what gets hunted), while
 * still leaving room for real omnivore/omnivore interactions.
 *
 * Hunt success is probabilistic, based on relative hunting power (size ×
 * speed × (1 + huntingSkill)) between predator and prey defensive power
 * (size × speed × (1.15 + evasion)) (v0.3.3) — huntingSkill and evasion are
 * directly opposed in this formula, which is what creates a genuine
 * coevolutionary arms race: a rise in average evasion among prey erodes
 * predators' success rate, creating selection pressure for higher
 * huntingSkill, which in turn erodes prey survival and re-creates pressure
 * for more evasion. Additionally (v0.3.1), success is reduced by local
 * interference competition: the more other eligible predators are crowded
 * into the same area relative to available prey, the harder it is for any
 * one of them to actually land a kill. On a successful hunt, the prey dies
 * immediately and the predator gains energy scaled by its own carnivory (a
 * partial carnivore still gets a partial benefit from a kill).
 *
 * Returns the number of successful kills, for statistics.
 */
export function huntPrey(
  organisms: Organism[],
  planet: Planet,
  rng: Random,
  tick = 0,
  collisions = false,
  sink: EcologicalEventSink = NULL_EVENT_SINK,
): number {
  // v1.9.1 — con le collisioni, due corpi grossi non possono stare più vicini della somma dei raggi: chi si tocca
  // può sempre cacciare, anche se il raggio di caccia in celle è più corto. Le ricerche dei vicini si allargano di conseguenza.
  const bucketSize = collisions ? Math.max(HUNT_RADIUS, maxContactCells(organisms, planet)) : HUNT_RADIUS;
  const buckets = buildBuckets(organisms, bucketSize);
  let kills = 0;
  // E2.3 — contatore puramente osservativo per ID di correlazione deterministici.
  let attemptSeq = 0;

  for (const predator of organisms) {
    if (!predator.alive) continue;
    if (predator.genome.carnivory < CARNIVORY_HUNT_THRESHOLD) continue;
    if (predator.energy >= HUNT_HUNGER_THRESHOLD) continue; // not hungry enough to bother
    if (!rng.chance(predator.genome.carnivory * HUNT_ATTEMPT_RATE)) continue;

    const candidates = nearbyCandidates(predator, buckets, bucketSize);

    let target: Organism | null = null;
    let bestDistance = Infinity;
    let rivalPredators = 0;
    let availablePrey = 0;
    for (const other of candidates) {
      if (other === predator || !other.alive) continue;
      if (other.genome.carnivory >= CARNIVORY_HUNT_THRESHOLD) {
        rivalPredators++;
        continue;
      }
      if (other.genome.carnivory < predator.genome.carnivory) availablePrey++;
      if (other.genome.carnivory >= predator.genome.carnivory) continue;
      const d = distanceWrapped(predator.position.x, predator.position.y, other.position.x, other.position.y, planet);
      if ((d <= HUNT_RADIUS || (collisions && areTouching(predator, other, planet))) && d < bestDistance) {
        bestDistance = d;
        target = other;
      }
    }
    if (!target) continue;

    // E2.3 — osservazione passiva: tutti i valori sono Already-computed dal motore.
    const predatorEnergyBefore = predator.energy;

    // Hunting has a real cost: the attempt itself burns energy regardless
    // of whether it succeeds.
    predator.energy -= HUNT_ENERGY_COST;
    // LOC-02: lo scatto costa energia a ogni tentativo, a chi caccia e a chi fugge
    const burstCostPredator = BURST_ENERGY_COST * phenotypeOf(predator.genome).burstPower;
    const burstCostPrey = BURST_ENERGY_COST * phenotypeOf(target.genome).burstPower;
    if (burstCostPredator > 0) predator.energy = Math.max(0, predator.energy - burstCostPredator);
    if (burstCostPrey > 0) target.energy = Math.max(0, target.energy - burstCostPrey);
    const predatorEnergyAfterCost = predator.energy;
    const preyEnergyAtOutcome = target.energy;

    const predatorPower = huntingPower(predator);
    const preyPower = defensivePower(target);
    const baseChance = predatorPower / (predatorPower + preyPower);

    // Interference competition: more rival predators sharing a thinner
    // prey pool means each individual hunt is less likely to land.
    const interference = rivalPredators / (availablePrey + 1);
    const successChance = baseChance / (1 + interference);

    // E2.3 — correlazione deterministica (nessun RNG aggiuntivo).
    const attemptId = `hunt:${tick}:${attemptSeq++}`;
    const commonPayload = {
      predatorId: predator.id,
      preyId: target.id,
      predatorSpeciesId: predator.speciesId,
      preySpeciesId: target.speciesId,
      predatorEnergyBefore,
      predatorEnergyAfterCost,
      preyEnergyAtOutcome,
      attemptCost: HUNT_ENERGY_COST,
      burstCostPredator,
      burstCostPrey,
      predatorPower,
      preyPower,
      baseChance,
      interference,
      rivalPredators,
      availablePrey,
      successChance,
      distance: bestDistance,
      predatorPositionX: predator.position.x,
      predatorPositionY: predator.position.y,
      preyPositionX: target.position.x,
      preyPositionY: target.position.y,
      predatorCarnivory: predator.genome.carnivory,
      preyCarnivory: target.genome.carnivory,
      predatorAge: predator.age,
      preyAge: target.age,
    };

    if (rng.chance(successChance)) {
      const predatorPhenotype = phenotypeOf(predator.genome);
      // FIS-02: la digestione efficiente vale anche per la carne; FIS-01: tetto di energia
      const energyGained = Math.min(MEAT_ENERGY_VALUE, target.energy + 30) * predator.genome.carnivory * predatorPhenotype.digestionFactor;
      predator.energy = Math.min(MAX_ENERGY * predatorPhenotype.energyCapFactor, predator.energy + energyGained);
      target.alive = false;
      kills++;

      // E2.3 — un solo record per tentativo; esito e predazione sono viste.
      sink.record({
        type: "HUNT_ATTEMPT",
        tick,
        entityIds: [predator.id, target.id],
        source: "simulation/ecology/predation.ts:huntPrey",
        correlationId: attemptId,
        payload: {
          ...commonPayload,
          outcome: "SUCCESS",
          energyTransferred: energyGained,
          predatorEnergyAfter: predator.energy,
          preyEnergyAtKill: preyEnergyAtOutcome,
          preyDeathCorrelationId: `${attemptId}:death`,
          digestionFactor: predatorPhenotype.digestionFactor,
          energyCapFactor: predatorPhenotype.energyCapFactor,
        },
      });
      // Morte per predazione: emessa qui, dove la causa è nota, prima del filtro
      // che rimuove l'organismo. Non viene duplicata nel ciclo mortalità.
      sink.record({
        type: "DEATH",
        tick,
        entityIds: [target.id],
        source: "simulation/ecology/predation.ts:huntPrey",
        correlationId: `${attemptId}:death`,
        payload: {
          cause: "PREDATION",
          causeCount: 1,
          speciesId: target.speciesId,
          age: target.age,
          energy: preyEnergyAtOutcome,
          positionX: target.position.x,
          positionY: target.position.y,
          predatorId: predator.id,
          predatorSpeciesId: predator.speciesId,
          huntCorrelationId: attemptId,
          lifespan: target.genome.lifespan,
        },
      });
    } else {
      // The target survives a real attempt on its life (v0.5): it remembers
      // where this happened, which biases its future movement away from
      // the spot — a lightweight "close call" learning signal, separate
      // from the genetic evasion trait.
      recordDangerMemory(target, tick);
      sink.record({
        type: "HUNT_ATTEMPT",
        tick,
        entityIds: [predator.id, target.id],
        source: "simulation/ecology/predation.ts:huntPrey",
        correlationId: attemptId,
        payload: {
          ...commonPayload,
          outcome: "FAILURE",
          energyTransferred: 0,
          predatorEnergyAfter: predator.energy,
          preyEnergyAfter: target.energy,
        },
      });
    }
  }

  return kills;
}
