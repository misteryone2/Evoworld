import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDataset,
  checksumSources,
  e1SourceFiles,
  e2SourceFiles,
  readDataset,
  writeDataset,
  type E2DatasetSource,
} from "../../tools/e2/dataset";
import { makeRun, samplesFromPopulations } from "./fixtures";

const source = (): E2DatasetSource => ({
  phase: "E2.1-test",
  experiment: "test",
  env: { SEEDS: [1, 2], TICKS: 10, SAMPLE_EVERY: 10 },
  scientificReport: { schema: "evoworld.e2.report.v1", note: "test" },
  results: [makeRun("S01", 1, samplesFromPopulations([10, 20]))],
  executedAt: "2026-11-18T00:00:00.000Z",
  codeCommit: "abcdef0",
  workingTreeDirty: true,
  sourceSha256: "a".repeat(64),
  e1SourceSha256: "b".repeat(64),
  runtime: { node: "v22.14.0", v8: "12.4.254.21-node.22" },
  note: "Dataset di test E2.",
});

describe("E2 dataset", () => {
  it("builds a canonical portable payload", () => {
    const dataset = buildDataset(source());
    expect(dataset.schema).toBe("evoworld.e2.dataset.v1");
    expect(dataset.protocol.totalRuns).toBe(1);
    expect(dataset.protocol.reproduction.command).toContain("scripts/e2_population_pilot.experiment.ts");
  });

  it("preserves additive reproduction and auxiliary fields", () => {
    const base = source();
    const dataset = buildDataset({
      ...base,
      reproduction: { env: { E2_REVIEW: "1" }, command: "review-command" },
      auxiliary: { review: { seeds: 12, note: "additive" } },
    });
    expect(dataset.protocol.reproduction.command).toBe("review-command");
    expect(dataset.auxiliary).toEqual({ review: { seeds: 12, note: "additive" } });
  });

  it("writes and verifies gzip archive and manifest", () => {
    const dir = mkdtempSync(join(tmpdir(), "e2-dataset-"));
    try {
      const manifest = writeDataset(dir, "e2-test", source());
      const verified = readDataset(join(dir, manifest.artifact), join(dir, "e2-test.manifest.json"));
      expect(verified.payloadSha256).toBe(manifest.payloadSha256);
      expect(verified.manifest?.archiveSha256).toBe(manifest.archiveSha256);
      expect(verified.dataset.protocol.seeds).toEqual([1, 2]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is byte-reproducible for a fixed source", () => {
    const dir = mkdtempSync(join(tmpdir(), "e2-repro-"));
    try {
      const fixed = source();
      const first = writeDataset(dir, "e2-repro-first", fixed);
      const second = writeDataset(dir, "e2-repro-second", fixed);
      expect(second.payloadSha256).toBe(first.payloadSha256);
      expect(second.archiveSha256).toBe(first.archiveSha256);
      expect(readFileSync(join(dir, second.artifact))).toEqual(readFileSync(join(dir, first.artifact)));
      expect(readFileSync(join(dir, "e2-repro-second.manifest.json"), "utf8")).toContain(first.payloadSha256);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("computes deterministic LF-normalized source checksums", () => {
    const files = [...e2SourceFiles(), ...e1SourceFiles()];
    expect(files.length).toBeGreaterThan(0);
    expect(checksumSources(files)).toBe(checksumSources(files));
    expect(checksumSources(files)).toMatch(/^[a-f0-9]{64}$/);
  });
});
