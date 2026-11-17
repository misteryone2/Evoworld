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
  /** Vegetazione media nelle celle occupate da organismi vivi (peekCell, read-only). */
  occupiedVegetation: number;
  /** Frazione di celle occupate classificate come terra (non ocean). */
  occupiedLandFraction: number;
  /** Numero di celle occupate effettivamente campionate (chunk materializzati). */
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
export function sampleState(world: World, counters: E1Counters): E1Sample {
  const stats = world.getStats();
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

  let vegetationSum = 0;
  let land = 0;
  let sampled = 0;
  for (const o of organisms) {
    const cell = world.planet.peekCell(Math.round(o.position.x), Math.round(o.position.y));
    if (!cell) continue;
    sampled++;
    vegetationSum += cell.vegetation;
    if (cell.terrain !== "ocean") land++;
  }

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
    births: stats.births,
    deaths: stats.deaths,
    predationKills: stats.predationKills,
    cumulativeBirths: counters.births,
    cumulativeDeaths: counters.deaths,
    cumulativePredationKills: counters.predationKills,
    birthRate: round(stats.births / pop, 5),
    deathRate: round(stats.deaths / pop, 5),
    predationPressure: round(stats.predationKills / pop, 5),
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
    occupiedVegetation: round(sampled ? vegetationSum / sampled : 0),
    occupiedLandFraction: round(sampled ? land / sampled : 0),
    occupiedCellsSampled: sampled,
    meanGeneticDistance: round(sampledGeneticDistance(organisms, stats.tick)),
  };
}

/** Cumula i contatori per tick; da chiamare subito dopo `world.step()`. */
export function accumulate(counters: E1Counters, world: World): void {
  const s = world.getStats();
  counters.births += s.births;
  counters.deaths += s.deaths;
  counters.predationKills += s.predationKills;
}
