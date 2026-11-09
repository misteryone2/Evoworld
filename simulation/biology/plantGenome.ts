import { Random } from "../core/random";

/**
 * v1.10.0 — Genoma delle piante, sviluppato a parte e SCOLLEGATO dalla simulazione.
 *
 * Nessuna parte della simulazione lo legge: le piante restano una rappresentazione della `vegetation` di ogni cella
 * (principio 7), nessuna pianta evolve ancora e nessun tratto ecologico ha effetto. Questo modulo è puro (niente React,
 * niente DOM, niente generatore globale) e definisce ciò che servirà quando le piante diventeranno individui:
 * i tratti, i loro intervalli, la mutazione, la ricombinazione e la distanza genetica.
 *
 * Due gruppi di tratti:
 *  - morfologia: letta già oggi dal disegno 3D (altezza, chioma, inclinazione, tonalità) più due tratti ancora inerti;
 *  - ecologia: come la pianta vive (clima, acqua, ombra, semi, longevità, difese). Inerti.
 */

export interface PlantTraitRange {
  min: number;
  max: number;
}

export interface PlantGenome {
  // ---- morfologia ----
  /** 0..1 — quanto è alta rispetto alla media del suo tipo. */
  height: number;
  /** 0..1 — quanto è larga la chioma. */
  crown: number;
  /** -1..1 — inclinazione del fusto. */
  lean: number;
  /** -1..1 — spostamento di tonalità del fogliame. */
  hue: number;
  /** 0..1 — quanto è legnoso il fusto (sottile e flessibile → spesso e duro). Inerte. */
  woodiness: number;
  /** 0..1 — 0 caduco (perde le foglie nella stagione fredda), 1 sempreverde. Inerte. */
  leafLongevity: number;
  // ---- ecologia (inerte) ----
  /** Velocità di crescita relativa. */
  growthRate: number;
  /** Anni di vita. */
  lifespan: number;
  /** °C preferiti. */
  preferredTemperature: number;
  /** Tolleranza alla temperatura, in °C (specialista → generalista). */
  temperatureTolerance: number;
  /** Umidità preferita, 0..1. */
  preferredWater: number;
  /** Tolleranza all'umidità. */
  waterTolerance: number;
  /** 0..1 — quanto regge l'ombra di altre piante. */
  shadeTolerance: number;
  /** 0..1 — quanto lontano arrivano i semi. */
  seedDispersal: number;
  /** 0..1 — quanti semi produce. */
  seedProduction: number;
  /** 0..1 — quanto resiste alla siccità. */
  droughtResistance: number;
  /** 0..1 — difese contro chi la mangia (spine, tossine). */
  defense: number;
}

export type PlantTraitName = keyof PlantGenome;

export const PLANT_TRAIT_RANGES: Record<PlantTraitName, PlantTraitRange> = {
  height: { min: 0, max: 1 },
  crown: { min: 0, max: 1 },
  lean: { min: -1, max: 1 },
  hue: { min: -1, max: 1 },
  woodiness: { min: 0, max: 1 },
  leafLongevity: { min: 0, max: 1 },
  growthRate: { min: 0.1, max: 2 },
  lifespan: { min: 1, max: 400 },
  preferredTemperature: { min: -15, max: 34 },
  temperatureTolerance: { min: 2, max: 50 },
  preferredWater: { min: 0, max: 1 },
  waterTolerance: { min: 0.05, max: 1.2 },
  shadeTolerance: { min: 0, max: 1 },
  seedDispersal: { min: 0, max: 1 },
  seedProduction: { min: 0.05, max: 1 },
  droughtResistance: { min: 0, max: 1 },
  defense: { min: 0, max: 1 },
};

/** Nomi dei tratti, nell'ordine in cui compaiono in PlantGenome. */
export const PLANT_TRAIT_NAMES = Object.keys(PLANT_TRAIT_RANGES) as PlantTraitName[];

/** Probabilità che un tratto muti in una riproduzione (come la fauna). */
export const PLANT_MUTATION_RATE = 0.15;
/** Deviazione di una mutazione, come frazione dell'intervallo del tratto (come la fauna). */
export const PLANT_MUTATION_STD_FRACTION = 0.04;

function clamp(trait: PlantTraitName, value: number): number {
  const { min, max } = PLANT_TRAIT_RANGES[trait];
  return Math.min(max, Math.max(min, value));
}

/** Tiene ogni tratto nel suo intervallo (e sostituisce i valori non numerici col centro dell'intervallo). */
export function clampPlantGenome(genome: PlantGenome): PlantGenome {
  const out = {} as PlantGenome;
  for (const trait of PLANT_TRAIT_NAMES) {
    const { min, max } = PLANT_TRAIT_RANGES[trait];
    const v = genome[trait];
    out[trait] = Number.isFinite(v) ? clamp(trait, v) : (min + max) / 2;
  }
  return out;
}

/** Un genoma casuale, uniforme in ogni intervallo. Consuma 17 numeri dal generatore, sempre nello stesso ordine. */
export function randomPlantGenome(rng: Random): PlantGenome {
  const g = {} as PlantGenome;
  for (const trait of PLANT_TRAIT_NAMES) {
    const { min, max } = PLANT_TRAIT_RANGES[trait];
    g[trait] = rng.range(min, max);
  }
  return g;
}

/**
 * Copia di `genome` con mutazioni: ogni tratto cambia con probabilità `rate`, di un valore gaussiano che vale
 * `stdFraction` del suo intervallo; il risultato resta sempre nei limiti. Non modifica l'originale.
 */
export function mutatePlantGenome(genome: PlantGenome, rng: Random, rate = PLANT_MUTATION_RATE, stdFraction = PLANT_MUTATION_STD_FRACTION): PlantGenome {
  const out = { ...genome };
  for (const trait of PLANT_TRAIT_NAMES) {
    if (!rng.chance(rate)) continue;
    const { min, max } = PLANT_TRAIT_RANGES[trait];
    out[trait] = clamp(trait, genome[trait] + rng.gaussian(0, (max - min) * stdFraction));
  }
  return out;
}

/** Ricombinazione: per ogni tratto il figlio prende il valore di un genitore a caso. Non modifica i genitori. */
export function crossPlantGenomes(a: PlantGenome, b: PlantGenome, rng: Random): PlantGenome {
  const out = {} as PlantGenome;
  for (const trait of PLANT_TRAIT_NAMES) out[trait] = rng.chance(0.5) ? a[trait] : b[trait];
  return out;
}

/**
 * Distanza genetica normalizzata, circa in [0, 1]: la differenza di ogni tratto divisa per il suo intervallo,
 * combinata come distanza euclidea e mediata sul numero di tratti (la stessa definizione della fauna).
 */
export function plantGeneticDistance(a: PlantGenome, b: PlantGenome): number {
  let sumSquares = 0;
  for (const trait of PLANT_TRAIT_NAMES) {
    const { min, max } = PLANT_TRAIT_RANGES[trait];
    const range = max - min;
    const d = range > 0 ? (a[trait] - b[trait]) / range : 0;
    sumSquares += d * d;
  }
  return Math.sqrt(sumSquares / PLANT_TRAIT_NAMES.length);
}

/** Genoma medio di un gruppo (null se vuoto). */
export function averagePlantGenome(genomes: PlantGenome[]): PlantGenome | null {
  if (genomes.length === 0) return null;
  const sum = {} as Record<PlantTraitName, number>;
  for (const trait of PLANT_TRAIT_NAMES) sum[trait] = 0;
  for (const g of genomes) for (const trait of PLANT_TRAIT_NAMES) sum[trait] += g[trait];
  const avg = {} as PlantGenome;
  for (const trait of PLANT_TRAIT_NAMES) avg[trait] = sum[trait] / genomes.length;
  return avg;
}
