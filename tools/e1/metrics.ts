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
import { Random } from "../../simulation/core/random";
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

export interface E1Sample {
  tick: number;
  year: number;
  season: Season;
  population: number;
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
  /** Distanza genetica media tra coppie di organismi campionati (RNG separato). */
  meanGeneticDistance: number;
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

/** Distanza genetica media su al più `pairs` coppie, con RNG dedicato (mai quello del mondo). */
export function sampledGeneticDistance(organisms: Organism[], tick: number, pairs = 120): number {
  if (organisms.length < 2) return 0;
  const rng = new Random(tick + 1);
  const n = Math.min(pairs, organisms.length * 3);
  let total = 0;
  for (let k = 0; k < n; k++) {
    const a = organisms[rng.intRange(0, organisms.length - 1)];
    const b = organisms[rng.intRange(0, organisms.length - 1)];
    total += geneticDistance(a.genome, b.genome);
  }
  return total / n;
}

/**
 * Campiona lo stato corrente. `counters` è lo stato cumulativo mantenuto dal
 * runner: i campi `births/deaths/predationKills` di getStats() sono PER TICK.
 */
export function sampleState(world: World, counters: E1Counters, tickEvents?: E1TickEvents): E1Sample {
  const stats = world.getStats();
  // Dopo una perturbazione il World viene ricostruito da snapshot e i contatori
  // per tick di lastStats sono zero: usiamo gli eventi catturati prima del cull.
  const events = tickEvents ?? stats;
  const organisms = world.organisms;
  const n = organisms.length;

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

  const pop = Math.max(1, n);
  return {
    tick: stats.tick,
    year: stats.year,
    season: stats.season,
    population: n,
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
    birthRate: round(events.births / pop, 5),
    deathRate: round(events.deaths / pop, 5),
    predationPressure: round(events.predationKills / pop, 5),
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
    meanGeneticDistance: round(sampledGeneticDistance(organisms, stats.tick)),
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
