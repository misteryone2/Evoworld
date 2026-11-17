/**
 * E1 — metriche osservazionali, calcolate SOLO da stato pubblico del World.
 *
 * Nessuna modifica al motore: leggiamo `world.organisms`, `world.getStats()`,
 * `world.planet.peekCell()` (read-only, non materializza chunk) e i genomi
 * già presenti. Le metriche qui definite non inventano valori assenti dal
 * modello: quando un evento non è osservabile lo dichiariamo tale nel report.
 */
import type { Organism, Season } from "../../types";
import type { World } from "../../simulation/core/world";
import { geneticDistance } from "../../simulation/biology/genome";
import { shannonDiversityIndex } from "../../lib/biodiversity";

export interface E1Counters {
  births: number;
  deaths: number;
  predationKills: number;
}

/**
 * Eventi del singolo passo appena eseguito. Vengono passati esplicitamente a
 * `sampleState()` perché una perturbazione ricostruisce il World da snapshot:
 * `World.fromSnapshot()` ricalcola `lastStats` con eventi a zero, quindi leggere
 * `getStats()` dopo la ricostruzione perderebbe i valori del tick appena steppato.
 */
export interface E1TickEvents {
  births: number;
  deaths: number;
  predationKills: number;
}

/**
 * Contesto temporale del campione: separa gli eventi del tick dallo stato
 * osservato dopo l'eventuale perturbazione. `populationAtStart` è il numero di
 * organismi vivo all'inizio del passo ed è il denominatore di tutti i tassi.
 */
export interface E1SampleContext {
  populationAtStart: number;
  populationAfterStep: number;
  perturbationRemoved: number;
  perturbationKept: number;
}

export type GeneticPairMethod = "all_pairs" | "coprime_stride_sample";

export interface GeneticDistanceSample {
  mean: number;
  pairsTotal: number;
  pairsSampled: number;
  method: GeneticPairMethod;
}

export interface E1Sample {
  tick: number;
  year: number;
  season: Season;
  population: number;
  /** Popolazione all'inizio del tick, prima di step() e della perturbazione. */
  populationAtStart: number;
  /** Popolazione dopo step(), prima dell'eventuale perturbazione. */
  populationAfterStep: number;
  /** Organismi rimossi dalla perturbazione in questo tick (0 se assente). */
  perturbationRemoved: number;
  /** Organismi conservati dopo la perturbazione in questo tick. */
  perturbationKept: number;
  /** Denominatore usato per birthRate/deathRate/predationPressure. */
  eventDenominator: number;
  speciesAlive: number;
  speciesExtinct: number;
  speciesTotalEver: number;
  speciesCounts: Record<number, number>;
  shannon: number;
  evenness: number;
  births: number;
  deaths: number;
  predationKills: number;
  cumulativeBirths: number;
  cumulativeDeaths: number;
  cumulativePredationKills: number;
  birthRate: number;
  deathRate: number;
  predationPressure: number;
  meanEnergy: number;
  energySd: number;
  meanAge: number;
  carnivoreFraction: number;
  herbivoreFraction: number;
  meanCarnivory: number;
  meanSize: number;
  meanSpeed: number;
  meanMetabolism: number;
  meanVision: number;
  meanEvasion: number;
  meanHuntingSkill: number;
  /** Vegetazione media sulle celle geografiche DISTINTE occupate da organismi vivi. */
  occupiedVegetation: number;
  /** Frazione di celle distinte occupate classificate come terra (non ocean). */
  occupiedLandFraction: number;
  /** Organismi vivi per cui è stata trovata una cella materializzata (uno per organismo). */
  organismsSampled: number;
  /** Celle geografiche distinte con almeno un organismo campionato (deduplicate per coordinata). */
  occupiedCellsSampled: number;
  /** Distanza genetica media tra coppie di organismi campionati. */
  meanGeneticDistance: number;
  /** Coppie totali disponibili e coppie effettivamente confrontate. */
  geneticPairsTotal: number;
  geneticPairsSampled: number;
  /** Metodo di campionamento: enumerazione completa o stride coprimo. */
  geneticPairMethod: GeneticPairMethod;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function sd(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) * (v - m), 0) / values.length);
}

function round(value: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Coordinata di cella con lo stesso wrap toroidale usato da Planet.peekCell(). */
function wrapCellCoord(value: number, size: number): number {
  const wrapped = Math.round(value) % size;
  return wrapped < 0 ? wrapped + size : wrapped;
}

/**
 * Hash FNV-1a a 32 bit, usato solo per scelte deterministiche dell'harness.
 * Non è crittografico e non consuma l'RNG del motore.
 */
export function hash32(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  const text = parts.join("|");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const r = x % y;
    x = y;
    y = r;
  }
  return x;
}

/**
 * Converte un indice piatto (0..n(n-1)/2-1) nella coppia (i,j) con i<j,
 * enumerando le coppie per primo indice crescente.
 */
function pairAt(flat: number, n: number): [number, number] {
  let lo = 0;
  let hi = n - 2;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const before = (mid * (2 * n - mid - 1)) / 2;
    if (before <= flat) lo = mid;
    else hi = mid - 1;
  }
  const i = lo;
  const before = (i * (2 * n - i - 1)) / 2;
  return [i, i + 1 + (flat - before)];
}

/**
 * Coppie di ID uniche e ordinate per confronto genetico.
 *
 * - ID duplicati vengono eliminati e ordinati: ogni coppia compare una sola volta.
 * - Se il numero totale di coppie è ≤ `maxPairs`, vengono usate TUTTE le coppie.
 * - Altrimenti viene scelto uno stride coprimo con il numero totale di coppie e
 *   un punto di partenza deterministico (hash di tick e dimensione):
 *   la sequenza `(start + k*stride) mod pairsTotal` non si ripete finché k < pairsTotal.
 *
 * Il metodo è riproducibile e non tocca l'RNG del mondo. Il campione sistematico
 * non è uno stimatore aleatorio: copre l'intera popolazione con passo costante,
 * ma può essere sensibile a pattern periodici nell'ordine degli ID.
 */
export function sampleGeneticPairs(ids: number[], tick: number, maxPairs = 120): Array<[number, number]> {
  const sorted = Array.from(new Set(ids)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 2) return [];
  const pairsTotal = (n * (n - 1)) / 2;
  const limit = Math.max(1, Math.min(maxPairs, pairsTotal));
  const pairs: Array<[number, number]> = [];

  if (pairsTotal <= limit) {
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) pairs.push([sorted[i], sorted[j]]);
    }
    return pairs;
  }

  let stride = Math.max(1, Math.floor(pairsTotal / limit));
  while (gcd(stride, pairsTotal) !== 1) stride++;
  const start = hash32("genetic-pairs", tick, n, ids.length) % pairsTotal;
  for (let k = 0; k < limit; k++) {
    const [i, j] = pairAt((start + k * stride) % pairsTotal, n);
    pairs.push([sorted[i], sorted[j]]);
  }
  return pairs;
}

/** Distanza genetica media su coppie uniche, con metodo e copertura espliciti. */
export function sampledGeneticDistance(
  organisms: Organism[],
  tick: number,
  maxPairs = 120,
): GeneticDistanceSample {
  const ids = organisms.map((o) => o.id);
  const distinctCount = new Set(ids).size;
  const pairsTotal = Math.max(0, (distinctCount * (distinctCount - 1)) / 2);
  const pairs = sampleGeneticPairs(ids, tick, maxPairs);
  if (!pairs.length) {
    return { mean: 0, pairsTotal, pairsSampled: 0, method: "all_pairs" };
  }
  const byId = new Map(organisms.map((o) => [o.id, o]));
  let total = 0;
  for (const [a, b] of pairs) {
    total += geneticDistance(byId.get(a)!.genome, byId.get(b)!.genome);
  }
  return {
    mean: total / pairs.length,
    pairsTotal,
    pairsSampled: pairs.length,
    method: pairs.length === pairsTotal ? "all_pairs" : "coprime_stride_sample",
  };
}

/**
 * Campiona lo stato corrente. `counters` è lo stato cumulativo mantenuto dal
 * runner: i campi `births/deaths/predationKills` di getStats() sono PER TICK.
 *
 * `tickEvents` sono gli eventi del passo appena eseguito, catturati prima di una
 * perturbazione. `context` identifica la popolazione a inizio tick, dopo lo step
 * e dopo l'eventuale cull: i tassi usano sempre la popolazione a inizio tick.
 */
export function sampleState(
  world: World,
  counters: E1Counters,
  tickEvents?: E1TickEvents,
  context?: E1SampleContext,
): E1Sample {
  const stats = world.getStats();
  const organisms = world.organisms;
  const n = organisms.length;
  const ctx: E1SampleContext = context ?? {
    populationAtStart: n,
    populationAfterStep: n,
    perturbationRemoved: 0,
    perturbationKept: n,
  };
  // Dopo una perturbazione il World viene ricostruito da snapshot e i contatori
  // per tick di lastStats sono zero: usiamo gli eventi catturati prima del cull.
  const events = tickEvents ?? stats;

  const speciesCounts: Record<number, number> = {};
  for (const o of organisms) speciesCounts[o.speciesId] = (speciesCounts[o.speciesId] ?? 0) + 1;
  const populations = Object.values(speciesCounts);
  const shannon = shannonDiversityIndex(populations);
  const richness = populations.length;
  const evenness = richness > 1 ? shannon / Math.log(richness) : 0;

  const energies = organisms.map((o) => o.energy);
  const genomes = organisms.map((o) => o.genome);
  const trait = (key: "carnivory" | "size" | "speed" | "metabolism" | "vision" | "evasion" | "huntingSkill") =>
    round(mean(genomes.map((g) => g[key])));

  // Una cella può contenere più organismi: la vegetazione va contata una sola
  // volta per coordinata geografica, altrimenti i individui in sovrannumero
  // falsano la media e la frazione di terra.
  const cells = new Map<string, { vegetation: number; land: boolean }>();
  let organismsSampled = 0;
  for (const o of organisms) {
    const x = wrapCellCoord(o.position.x, world.planet.width);
    const y = wrapCellCoord(o.position.y, world.planet.height);
    const cell = world.planet.peekCell(x, y);
    if (!cell) continue;
    organismsSampled++;
    const key = `${x},${y}`;
    if (!cells.has(key)) cells.set(key, { vegetation: cell.vegetation, land: cell.terrain !== "ocean" });
  }

  const sampledCells = [...cells.values()];
  const distinctCells = sampledCells.length;
  const vegetationSum = sampledCells.reduce((sum, c) => sum + c.vegetation, 0);
  const land = sampledCells.reduce((count, c) => count + (c.land ? 1 : 0), 0);

  const denominator = Math.max(1, ctx.populationAtStart);
  const genetic = sampledGeneticDistance(organisms, stats.tick);
  return {
    tick: stats.tick,
    year: stats.year,
    season: stats.season,
    population: n,
    populationAtStart: ctx.populationAtStart,
    populationAfterStep: ctx.populationAfterStep,
    perturbationRemoved: ctx.perturbationRemoved,
    perturbationKept: ctx.perturbationKept,
    eventDenominator: denominator,
    speciesAlive: stats.speciesAlive,
    speciesExtinct: stats.speciesExtinct,
    speciesTotalEver: stats.speciesTotalEver,
    speciesCounts,
    shannon: round(shannon),
    evenness: round(evenness),
    births: events.births,
    deaths: events.deaths,
    predationKills: events.predationKills,
    cumulativeBirths: counters.births,
    cumulativeDeaths: counters.deaths,
    cumulativePredationKills: counters.predationKills,
    birthRate: round(events.births / denominator, 5),
    deathRate: round(events.deaths / denominator, 5),
    predationPressure: round(events.predationKills / denominator, 5),
    meanEnergy: round(mean(energies)),
    energySd: round(sd(energies)),
    meanAge: round(mean(organisms.map((o) => o.age))),
    carnivoreFraction: round(n ? genomes.filter((g) => g.carnivory >= 0.35).length / n : 0),
    herbivoreFraction: round(n ? genomes.filter((g) => g.carnivory < 0.35).length / n : 0),
    meanCarnivory: trait("carnivory"),
    meanSize: trait("size"),
    meanSpeed: trait("speed"),
    meanMetabolism: trait("metabolism"),
    meanVision: trait("vision"),
    meanEvasion: trait("evasion"),
    meanHuntingSkill: trait("huntingSkill"),
    occupiedVegetation: round(distinctCells ? vegetationSum / distinctCells : 0),
    occupiedLandFraction: round(distinctCells ? land / distinctCells : 0),
    organismsSampled,
    occupiedCellsSampled: distinctCells,
    meanGeneticDistance: round(genetic.mean),
    geneticPairsTotal: genetic.pairsTotal,
    geneticPairsSampled: genetic.pairsSampled,
    geneticPairMethod: genetic.method,
  };
}

/**
 * Cumula i contatori per tick e restituisce gli eventi del passo appena
 * eseguito, da passare a `sampleState()` anche se il World verrà ricostruito.
 */
export function accumulate(counters: E1Counters, world: World): E1TickEvents {
  const s = world.getStats();
  counters.births += s.births;
  counters.deaths += s.deaths;
  counters.predationKills += s.predationKills;
  return { births: s.births, deaths: s.deaths, predationKills: s.predationKills };
}
