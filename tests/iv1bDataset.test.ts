import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "docs", "research", "iv1b");
const datasetPath = join(dir, "dataset.raw.json");
const analysisPath = join(dir, "analysis.json");

type Run = {
  population: number; config: string; seed: number; measuredTicks: number; warmupTicks: number;
  measuredWallMs: number; measuredCpuMs?: number; tickMs: number[];
  events: {
    recorded: number; attempted: number; lost: number; measuredTicks: number;
    recordedPerTick: number; eventsPerSecond: number; byType: Record<string, number>;
    attemptsByType: Record<string, number>; measuredWallMs: number;
  } | null;
  warmup: { wallMs: number; eventsRecorded: number | null };
  totals: { wallMs: number; eventsRecorded: number | null };
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const dataset = JSON.parse(readFileSync(datasetPath, "utf8")) as {
  schema: string;
  protocol: { measuredTicks: number; warmupTicks: number; seeds: number[]; populations: number[]; configs: string[] };
  runs: Run[];
  aggregates: Array<{ population: number; config: string; recordedEvents: number | null; measuredTicks: number; recordedPerTick: number | null }>;
};

describe("IV1-B-R1 coerenza del dataset misurato", () => {
  it("ha la matrice completa e finestre esplicite", () => {
    expect(dataset.schema).toBe("evoworld.iv1b.dataset.raw.v2");
    expect(dataset.runs).toHaveLength(120);
    expect(dataset.protocol.measuredTicks).toBe(20);
    expect(dataset.protocol.warmupTicks).toBe(5);
  });

  for (const pop of dataset.protocol.populations) {
    for (const cfg of dataset.protocol.configs) {
      it(`cella ${pop}/${cfg}: denominatori e contatori coerenti`, () => {
        const runs = dataset.runs.filter((r) => r.population === pop && r.config === cfg);
        expect(runs).toHaveLength(dataset.protocol.seeds.length);
        for (const r of runs) {
          expect(r.measuredTicks).toBe(dataset.protocol.measuredTicks);
          expect(r.tickMs).toHaveLength(dataset.protocol.measuredTicks);
          expect(r.measuredWallMs).toBeGreaterThan(0);
          expect(r.warmup.wallMs).toBeGreaterThan(0);
          expect(r.totals.wallMs).toBeCloseTo(r.warmup.wallMs + r.measuredWallMs, 0);
          if (!r.events) continue;
          expect(r.events.measuredTicks).toBe(r.measuredTicks);
          expect(r.events.recordedPerTick).toBeCloseTo(r.events.recorded / r.measuredTicks, 3);
          expect(sum(Object.values(r.events.byType))).toBe(r.events.recorded);
          expect(sum(Object.values(r.events.attemptsByType))).toBe(r.events.attempted);
          const expectedEps = (r.events.recorded / r.measuredWallMs) * 1000;
          // measuredWallMs è arrotondato a 0,01 ms: usare tolleranza relativa.
          expect(Math.abs(r.events.eventsPerSecond - expectedEps) / expectedEps).toBeLessThan(1e-4);
          expect(r.events.lost).toBeGreaterThanOrEqual(0);
          expect(r.totals.eventsRecorded ?? 0).toBeGreaterThanOrEqual(r.events.recorded);
        }
        const agg = dataset.aggregates.find((a) => a.population === pop && a.config === cfg)!;
        const total = sum(runs.map((r) => r.events?.recorded ?? 0));
        if (runs.some((r) => r.events)) expect(agg.recordedEvents).toBe(total);
        else expect(agg.recordedEvents).toBeNull();
        expect(agg.measuredTicks).toBe(dataset.protocol.measuredTicks);
        if (total > 0) expect(agg.recordedPerTick).toBeCloseTo(total / (runs.length * rTicks(runs)), 3);
      });
    }
  }

  it("l'analisi riconcilia costo/evento con lo stesso denominatore", () => {
    if (!existsSync(analysisPath)) throw new Error("analysis.json mancante: eseguire scripts/iv1bAnalyze.mjs");
    const analysis = JSON.parse(readFileSync(analysisPath, "utf8")) as {
      reconciliation: { costPerEvent: Array<{
        population: number; stepOverheadMs: number; eventsRecordedMeasuredWindow: number;
        measuredTicksPerSeed: number; totalMeasuredTicks: number; eventsPerTick: number;
        microsecondsPerEvent: number;
      }> };
    };
    expect(analysis.reconciliation.costPerEvent).toHaveLength(dataset.protocol.populations.length);
    for (const c of analysis.reconciliation.costPerEvent) {
      expect(c.totalMeasuredTicks).toBe(dataset.protocol.seeds.length * dataset.protocol.measuredTicks);
      expect(c.eventsPerTick).toBeCloseTo(c.eventsRecordedMeasuredWindow / c.totalMeasuredTicks, 3);
      expect(c.microsecondsPerEvent).toBeCloseTo((c.stepOverheadMs * 1000) / c.eventsPerTick, 3);
    }
  });
});

function rTicks(runs: Run[]): number {
  return runs[0]?.measuredTicks ?? 1;
}

