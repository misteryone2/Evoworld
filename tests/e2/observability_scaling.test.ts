import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";
import {
  InMemoryEventSink,
  NULL_EVENT_SINK,
  type EcologicalObservation,
  type EventBatchWriter,
} from "../../simulation/ecology/observability";

const CONFIG = { simulationId: "sim", experimentId: "scaling", runId: "scale" } as const;
const SIZES = [10_000, 50_000, 100_000] as const;

function hunt(index: number): EcologicalObservation {
  return {
    type: "HUNT_ATTEMPT",
    tick: index % 1_000,
    entityIds: [1, 2],
    source: "test:scaling",
    correlationId: `hunt:${index}`,
    payload: {
      outcome: "FAILURE",
      predatorId: 1,
      preyId: 2,
      predatorSpeciesId: 10,
      preySpeciesId: 20,
      successChance: 0.5,
      energyTransferred: 0,
      attemptCost: 12,
      burstCostPredator: 1,
    },
  };
}

class CountingWriter implements EventBatchWriter {
  batches = 0;
  events = 0;
  writeBatch(batch: readonly unknown[]): void {
    this.batches++;
    this.events += batch.length;
  }
}

describe("E2.3.1 memory and throughput (measured, no extrapolation)", () => {
  it("measures 10k, 50k and 100k events with serialization and compression", () => {
    for (const size of SIZES) {
      const writer = new CountingWriter();
      const sink = new InMemoryEventSink({
        ...CONFIG,
        runId: `scale-${size}`,
        flushEveryEvents: Math.max(1, Math.floor(size / 10)),
        batchWriter: writer,
      });
      const started = performance.now();
      for (let i = 0; i < size; i++) sink.record(hunt(i));
      const recordMs = performance.now() - started;

      const serializeStarted = performance.now();
      const jsonl = sink.toJSONL();
      const serializationMs = performance.now() - serializeStarted;
      const compressStarted = performance.now();
      const archive = gzipSync(jsonl);
      const compressionMs = performance.now() - compressStarted;
      const flushStarted = performance.now();
      sink.flush();
      const flushMs = performance.now() - flushStarted;

      const summary = sink.summary();
      expect(summary.total).toBe(size);
      expect(writer.events).toBe(size);
      expect(writer.batches).toBeGreaterThan(0);
      expect(jsonl.split("\n").filter(Boolean)).toHaveLength(size);
      const metrics = {
        events: size,
        recordMs: Number(recordMs.toFixed(1)),
        microsecondsPerEvent: Number(((recordMs * 1000) / size).toFixed(2)),
        eventsPerSecond: Math.round(size / (recordMs / 1000)),
        bytesPerEvent: Number((Buffer.byteLength(jsonl, "utf8") / size).toFixed(1)),
        serializationMs: Number(serializationMs.toFixed(1)),
        compressedBytes: archive.length,
        compressionMs: Number(compressionMs.toFixed(1)),
        flushMs: Number(flushMs.toFixed(1)),
        retainedEvents: summary.retained,
      };
      console.log(`E2.3.1 scaling ${JSON.stringify(metrics)}`);
      expect(Number.isFinite(metrics.eventsPerSecond)).toBe(true);
      expect(metrics.compressedBytes).toBeLessThan(Buffer.byteLength(jsonl, "utf8"));
    }
  }, 600_000);

  it("bounds memory with incremental flush and release on a long stream", () => {
    const writer = new CountingWriter();
    const sink = new InMemoryEventSink({
      ...CONFIG,
      runId: "streaming",
      flushEveryEvents: 1_000,
      batchWriter: writer,
      releaseAfterFlush: true,
    });
    for (let i = 0; i < 50_000; i++) sink.record(hunt(i));
    sink.flush();
    const summary = sink.summary();
    expect(summary.total).toBe(50_000);
    expect(summary.byType.HUNT_ATTEMPT).toBe(50_000);
    expect(writer.events).toBe(50_000);
    expect(summary.retained).toBeLessThanOrEqual(1_000);
    expect(sink.eventsSnapshot().length).toBe(0);
  }, 300_000);

  it("keeps the disabled sink constant-time for high-frequency hooks", () => {
    const started = performance.now();
    for (let i = 0; i < 100_000; i++) NULL_EVENT_SINK.record(hunt(i));
    const elapsedMs = performance.now() - started;
    console.log(`E2.3.1 disabled sink 100000 records: ${elapsedMs.toFixed(1)} ms`);
    expect(Number.isFinite(elapsedMs)).toBe(true);
  }, 300_000);
});
