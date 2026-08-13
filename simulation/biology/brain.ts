import { Random } from "../core/random";

/**
 * v0.8 — Intelligenza evolutiva.
 *
 * Up through v0.5, an organism's movement was a FIXED formula: sensed
 * signals (nearby vegetation, flock, threats, prey, territory, memory)
 * were combined with hand-tuned constant weights (FEAR_WEIGHT,
 * HUNT_SEEK_WEIGHT, etc.) chosen by the person building the simulation.
 * That is exactly the kind of scripted-behavior shortcut the project
 * avoids everywhere else ("nessun tratto è gratuito... mai una regola
 * imposta").
 *
 * From v0.8 on, that fixed combination is replaced by a small neural
 * network — the organism's "brain" — whose weights are a heritable,
 * mutable trait, evolved the same way every other trait is: there is no
 * hand-picked optimal set of weights, only selection pressure acting on
 * whatever weights happen to produce better survival and reproduction.
 * Two consequences fall out of this for free, matching the request behind
 * this version:
 *  - individuals of the same species can genuinely behave differently
 *    (their weights differ, same as any other trait varies within a
 *    population);
 *  - the network combines multiple senses (vegetation, flock, fear, hunt,
 *    territory, memory) nonlinearly, so context-dependent strategies (e.g.
 *    "ignore the flock when a predator is very close") can emerge without
 *    anyone coding that rule directly.
 *
 * This is inter-generational evolutionary adaptation (weights only change
 * via inheritance + mutation across births), not within-lifetime learning
 * — an organism's brain is fixed for its whole life. That scope was a
 * deliberate choice: within-lifetime learning (e.g. synaptic plasticity)
 * would be a much larger, riskier addition on top of an already large
 * version.
 *
 * Architecture: SENSORY_INPUT_SIZE inputs -> HIDDEN_SIZE hidden units
 * (tanh) -> 2 outputs (tanh), the final movement direction (dx, dy) before
 * normalization in movement.ts. Small on purpose: this network only ever
 * has to learn to weight and combine six existing sensory channels, not
 * process raw pixels or anything remotely that complex.
 */

/** [energyNorm, vegDirX, vegDirY, flockX, flockY, fearX, fearY, huntX, huntY, territoryX, territoryY, memoryX, memoryY]. See behavior.ts's SensoryChannels for what everything but energy/veg means. */
export const SENSORY_INPUT_SIZE = 13;
export const HIDDEN_SIZE = 8;
export const OUTPUT_SIZE = 2;

/** Total heritable weight count: (inputs*hidden + hidden biases) + (hidden*outputs + output biases). */
export const BRAIN_SIZE = SENSORY_INPUT_SIZE * HIDDEN_SIZE + HIDDEN_SIZE + HIDDEN_SIZE * OUTPUT_SIZE + OUTPUT_SIZE;

/** Weights are clamped into this range after mutation, same spirit as TRAIT_RANGES for genome traits — bounded so mutation can't drift into numerically extreme, saturating territory. */
const WEIGHT_CLAMP = 4;
/** Standard deviation of the small random weights a freshly-seeded population starts with. */
const INIT_WEIGHT_STD = 0.5;
/** Same mutation rate as genome traits (see MUTATION_RATE in genome.ts), applied per weight independently. */
const BRAIN_MUTATION_RATE = 0.15;
const BRAIN_MUTATION_STD = 0.3;

function clamp(value: number): number {
  return Math.max(-WEIGHT_CLAMP, Math.min(WEIGHT_CLAMP, value));
}

/** Creates a brain with small random weights (used to seed the initial population). */
export function randomBrain(rng: Random): Float32Array {
  const brain = new Float32Array(BRAIN_SIZE);
  for (let i = 0; i < BRAIN_SIZE; i++) {
    brain[i] = clamp(rng.gaussian(0, INIT_WEIGHT_STD));
  }
  return brain;
}

/**
 * Produces a child brain from two parent brains: each weight is inherited
 * from a uniformly-random parent (independent per weight, unlike genome's
 * averaging inheritance — for a network, blending two evolved weight sets
 * by literal averaging tends to produce a "muddled" network sitting between
 * two different learned solutions rather than a coherent one, whereas
 * picking whole weights from one parent or the other preserves more of
 * whatever coherent structure either parent had), then each weight has an
 * independent chance to mutate.
 */
export function inheritBrain(parentA: Float32Array, parentB: Float32Array, rng: Random): Float32Array {
  const child = new Float32Array(BRAIN_SIZE);
  for (let i = 0; i < BRAIN_SIZE; i++) {
    let value = rng.chance(0.5) ? parentA[i] : parentB[i];
    if (rng.chance(BRAIN_MUTATION_RATE)) {
      value += rng.gaussian(0, BRAIN_MUTATION_STD);
    }
    child[i] = clamp(value);
  }
  return child;
}

/** Asexual variant (single parent), used as a fallback when no mate is available — mirrors cloneWithMutation in genome.ts. */
export function cloneBrainWithMutation(parent: Float32Array, rng: Random): Float32Array {
  const child = new Float32Array(BRAIN_SIZE);
  for (let i = 0; i < BRAIN_SIZE; i++) {
    let value = parent[i];
    if (rng.chance(BRAIN_MUTATION_RATE)) {
      value += rng.gaussian(0, BRAIN_MUTATION_STD);
    }
    child[i] = clamp(value);
  }
  return child;
}

function tanh(x: number): number {
  return Math.tanh(x);
}

/**
 * Runs the feedforward pass: `inputs` (length SENSORY_INPUT_SIZE) in,
 * [dx, dy] out, both in [-1, 1] (tanh-bounded), directly usable as a
 * movement direction before normalization. Pure function of (brain,
 * inputs) — same brain and same inputs always produce the same output,
 * which is what keeps the whole simulation reproducible from a seed.
 *
 * Weight layout inside the flat `brain` array (see BRAIN_SIZE):
 *   [0 .. inputs*hidden)                                  W1, row-major [input][hidden]
 *   [inputs*hidden .. inputs*hidden+hidden)                b1
 *   [+hidden*outputs)                                      W2, row-major [hidden][output]
 *   [+outputs)                                              b2
 */
export function evaluateBrain(brain: Float32Array, inputs: number[]): [number, number] {
  const w1Size = SENSORY_INPUT_SIZE * HIDDEN_SIZE;
  const b1Offset = w1Size;
  const w2Offset = b1Offset + HIDDEN_SIZE;
  const w2Size = HIDDEN_SIZE * OUTPUT_SIZE;
  const b2Offset = w2Offset + w2Size;

  const hidden = new Array<number>(HIDDEN_SIZE);
  for (let h = 0; h < HIDDEN_SIZE; h++) {
    let sum = brain[b1Offset + h];
    for (let i = 0; i < SENSORY_INPUT_SIZE; i++) {
      sum += inputs[i] * brain[i * HIDDEN_SIZE + h];
    }
    hidden[h] = tanh(sum);
  }

  const output: [number, number] = [0, 0];
  for (let o = 0; o < OUTPUT_SIZE; o++) {
    let sum = brain[b2Offset + o];
    for (let h = 0; h < HIDDEN_SIZE; h++) {
      sum += hidden[h] * brain[w2Offset + h * OUTPUT_SIZE + o];
    }
    output[o] = tanh(sum);
  }

  return output;
}
