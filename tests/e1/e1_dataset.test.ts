/**
 * E1.3 — test degli artefatti scientifici: serializzazione canonica, checksum,
 * assenza di percorsi assoluti/dati personali e integrità del dataset compresso.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPortable,
  buildDataset,
  readDataset,
  sha256,
  stableStringify,
  writeDataset,
  type DatasetSource,
} from "../../tools/e1/dataset";
import type { RunResult } from "../../tools/e1/runner";

function fakeResult(seed: number): RunResult {
  return {
    scenario: "S01_stability_baseline",
    description: "fake",
    seed,
    width: 128,
    height: 128,
    initialPopulation: 150,
    ticks: 900,
    sampleEvery: 50,
    setup: "baseline",
    setupInfo: { kind: "baseline" },
    perturbation: null,
    perturbationReport: null,
    options: undefined,
    completedTicks: 900,
    extinctAt: null,
    elapsedMs: 1234,
    samples: [{ tick: 900, population: 20, occupiedVegetation: 0.5 }],
  } as unknown as RunResult;
}

function source(): DatasetSource {
  return {
    phase: "E1.2-test",
    env: { TICKS: 900, SAMPLE_EVERY: 50, SEEDS: [1, 2] },
    scientificReport: { byScenario: { S01: { runs: 2 } } },
    results: [fakeResult(1), fakeResult(2)],
    executedAt: "2026-01-01T00:00:00.000Z",
    codeCommit: "abc1234",
    workingTreeDirty: false,
    sourceSha256: "0".repeat(64),
    runtime: { node: "v22.14.0", v8: "12.4.254.20" },
  };
}

describe("E1.3 — dataset scientifico riproducibile", () => {
  it("stableStringify è canonica indipendentemente dall'ordine delle chiavi", () => {
    expect(stableStringify({ b: 1, a: { d: 4, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 4 }, b: 1 }));
    expect(stableStringify([undefined, 1, null])).toBe("[null,1,null]");
  });

  it("sha256 è deterministica e sensibile al contenuto", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).not.toBe(sha256("abd"));
    expect(sha256("abc")).toHaveLength(64);
  });

  it("rifiuta percorsi assoluti e email", () => {
    expect(() => assertPortable("C:\\Users\\matti\\file.json")).toThrow();
    expect(() => assertPortable("/home/user/file.json")).toThrow();
    expect(() => assertPortable("mario.rossi@example.com")).toThrow();
    expect(() => assertPortable("E1_PHASE2_OUT=<output>.json")).not.toThrow();
  });

  it("il dataset contiene protocollo, configurazione, risultati, metriche e provenance", () => {
    const dataset = buildDataset(source());
    expect(dataset.schema).toBe("evoworld.e1.dataset.v1");
    expect(dataset.protocol.seeds).toEqual([1, 2]);
    expect(dataset.protocol.ticks).toBe(900);
    expect(dataset.protocol.reproduction.command).toContain("E1_PHASE2_SEEDS=1,2");
    expect(dataset.configuration).toHaveLength(2);
    expect((dataset.configuration[0] as { seed: number }).seed).toBe(1);
    expect(JSON.stringify(dataset.results)).not.toContain("elapsedMs");
    expect(JSON.stringify(dataset.metrics)).toContain("byScenario");
    expect(dataset.provenance.codeCommit).toBe("abc1234");
    expect(dataset.provenance.runtime?.node).toBe("v22.14.0");
    expect(dataset.provenance.executedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("scrive gzip e manifest verificabili senza percorsi assoluti", () => {
    const dir = mkdtempSync(join(tmpdir(), "e1-dataset-test-"));
    try {
      const manifest = writeDataset(dir, "e1-test", source());
      expect(manifest.artifact).toBe("e1-test.json.gz");
      expect(manifest.payloadSha256).toHaveLength(64);
      expect(manifest.archiveSha256).toHaveLength(64);
      expect(manifest.totalRuns).toBe(2);
      const read = readDataset(join(dir, manifest.artifact));
      expect(read.payloadSha256).toBe(manifest.payloadSha256);
      expect(read.dataset.protocol.seeds).toEqual([1, 2]);
      const manifestText = readFileSync(join(dir, "e1-test.manifest.json"), "utf8");
      expect(manifestText).not.toMatch(/[A-Za-z]:[\\/]/);
      expect(manifestText).not.toContain("matti");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
