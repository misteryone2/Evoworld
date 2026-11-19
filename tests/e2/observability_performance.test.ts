import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { World } from "../../simulation/core/world";
import {
  InMemoryEventSink,
  NULL_EVENT_SINK,
  type EcologicalEventSink,
} from "../../simulation/ecology/observability";
import { applySetupWithInfo } from "../../tools/e1/initialConditions";

interface Measurement {
  label: string;
  elapsedMs: number;
  events: number;
  bytes: number;
}

const TICKS = 20;
const REPETITIONS = 7;

function measureOne(seed: number, sink: EcologicalEventSink): Measurement {
  const world = new World({ width: 24, height: 24, seed }, 50, {
    enableAdvancedGenome: true,
    enableGeneEffects: true,
  });
  applySetupWithInfo(world, "mixed");
  world.setEventSink(sink);
  const started = performance.now();
  for (let i = 0; i < TICKS; i++) world.step();
  const elapsedMs = performance.now() - started;
  const events = sink instanceof InMemoryEventSink ? sink.eventsSnapshot().length : 0;
  const bytes = sink instanceof InMemoryEventSink ? Buffer.byteLength(sink.toJSONL(), "utf8") : 0;
  return { label: "", elapsedMs, events, bytes };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function measure(label: string, makeSink: (repetition: number) => EcologicalEventSink): Measurement {
  const trials: Measurement[] = [];
  for (let repetition = 0; repetition < REPETITIONS; repetition++) {
    trials.push(measureOne(101 + repetition, makeSink(repetition)));
  }
  return {
    label,
    elapsedMs: median(trials.map((t) => t.elapsedMs)),
    events: median(trials.map((t) => t.events)),
    bytes: median(trials.map((t) => t.bytes)),
  };
}

describe("E2.3 logging overhead (measured, not threshold-gated)", () => {
  it("measures disabled logging, full logging, low-frequency logging and bounded buffer across repeated trials", () => {
    const full = measure("full", (r) => new InMemoryEventSink({ simulationId: "sim", experimentId: "perf", runId: `full-${r}` }));
    const lowFrequency = measure("low-frequency (DEATH only)", (r) =>
      new InMemoryEventSink({
        simulationId: "sim",
        experimentId: "perf",
        runId: `low-${r}`,
        profile: "partial",
        enabledTypes: ["DEATH"],
        disabledReason: "benchmark: subset profile",
      }),
    );
    const bounded = measure("bounded non-critical buffer", (r) =>
      new InMemoryEventSink({ simulationId: "sim", experimentId: "perf", runId: `bounded-${r}`, maxNonCriticalEvents: 200 }),
    );
    const disabled = measure("disabled", () => NULL_EVENT_SINK);
    const measurements = [disabled, full, lowFrequency, bounded];

    for (const m of measurements) {
      expect(Number.isFinite(m.elapsedMs)).toBe(true);
      expect(m.elapsedMs).toBeGreaterThan(0);
    }
    const ratio = full.elapsedMs / disabled.elapsedMs;
    // Nessuna soglia scientifica: i valori sono riportati nel report e nel pilot.
    expect(Number.isFinite(ratio)).toBe(true);
    expect(full.events).toBeGreaterThan(lowFrequency.events);
    expect(bounded.events).toBeGreaterThan(lowFrequency.events);
    expect(bounded.bytes).toBeLessThan(full.bytes);
    console.log(
      "E2.3 measured overhead (median of",
      REPETITIONS,
      "trials,",
      TICKS,
      "ticks):",
      measurements.map((m) => ({ ...m, elapsedMs: Number(m.elapsedMs.toFixed(1)) })),
      `ratio_full_over_disabled=${ratio.toFixed(2)}`,
    );
  }, 600_000);
});
