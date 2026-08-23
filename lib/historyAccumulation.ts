import type { HistoryPoint, RenderFrame } from "../types";
import { shannonDiversityIndex } from "./biodiversity";

/** Minimum ticks between sampled history points, keeping the array a reasonable size even over very long runs. */
export const HISTORY_SAMPLE_INTERVAL_TICKS = 50;
/** Cap on stored history points; once exceeded, every other point is dropped (simple decimation) to bound memory over very long runs while keeping the overall shape of the trend. */
export const HISTORY_MAX_POINTS = 2000;

/** Builds one history sample from a RenderFrame — pure aggregation of data already sent every frame, no new engine computation (v1.0.3). */
export function sampleHistoryPoint(frame: RenderFrame): HistoryPoint {
  let vegSum = 0;
  for (let i = 0; i < frame.vegetation.length; i++) vegSum += frame.vegetation[i];

  return {
    tick: frame.tick,
    year: frame.year,
    population: frame.stats.population,
    speciesAlive: frame.stats.speciesAlive,
    biodiversity: shannonDiversityIndex(frame.speciesGenomeStats.map((s) => s.population)),
    avgCarnivory: frame.stats.averageGenome?.carnivory ?? 0,
    avgSize: frame.stats.averageGenome?.size ?? 0,
    avgVegetation: frame.vegetation.length > 0 ? vegSum / frame.vegetation.length : 0,
  };
}

/**
 * Appends a new sample if enough ticks have passed since the last one,
 * decimating the array (keeping every other point) if it grows past
 * HISTORY_MAX_POINTS. Returns the same array reference when no sample is
 * taken, so callers can use it directly as a React state value without
 * triggering unnecessary re-renders.
 */
export function maybeAppendHistory(history: HistoryPoint[], frame: RenderFrame): HistoryPoint[] {
  const last = history[history.length - 1];
  if (last && frame.tick - last.tick < HISTORY_SAMPLE_INTERVAL_TICKS) return history;

  let next = [...history, sampleHistoryPoint(frame)];
  if (next.length > HISTORY_MAX_POINTS) {
    next = next.filter((_, i) => i % 2 === 0);
  }
  return next;
}
