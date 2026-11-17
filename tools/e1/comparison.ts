/**
 * E1.3 — confronto tra risultati prima e dopo la correzione spaziale.
 *
 * La correzione tocca SOLO `sampleState()` (campi spaziali). Tutti gli altri
 * campi — popolazioni, nascite, mortalità, predazione, tassi, specie, genetica —
 * devono essere identici per scenario e seed. Ogni differenza altrove è un
 * errore e viene segnalata esplicitamente.
 */
import type { RunResult } from "./runner";
import type { E1Sample } from "./metrics";
import { stripVariableData } from "./experiment";
import { stableStringify } from "./dataset";

/** Campi dell'E1Sample che dipendono dalla convenzione di cella. */
export const SPATIAL_SAMPLE_FIELDS = [
  "occupiedVegetation",
  "occupiedLandFraction",
  "organismsSampled",
  "occupiedCellsSampled",
] as const;

export type SpatialField = (typeof SPATIAL_SAMPLE_FIELDS)[number];

export interface FieldChange {
  scenario: string;
  seed: number;
  tick: number;
  field: SpatialField;
  before: number;
  after: number;
}

export interface NonSpatialMismatch {
  scenario: string;
  seed: number;
  path: string;
  before: string;
  after: string;
}

export interface SpatialChangeSummary {
  field: SpatialField;
  changedRuns: number;
  changedSamples: number;
  comparedSamples: number;
  maxAbsDelta: number;
  examples: FieldChange[];
}

export interface ComparisonReport {
  beforeRuns: number;
  afterRuns: number;
  matchedRuns: number;
  missingInAfter: string[];
  extraInAfter: string[];
  comparedSamples: number;
  nonSpatialMismatches: NonSpatialMismatch[];
  biologicalInvariance: boolean;
  spatial: SpatialChangeSummary[];
  spatialChangesFound: boolean;
}

function key(r: RunResult): string {
  return `${r.scenario}|${r.seed}`;
}

function nonSpatialSample(value: E1Sample): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (!(SPATIAL_SAMPLE_FIELDS as readonly string[]).includes(k)) out[k] = v;
  }
  return out;
}

export function compareRunResults(beforeInput: RunResult[], afterInput: RunResult[]): ComparisonReport {
  const beforeInput2 = stripVariableData(beforeInput) as RunResult[];
  const afterInput2 = stripVariableData(afterInput) as RunResult[];
  const beforeMap = new Map(beforeInput2.map((r) => [key(r), r]));
  const afterMap = new Map(afterInput2.map((r) => [key(r), r]));
  const keys = [...beforeMap.keys()].sort();
  const nonSpatialMismatches: NonSpatialMismatch[] = [];
  const changes = new Map<SpatialField, SpatialChangeSummary>(
    SPATIAL_SAMPLE_FIELDS.map((field) => [field, {
      field,
      changedRuns: 0,
      changedSamples: 0,
      comparedSamples: 0,
      maxAbsDelta: 0,
      examples: [],
    }]),
  );
  let comparedSamples = 0;

  for (const k of keys) {
    const b = beforeMap.get(k)!;
    const a = afterMap.get(k);
    if (!a) continue;
    if (b.samples.length !== a.samples.length) {
      nonSpatialMismatches.push({
        scenario: b.scenario,
        seed: b.seed,
        path: "samples.length",
        before: String(b.samples.length),
        after: String(a.samples.length),
      });
      continue;
    }
    const runFieldsB = { ...b, samples: undefined };
    const runFieldsA = { ...a, samples: undefined };
    if (stableStringify(runFieldsB) !== stableStringify(runFieldsA)) {
      nonSpatialMismatches.push({
        scenario: b.scenario,
        seed: b.seed,
        path: "run_metadata",
        before: stableStringify(runFieldsB),
        after: stableStringify(runFieldsA),
      });
    }
    const runChanges = new Set<SpatialField>();
    for (let i = 0; i < b.samples.length; i++) {
      const sb = b.samples[i];
      const sa = a.samples[i];
      comparedSamples++;
      if (stableStringify(nonSpatialSample(sb)) !== stableStringify(nonSpatialSample(sa))) {
        nonSpatialMismatches.push({
          scenario: b.scenario,
          seed: b.seed,
          path: `samples[${i}].nonSpatial`,
          before: stableStringify(nonSpatialSample(sb)),
          after: stableStringify(nonSpatialSample(sa)),
        });
      }
      for (const field of SPATIAL_SAMPLE_FIELDS) {
        const summary = changes.get(field)!;
        summary.comparedSamples++;
        const vb = sb[field];
        const va = sa[field];
        if (vb === va) continue;
        summary.changedSamples++;
        runChanges.add(field);
        summary.maxAbsDelta = Math.max(summary.maxAbsDelta, Math.abs(vb - va));
        if (summary.examples.length < 5) {
          summary.examples.push({
            scenario: b.scenario,
            seed: b.seed,
            tick: sb.tick,
            field,
            before: vb,
            after: va,
          });
        }
      }
    }
    for (const field of runChanges) changes.get(field)!.changedRuns++;
  }

  const spatial = SPATIAL_SAMPLE_FIELDS.map((f) => changes.get(f)!);
  return {
    beforeRuns: beforeInput2.length,
    afterRuns: afterInput2.length,
    matchedRuns: keys.filter((k) => afterMap.has(k)).length,
    missingInAfter: keys.filter((k) => !afterMap.has(k)),
    extraInAfter: [...afterMap.keys()].filter((k) => !beforeMap.has(k)).sort(),
    comparedSamples,
    nonSpatialMismatches,
    biologicalInvariance:
      nonSpatialMismatches.length === 0 &&
      beforeInput2.length === afterInput2.length &&
      keys.every((k) => afterMap.has(k)),
    spatial,
    spatialChangesFound: spatial.some((s) => s.changedSamples > 0),
  };
}
