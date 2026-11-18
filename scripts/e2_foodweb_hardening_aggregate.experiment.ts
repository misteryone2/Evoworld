/** E2.2.1 — aggrega i chunk di calibrazione e applica i limiti pre-registrati. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveOutputPath, writeExperimentOutput } from "../tools/e1/experiment";
import {
  FPR_ACCEPTANCE,
  QA_ACCEPTANCE,
  wilsonInterval,
} from "../tools/e2/inferenceHardening";

const CHUNK_FILES = [
  "calibration-main-0.json",
  "calibration-main-1.json",
  "calibration-main-2.json",
  "calibration-main-3.json",
  "calibration-main-4.json",
  "calibration-mixed-0.json",
  "calibration-nongauss-0.json",
  "calibration-ties-0.json",
  "calibration-degenerate-0.json",
] as const;

interface ChunkCell {
  cell: {
    id: string;
    family: string;
    length: number;
    optionsA: { phi?: number; distribution?: string };
    optionsB: { phi?: number; distribution?: string };
    note: string;
  };
  summary: {
    tests: number;
    rejections: number;
    falsePositiveRate: number;
    ci95: { low: number; high: number };
    meanPValue: number;
    ksDistanceUniform: number;
    nonEvaluableRate: number;
  };
  acceptance: { accepted: boolean; reasons: string[] };
  meanValidSurrogates: number;
  nonConvergedAccepted: number;
  invalidReasonCounts: Array<{ reason: string; count: number }>;
  totalReplicates: number;
}

const nonEvaluableCount = (row: ChunkCell): number =>
  Math.max(0, row.totalReplicates - row.summary.tests);

const weightedMean = (rows: ChunkCell[], pick: (row: ChunkCell) => number): number => {
  const weight = rows.reduce((sum, row) => sum + row.summary.tests, 0);
  return weight === 0 ? 0 : rows.reduce((sum, row) => sum + pick(row) * row.summary.tests, 0) / weight;
};

const summarizeGroup = (rows: ChunkCell[], label: string) => {
  const tests = rows.reduce((sum, row) => sum + row.summary.tests, 0);
  const rejections = rows.reduce((sum, row) => sum + row.summary.rejections, 0);
  const nonEvaluable = rows.reduce((sum, row) => sum + nonEvaluableCount(row), 0);
  return {
    label,
    cells: rows.length,
    independentDatasets: tests,
    rejections,
    nonEvaluable,
    falsePositiveRate: tests === 0 ? 0 : rejections / tests,
    ci95: wilsonInterval(rejections, tests),
    meanPValue: weightedMean(rows, (row) => row.summary.meanPValue),
    worstKsDistance: rows.length === 0 ? 1 : Math.max(...rows.map((row) => row.summary.ksDistanceUniform)),
    nonEvaluableRate: tests + nonEvaluable === 0 ? 1 : nonEvaluable / (tests + nonEvaluable),
  };
};

describe("E2.2.1 calibration aggregation", () => {
  it(
    "aggregates all chunks and classifies failed cells without relaxing thresholds",
    () => {
      const dir = resolveOutputPath(process.env.E2_HARDENING_AGGREGATE_INPUT_DIR);
      const cells: ChunkCell[] = [];
      const sources: Array<{ artifact: string; sha256: string; chunks: string; cells: number }> = [];
      for (const file of CHUNK_FILES) {
        const path = join(dir, file);
        const text = readFileSync(path, "utf8");
        const chunk = JSON.parse(text) as { chunk: string; cells: Omit<ChunkCell, "totalReplicates">[]; protocol: { replicatesPerCell: number } };
        expect(chunk.cells.length).toBeGreaterThan(0);
        const chunkCells = chunk.cells.map((cell) => ({ ...cell, totalReplicates: chunk.protocol.replicatesPerCell }));
        for (const cell of chunkCells) {
          expect(cell.summary.tests + nonEvaluableCount(cell)).toBe(chunk.protocol.replicatesPerCell);
        }
        cells.push(...chunkCells);
        sources.push({
          artifact: basename(path),
          sha256: createHash("sha256").update(text).digest("hex"),
          chunks: chunk.chunk,
          cells: chunk.cells.length,
        });
      }

      const classified = cells.map((row) => {
        const phi = row.cell.optionsA.phi ?? 0;
        const highAutocorrelation = phi >= 0.9;
        const nonEvaluableExcess = row.summary.nonEvaluableRate > FPR_ACCEPTANCE.maximumNonEvaluableRate;
        const expectedNonValutabile = row.cell.family === "degenerate";
        const disposition = expectedNonValutabile
          ? "EXPECTED_NON_VALUTABILE"
          : row.acceptance.accepted
            ? "ACCEPTED"
            : highAutocorrelation && nonEvaluableExcess
              ? "DEGRADED_NON_VALUTABILE"
              : "REJECTED";
        return {
          ...row,
          highAutocorrelation,
          disposition,
          phi,
          dispositionNote: disposition === "EXPECTED_NON_VALUTABILE"
            ? "Cella degenere/quasi degenere per disegno: NON_VALUTABILE atteso, non contribuisce alla calibrazione applicabile."
            : disposition === "DEGRADED_NON_VALUTABILE"
              ? "QA non soddisfatta per alta autocorrelazione: il regime resta NON_VALUTABILE e non contribuisce alla calibrazione applicabile."
              : disposition === "REJECTED"
                ? "Limiti pre-registrati non soddisfatti: richiede indagine, non interpretazione."
                : "Limiti pre-registrati soddisfatti.",
        };
      });

      const accepted = classified.filter((row) => row.disposition === "ACCEPTED");
      const degraded = classified.filter((row) => row.disposition === "DEGRADED_NON_VALUTABILE");
      const expected = classified.filter((row) => row.disposition === "EXPECTED_NON_VALUTABILE");
      const rejected = classified.filter((row) => row.disposition === "REJECTED");
      const families = [...new Set(classified.map((row) => row.cell.family))];
      const output = {
        schema: "evoworld.e2.hardening-calibration-aggregate.v1",
        executedAt: process.env.E2_HARDENING_AGGREGATE_EXECUTED_AT ?? new Date().toISOString(),
        runtime: { node: process.version, v8: process.versions.v8 },
        sources,
        protocol: {
          alpha: QA_ACCEPTANCE.alpha,
          qualityGate: QA_ACCEPTANCE,
          acceptanceLimits: FPR_ACCEPTANCE,
          minIndependentDatasetsPerCell: 1000,
          chunkCount: CHUNK_FILES.length,
          rule: "Nessuna soglia viene rilassata dopo aver visto i risultati; le celle NON_VALUTABILE sono separate, non fatte passare.",
        },
        cells: classified,
        overall: summarizeGroup(accepted, "accepted cells only"),
        allCells: summarizeGroup(classified, "all cells"),
        byFamily: families.map((family) =>
          summarizeGroup(accepted.filter((row) => row.cell.family === family), family)),
        highPhi: summarizeGroup(classified.filter((row) => row.highAutocorrelation), "phi>=0.9"),
        counts: {
          cells: classified.length,
          accepted: accepted.length,
          degradedNonValutabile: degraded.length,
          expectedNonValutabile: expected.length,
          rejected: rejected.length,
        },
        degradedCellIds: degraded.map((row) => row.cell.id),
        expectedNonValutabileCellIds: expected.map((row) => row.cell.id),
        rejectedCellIds: rejected.map((row) => row.cell.id),
      };
      const outputPath = resolveOutputPath(process.env.E2_HARDENING_AGGREGATE_OUT);
      writeExperimentOutput(outputPath, output);
      process.stdout.write(`E2.2.1 calibration aggregate: ${classified.length} cells, output=${outputPath}\n`);
      process.stdout.write(`${JSON.stringify(output.counts, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify(output.overall, null, 2)}\n`);
    },
    1_800_000,
  );
});
