/**
 * E2 — metriche additive di biodiversita'.
 *
 * E1 espone gia' `speciesAlive`, `shannon` e `evenness` per campione. Qui
 * aggiungiamo dominanza, diversita' effettiva, persistenza e turnover, senza
 * modificare le definizioni E1.
 */
import type { E1Sample } from "../e1/metrics";
import type { RunResult } from "../e1/runner";
import { mean, sampleSd, summarize } from "../e1/statistics";

export interface DiversityPoint {
  tick: number;
  richness: number;
  shannon: number;
  evenness: number;
  dominance: number;
  effectiveSpecies: number;
}

export interface PersistentSpecies {
  speciesId: number;
  fraction: number;
}

export interface DiversitySummary {
  finalRichness: number;
  finalShannon: number;
  finalEvenness: number;
  finalDominance: number;
  meanDominance: number;
  meanEffectiveSpecies: number;
  meanTurnover: number;
  persistentSpecies: PersistentSpecies[];
}

const round = (value: number, digits = 6): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Identificativi delle specie viventi in un campione. */
export function speciesSet(sample: E1Sample): number[] {
  return Object.entries(sample.speciesCounts)
    .filter(([, count]) => count > 0)
    .map(([id]) => Number(id))
    .sort((a, b) => a - b);
}

/** Frazione della popolazione appartenente alla specie piu' abbondante. */
export function dominance(sample: E1Sample): number {
  const counts = Object.values(sample.speciesCounts).filter((n) => Number.isFinite(n) && n > 0);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return round(Math.max(...counts) / total);
}

/** Numero effettivo di specie (inverso dell'indice di Simpson). */
export function effectiveSpecies(sample: E1Sample): number {
  const counts = Object.values(sample.speciesCounts).filter((n) => Number.isFinite(n) && n > 0);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  const sumSquares = counts.reduce((acc, n) => acc + (n / total) ** 2, 0);
  return sumSquares > 0 ? round(1 / sumSquares) : 0;
}

/** Serie completa di biodiversita' per una corsa. */
export function diversityTrajectory(result: RunResult): DiversityPoint[] {
  return result.samples.map((s) => ({
    tick: s.tick,
    richness: s.speciesAlive,
    shannon: s.shannon,
    evenness: s.evenness,
    dominance: dominance(s),
    effectiveSpecies: effectiveSpecies(s),
  }));
}

/** Turnover di Jaccard tra due insiemi di specie: 1 - |A∩B|/|A∪B|. */
export function jaccardTurnover(a: number[], b: number[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const id of setA) if (setB.has(id)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : round(1 - intersection / union);
}

/** Frazione di campioni (su tutte le corse) in cui una specie e' vivente. */
export function persistentSpecies(
  results: RunResult[],
  minFraction = 0.5,
): PersistentSpecies[] {
  const appearances = new Map<number, number>();
  let total = 0;
  for (const result of results) {
    for (const sample of result.samples) {
      total++;
      for (const id of speciesSet(sample)) appearances.set(id, (appearances.get(id) ?? 0) + 1);
    }
  }
  if (total === 0) return [];
  return [...appearances.entries()]
    .map(([speciesId, count]) => ({ speciesId, fraction: round(count / total) }))
    .filter((entry) => entry.fraction >= minFraction)
    .sort((a, b) => b.fraction - a.fraction || a.speciesId - b.speciesId);
}

/** Sintesi di biodiversita' appaiata per seed. */
export function diversitySummary(results: RunResult[]): DiversitySummary {
  const trajectories = results.map(diversityTrajectory);
  const finals = trajectories.map((t) => t[t.length - 1]).filter((p) => p !== undefined);
  const allPoints = trajectories.flat();
  const turnovers: number[] = [];
  for (const result of results) {
    const sets = result.samples.map(speciesSet);
    for (let i = 1; i < sets.length; i++) turnovers.push(jaccardTurnover(sets[i - 1], sets[i]));
  }
  return {
    finalRichness: finals.length ? round(mean(finals.map((p) => p.richness))) : 0,
    finalShannon: finals.length ? round(mean(finals.map((p) => p.shannon))) : 0,
    finalEvenness: finals.length ? round(mean(finals.map((p) => p.evenness))) : 0,
    finalDominance: finals.length ? round(mean(finals.map((p) => p.dominance))) : 0,
    meanDominance: allPoints.length ? round(mean(allPoints.map((p) => p.dominance))) : 0,
    meanEffectiveSpecies: allPoints.length ? round(mean(allPoints.map((p) => p.effectiveSpecies))) : 0,
    meanTurnover: turnovers.length ? round(mean(turnovers)) : 0,
    persistentSpecies: persistentSpecies(results),
  };
}

/** Sintesi cross-seed di una metrica di diversita' finale. */
export function finalDiversitySummary(results: RunResult[], field: "richness" | "shannon" | "evenness" | "dominance" | "effectiveSpecies") {
  const values = results
    .map((r) => diversityTrajectory(r).at(-1)?.[field])
    .filter((v): v is number => v !== undefined && Number.isFinite(v));
  return summarize(values);
}

/** Deviazione standard della dominanza lungo una singola corsa. */
export function dominanceVariability(result: RunResult): number | null {
  const values = diversityTrajectory(result).map((p) => p.dominance);
  return values.length < 2 ? null : round(sampleSd(values));
}
