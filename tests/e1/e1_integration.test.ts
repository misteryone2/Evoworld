/**
 * E1 — test d'integrazione dell'output sperimentale.
 *
 * Verificano sul filesystem reale la creazione del JSON, delle directory
 * mancanti, l'override E1_OUT, il percorso predefinito portabile e la
 * riproducibilià scientifica (i soli tempi di esecuzione sono esclusi).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectResults, resolveOutputPath, stripVariableData, writeExperimentOutput } from "../../tools/e1/experiment";
import { runScenario, type ScenarioSpec } from "../../tools/e1/runner";
import { buildPhase2Scenarios } from "../../tools/e1/scenarios";

const small: ScenarioSpec = {
  id: "TEST_integration",
  description: "integration output test",
  seed: 11,
  width: 32,
  height: 32,
  population: 30,
  ticks: 10,
  sampleEvery: 2,
  setup: "baseline",
};

describe("E1 harness — integrazione output", () => {
  it("crea il file JSON e le directory genitrici mancanti", () => {
    const root = mkdtempSync(join(tmpdir(), "e1-integration-"));
    try {
      const target = join(root, "deep", "nested", "results.json");
      expect(existsSync(target)).toBe(false);
      writeExperimentOutput(target, { phase: "E1.2", runs: 2, values: [1, 2, 3] });
      expect(existsSync(target)).toBe(true);
      expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({
        phase: "E1.2",
        runs: 2,
        values: [1, 2, 3],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rispetta E1_OUT quando impostato", () => {
    const root = mkdtempSync(join(tmpdir(), "e1-out-"));
    const previous = process.env.E1_OUT;
    try {
      const target = join(root, "custom", "e1.json");
      process.env.E1_OUT = target;
      expect(resolveOutputPath(process.env.E1_OUT)).toBe(target);
      writeExperimentOutput(resolveOutputPath(process.env.E1_OUT), { out: process.env.E1_OUT });
      expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({ out: target });
    } finally {
      if (previous === undefined) delete process.env.E1_OUT;
      else process.env.E1_OUT = previous;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("usa un percorso predefinito portabile nella temp di sistema", () => {
    expect(resolveOutputPath(undefined)).toBe(join(tmpdir(), "e1-results.json"));
    expect(resolveOutputPath("")).toBe(join(tmpdir(), "e1-results.json"));
    expect(resolveOutputPath("   ")).toBe(join(tmpdir(), "e1-results.json"));
    expect(resolveOutputPath("C:\\custom\\e1.json")).toBe("C:\\custom\\e1.json");
  });

  it("produce output scientifico identico a parità di condizioni, esclusi i tempi", () => {
    const root = mkdtempSync(join(tmpdir(), "e1-repro-"));
    try {
      const first = join(root, "a", "results.json");
      const second = join(root, "b", "results.json");
      const resultsA = collectResults([small, { ...small, id: "TEST_integration_2", seed: 12 }]);
      const resultsB = collectResults([small, { ...small, id: "TEST_integration_2", seed: 12 }]);
      writeExperimentOutput(first, { env: { E1_OUT: first }, results: resultsA });
      writeExperimentOutput(second, { env: { E1_OUT: second }, results: resultsB });

      const rawA = JSON.parse(readFileSync(first, "utf8"));
      const rawB = JSON.parse(readFileSync(second, "utf8"));
      // I percorsi e i tempi sono dati variabili: tutto il resto deve coincidere.
      expect(rawA.results[0]).toHaveProperty("elapsedMs");
      const scientificA = stripVariableData({ results: rawA.results });
      const scientificB = stripVariableData({ results: rawB.results });
      expect(scientificA).toEqual(scientificB);
      expect((scientificA as { results: unknown[] }).results[0]).not.toHaveProperty("elapsedMs");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("la fase 2 richiede almeno 10 seed e include i controlli habitat", () => {
    const seeds = Array.from({ length: 11 }, (_, i) => i + 1);
    const specs = buildPhase2Scenarios({ ticks: 8, sampleEvery: 1, seeds });
    expect(seeds.length).toBeGreaterThanOrEqual(10);
    expect(specs).toHaveLength(11 * 7);
    expect(new Set(specs.map((s) => s.id)).size).toBe(7);
    expect(specs.some((s) => s.setup === "poorPositionRichResources")).toBe(true);
    expect(specs.some((s) => s.setup === "richPositionPoorResources")).toBe(true);
  });

  it("ripetere una corsa con lo stesso seed produce campioni identici", () => {
    const a = runScenario(small);
    const b = runScenario(small);
    expect(stripVariableData(a.samples)).toEqual(stripVariableData(b.samples));
    expect(stripVariableData(a.setupInfo)).toEqual(stripVariableData(b.setupInfo));
  });
});
