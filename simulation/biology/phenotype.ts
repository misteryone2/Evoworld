/**
 * v1.11.0 — Espressione genetica: dal genoma al fenotipo.
 *
 * Il fenotipo è un insieme di fattori derivati (moltiplicatori e costi) che la simulazione consulta nei punti
 * dove i geni hanno effetto (mantenimento, alimentazione, caccia, movimento, collisioni, riproduzione, memoria,
 * idoneità ambientale). È una funzione pura del genoma: nessun generatore casuale, nessuno stato.
 *
 * Un genoma senza `genes` (salvataggi precedenti, test) esprime il fenotipo NEUTRO: tutti i fattori valgono quanto
 * nella v1.10, quindi il comportamento è identico.
 */
import type { Genome } from "../../types";
import { geneValue } from "./geneRegistry";

/** Costanti dei compromessi (vedi il catalogo in geneRegistry.ts per la motivazione di ciascuna). */
export const UPKEEP_PER_DENSITY = 0.25;
export const UPKEEP_PER_FAT = 0.2;
export const UPKEEP_PER_LIMB = 0.15;
export const UPKEEP_PER_SPRINT = 0.2;
export const UPKEEP_PER_SENSING = 0.08;
export const UPKEEP_PER_TORPOR = 0.1;
export const UPKEEP_PER_DIGESTION = 0.2;
export const UPKEEP_PER_MEAT = 0.2;
export const UPKEEP_PER_MEMORY = 0.1;
export const MIN_UPKEEP_FACTOR = 0.5;
export const ARMOR_PER_DENSITY = 0.5;
export const SPRINT_EFFECT = 0.5;
export const TORPOR_ENERGY_FRACTION = 0.35;
export const TORPOR_EFFECT = 0.5;
export const TOLERANCE_ASYMMETRY = 0.35;
export const MATURATION_LIFESPAN_COST = 0.2;
export const BASE_MAX_ENERGY = 150;
export const BASE_MATURITY_FRACTION = 0.1;
export const BASE_MEMORY_TICKS = 300;

export interface Phenotype {
  /** Moltiplica la massa nelle collisioni. */
  massFactor: number;
  /** Moltiplica la difesa dalla caccia (corazza). */
  armorFactor: number;
  /** Riserva massima di energia. */
  maxEnergy: number;
  /** Moltiplica il mantenimento di base (somma dei costi dei geni, ≥ MIN_UPKEEP_FACTOR). */
  upkeepFactor: number;
  /** Alleggerisce il costo del terreno: eccesso / terrainRelief. */
  terrainRelief: number;
  /** Moltiplica la forza del cacciatore e la difesa della preda. */
  sprintFactor: number;
  /** Moltiplica il raggio di percezione degli altri animali. */
  sensingRadiusFactor: number;
  /** 0..0.6: intensità della torpore a bassa energia. */
  torpor: number;
  /** Moltiplica l'energia ricavata dalla vegetazione. */
  plantYield: number;
  /** Moltiplica l'energia ricavata dalla carne. */
  meatYield: number;
  /** -1..1: asimmetria di tolleranza al freddo (+) / al caldo (-). */
  thermalBias: number;
  /** -1..1: asimmetria di tolleranza ai luoghi secchi (+) / umidi (-). */
  droughtBias: number;
  /** Moltiplica costo e dotazione iniziale di un figlio. */
  gestationFactor: number;
  /** Frazione della vita dopo cui è maturo. */
  maturityFraction: number;
  /** Moltiplica la durata della vita. */
  lifespanFactor: number;
  /** Moltiplica la durata della memoria. */
  memoryFactor: number;
}

export const NEUTRAL_PHENOTYPE: Readonly<Phenotype> = Object.freeze({
  massFactor: 1,
  armorFactor: 1,
  maxEnergy: BASE_MAX_ENERGY,
  upkeepFactor: 1,
  terrainRelief: 1,
  sprintFactor: 1,
  sensingRadiusFactor: 1,
  torpor: 0,
  plantYield: 1,
  meatYield: 1,
  thermalBias: 0,
  droughtBias: 0,
  gestationFactor: 1,
  maturityFraction: BASE_MATURITY_FRACTION,
  lifespanFactor: 1,
  memoryFactor: 1,
});

const cache = new WeakMap<object, Readonly<Phenotype>>();

/** Esprime i geni di un insieme in un fenotipo (puro, non in cache). */
export function expressGenes(genes: Readonly<Record<string, number>> | undefined): Phenotype {
  const g = (id: string) => geneValue(genes, id);
  const density = g("bodyDensity");
  const fat = g("bodyFatReserve");
  const limb = g("limbLength");
  const sprint = g("sprintBias");
  const sensing = g("proximitySensing");
  const torpor = g("torporCapacity");
  const digestion = g("digestiveEfficiency");
  const meat = g("meatEfficiency");
  const memory = g("memoryRetention");
  const maturation = g("maturationRate");
  const upkeep =
    1 +
    UPKEEP_PER_DENSITY * (density - 1) +
    UPKEEP_PER_FAT * (fat - 1) +
    UPKEEP_PER_LIMB * (limb - 1) +
    UPKEEP_PER_SPRINT * (sprint - 1) +
    UPKEEP_PER_SENSING * (sensing - 1) +
    UPKEEP_PER_TORPOR * torpor +
    UPKEEP_PER_DIGESTION * (digestion - 1) +
    UPKEEP_PER_MEAT * (meat - 1) +
    UPKEEP_PER_MEMORY * (memory - 1);
  return {
    massFactor: density,
    armorFactor: 1 + ARMOR_PER_DENSITY * (density - 1),
    maxEnergy: BASE_MAX_ENERGY * fat,
    upkeepFactor: Math.max(MIN_UPKEEP_FACTOR, upkeep),
    terrainRelief: limb,
    sprintFactor: 1 + SPRINT_EFFECT * (sprint - 1),
    sensingRadiusFactor: sensing,
    torpor,
    plantYield: digestion,
    meatYield: meat,
    thermalBias: g("thermalBias"),
    droughtBias: g("droughtBias"),
    gestationFactor: g("gestationInvestment"),
    maturityFraction: BASE_MATURITY_FRACTION / maturation,
    lifespanFactor: 1 - MATURATION_LIFESPAN_COST * (maturation - 1),
    memoryFactor: memory,
  };
}

/** Fenotipo di un genoma (in cache per genoma: i genomi non si modificano dopo la nascita). Senza geni: neutro. */
export function phenotypeOf(genome: Genome): Readonly<Phenotype> {
  const genes = genome.genes;
  if (!genes) return NEUTRAL_PHENOTYPE;
  let p = cache.get(genes);
  if (!p) {
    p = Object.freeze(expressGenes(genes));
    cache.set(genes, p);
  }
  return p;
}

/** Fattore di torpore dell'organismo ora: 0 se l'energia è sopra la soglia, altrimenti l'intensità del gene. */
export function activeTorpor(phenotype: Readonly<Phenotype>, energy: number): number {
  if (phenotype.torpor <= 0) return 0;
  return energy < phenotype.maxEnergy * TORPOR_ENERGY_FRACTION ? phenotype.torpor : 0;
}
