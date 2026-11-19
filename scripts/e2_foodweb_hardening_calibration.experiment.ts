/** E2.2.1 — calibrazione Monte Carlo chunked del FPR del test IAAFT. */
import { describe, expect, it } from "vitest";
import { resolveOutputPath, writeExperimentOutput } from "../tools/e1/experiment";
import {
  DEFAULT_SURROGATE_CONFIG,
  type SurrogateConfig,
} from "../tools/e2/surrogateInference";
import {
  evaluateFprCell,
  FPR_ACCEPTANCE,
  QA_ACCEPTANCE,
  runHardenedSurrogateNullTest,
  summarizeFpr,
} from "../tools/e2/inferenceHardening";
import {
  degenerateSeries,
  independentPair,
  pointsFrom,
  type DistributionKind,
  type SeriesOptions,
} from "../tools/e2/syntheticSeries";

const LENGTHS = [100, 160, 271, 512] as const;
const PHIS = [0, 0.25, 0.65, 0.9, 0.95] as const;
const CHUNK_IDS = [
  "main-0", "main-1", "main-2", "main-3", "main-4",
  "mixed-0", "nongauss-0", "ties-0", "degenerate-0",
] as const;
type ChunkId = (typeof CHUNK_IDS)[number];

interface CalibrationCell {
  id: string;
  family: "main_independent" | "different_autocorrelation" | "non_gaussian" | "ties" | "degenerate";
  length: number;
  optionsA: SeriesOptions;
  optionsB: SeriesOptions;
  degenerate?: "constant" | "near-constant" | "tied" | "binary";
  note: string;
}

const cellSeed = (cellId: string, replicate: number): number => {
  let hash = 2166136261 >>> 0;
  for (const character of `${cellId}|${replicate}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const cells: CalibrationCell[] = [
  ...PHIS.flatMap((phi, index) => LENGTHS.map((length): CalibrationCell => ({
    id: `main-phi${phi}-N${length}`,
    family: "main_independent",
    length,
    optionsA: { phi, distribution: "gaussian" },
    optionsB: { phi, distribution: "gaussian" },
    note: `AR(1) gaussiane indipendente, phi=${phi}, N=${length}; chunk main-${index}`,
  }))),
  ...([
    { a: 0.9, b: 0.25 },
    { a: 0.95, b: 0.65 },
    { a: 0.25, b: 0.9 },
    { a: 0.65, b: 0.95 },
  ] as const).flatMap(({ a, b }) => [100, 271].map((length): CalibrationCell => ({
    id: `mixed-phi${a}-${b}-N${length}`,
    family: "different_autocorrelation",
    length,
    optionsA: { phi: a, distribution: "gaussian" },
    optionsB: { phi: b, distribution: "gaussian" },
    note: `Autocorrelazioni diverse X/Y, phi=${a}/${b}, N=${length}`,
  }))),
  ...(["exponential", "discrete"] as DistributionKind[]).flatMap((distribution) =>
    [0.65, 0.95].flatMap((phi) => [160, 271].map((length): CalibrationCell => ({
      id: `nongauss-${distribution}-phi${phi}-N${length}`,
      family: "non_gaussian",
      length,
      optionsA: { phi, distribution, tieFraction: distribution === "discrete" ? 0.5 : 0 },
      optionsB: { phi, distribution, tieFraction: distribution === "discrete" ? 0.5 : 0 },
      note: `Distribuzione non gaussiana ${distribution}, phi=${phi}, N=${length}`,
    })))),
  ...[0.25, 0.65].flatMap((phi) => [160, 271].map((length): CalibrationCell => ({
    id: `ties-phi${phi}-N${length}`,
    family: "ties",
    length,
    optionsA: { phi, distribution: "gaussian", tieFraction: 0.75 },
    optionsB: { phi, distribution: "gaussian", tieFraction: 0.75 },
    note: `Molti valori ripetuti, phi=${phi}, N=${length}`,
  }))),
  ...(["constant", "near-constant", "tied", "binary"] as const).flatMap((kind) => [100, 271].map((length): CalibrationCell => ({
    id: `degenerate-${kind}-N${length}`,
    family: "degenerate",
    length,
    optionsA: { phi: 0, distribution: "gaussian" },
    optionsB: { phi: 0, distribution: "gaussian" },
    degenerate: kind,
    note: `Serie degenere/quasi degenere ${kind}, N=${length}`,
  }))),
];

const cellsForChunk = (chunk: ChunkId): CalibrationCell[] => {
  if (chunk.startsWith("main-")) {
    const index = Number(chunk.split("-")[1]);
    return cells.filter((cell) => cell.family === "main_independent" && PHIS[index] === cell.optionsA.phi);
  }
  const familyByChunk: Record<string, CalibrationCell["family"]> = {
    "mixed-0": "different_autocorrelation",
    "nongauss-0": "non_gaussian",
    "ties-0": "ties",
    "degenerate-0": "degenerate",
  };
  return cells.filter((cell) => cell.family === familyByChunk[chunk]);
};

const pairFor = (cell: CalibrationCell, seed: number) => {
  if (cell.degenerate) {
    const values = degenerateSeries(cell.degenerate, cell.length);
    return { a: values, b: [...values] };
  }
  const pair = independentPair(seed, cell.length, cell.optionsA, cell.optionsB, cell.family);
  return { a: pair.a, b: pair.b };
};

describe("E2.2.1 Monte Carlo FPR calibration", () => {
  it(
    "runs the pre-registered number of independent datasets for each chunk",
    () => {
      const chunk = (process.env.E2_HARDENING_CALIBRATION_CHUNK ?? "") as ChunkId;
      if (!CHUNK_IDS.includes(chunk)) throw new Error(`unknown or missing chunk: ${chunk}`);
      const replicates = Number(process.env.E2_HARDENING_CALIBRATION_REPLICATES ?? "1000");
      const surrogates = Number(process.env.E2_HARDENING_CALIBRATION_SURROGATES ?? "49");
      const iterations = Number(process.env.E2_HARDENING_CALIBRATION_ITERATIONS ?? "12");
      if (!Number.isInteger(replicates) || replicates < 1000) throw new Error("at least 1000 replicates required");
      if (!Number.isInteger(surrogates) || surrogates < 19) throw new Error("invalid surrogate count");
      const config: SurrogateConfig = {
        ...DEFAULT_SURROGATE_CONFIG,
        surrogates,
        iterations,
        seed: 0x5eed1234,
        alpha: QA_ACCEPTANCE.alpha,
        minOverlappingObservations: 30,
      };
      const chunkCells = cellsForChunk(chunk);
      expect(chunkCells.length).toBeGreaterThan(0);
      const results = [] as Array<Record<string, unknown>>;
      for (const cell of chunkCells) {
        const pValues: number[] = [];
        let nonEvaluable = 0;
        let validSurrogateTotal = 0;
        let nonConvergedAccepted = 0;
        const invalidReasonCounts = new Map<string, number>();
        for (let replicate = 0; replicate < replicates; replicate++) {
          const seed = cellSeed(cell.id, replicate);
          const { a, b } = pairFor(cell, seed);
          const test = runHardenedSurrogateNullTest("calibration", seed,
            pointsFrom(a), pointsFrom(b), 20, config);
          if (test.status === "VALUTABILE") {
            pValues.push(test.pValue);
            validSurrogateTotal += test.quality.validSurrogates;
            nonConvergedAccepted += test.quality.nonConvergedAccepted;
          } else {
            nonEvaluable++;
          }
          for (const reason of test.quality.invalidReasonCounts) {
            invalidReasonCounts.set(reason.reason, (invalidReasonCounts.get(reason.reason) ?? 0) + reason.count);
          }
        }
        const summary = summarizeFpr(pValues, QA_ACCEPTANCE.alpha, nonEvaluable, surrogates);
        const verdict = evaluateFprCell(summary);
        results.push({
          cell,
          summary,
          acceptance: verdict,
          meanValidSurrogates: pValues.length === 0 ? 0 : validSurrogateTotal / pValues.length,
          nonConvergedAccepted,
          invalidReasonCounts: [...invalidReasonCounts.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([reason, count]) => ({ reason, count })),
        });
      }
      const output = {
        schema: "evoworld.e2.hardening-calibration-chunk.v1",
        chunk,
        executedAt: process.env.E2_HARDENING_CALIBRATION_EXECUTED_AT ?? new Date().toISOString(),
        runtime: { node: process.version, v8: process.versions.v8 },
        protocol: {
          replicatesPerCell: replicates,
          surrogatesPerTest: surrogates,
          iterations,
          alpha: QA_ACCEPTANCE.alpha,
          qualityGate: QA_ACCEPTANCE,
          acceptanceLimits: FPR_ACCEPTANCE,
          unitOfInference: "independent synthetic dataset, never a tick",
        },
        cells: results,
      };
      const outputPath = resolveOutputPath(process.env.E2_HARDENING_CALIBRATION_OUT);
      writeExperimentOutput(outputPath, output);
      process.stdout.write(`E2.2.1 calibration chunk ${chunk}: ${results.length} cells, output=${outputPath}\n`);
    },
    3_000_000,
  );
});
