import { describe, expect, it } from "vitest";
import type { EventSinkSummary } from "../simulation/ecology/observability";
import {
  counterLost, deltaCounters, deltaWindow, eventsPerSecond, eventsPerTick,
  microsecondsPerEvent, snapshotCounters, type CounterSnapshot,
} from "../scripts/iv1bMetrics";

const counters = (over: Partial<CounterSnapshot> = {}): CounterSnapshot => ({
  attempted: 0, recorded: 0, sampled: 0, droppedNonCritical: 0, criticalDropped: 0,
  lostByTypeSum: 0, flushedBatches: 0, flushedEvents: 0, flushErrors: 0,
  byType: {}, attemptsByType: {}, lostByType: {}, ...over,
});

describe("IV1-B-R1 metriche con finestre esplicite", () => {
  it("esclude il warm-up dal delta della finestra misurata", () => {
    const measured = deltaWindow(
      { wallMs: 1000, cpuUs: 10_000, heapBytes: 1_000_000 },
      { wallMs: 1400, cpuUs: 14_000, heapBytes: 1_500_000 },
    );
    expect(measured.wallMs).toBe(400);
    expect(measured.cpuMs).toBe(4);
    expect(measured.heapGrowthKB).toBeCloseTo(500_000 / 1024, 6);
  });

  it("sottrae i contatori del warm-up e preserva i negativi come segnale di errore", () => {
    const before = counters({ attempted: 100, recorded: 90, byType: { A: 90 }, attemptsByType: { A: 100 } });
    const after = counters({ attempted: 250, recorded: 230, byType: { A: 220, B: 10 }, attemptsByType: { A: 240, B: 10 } });
    const d = deltaCounters(after, before);
    expect(d.attempted).toBe(150);
    expect(d.recorded).toBe(140);
    expect(d.byType).toEqual({ A: 130, B: 10 });
    expect(deltaCounters(before, after).recorded).toBe(-140);
  });

  it("usa il numero di tick misurati come denominatore di eventi/tick", () => {
    // 36.300.058 eventi su 5 seed x 20 tick = 100 tick misurati.
    expect(eventsPerTick(36_300_058, 100)).toBeCloseTo(363_000.58, 6);
    expect(eventsPerTick(36_300_058, 20)).toBeCloseTo(1_815_002.9, 6);
    expect(eventsPerTick(10, 0)).toBeNull();
  });

  it("ricalcola il costo per evento con lo stesso denominatore della popolazione 10000", () => {
    // L'overhead e la media dei 5 seed; gli eventi sono il totale dei 5 seed.
    const recordedPerTick = eventsPerTick(36_300_058, 100)!;
    const us = microsecondsPerEvent(458.96, recordedPerTick, 1)!;
    expect(us).toBeCloseTo(1.2641, 3);
    // Usare 20 tick come denominatore (l'errore del report v1) dà 0,253 us/evento:
    // il valore pubblicato 6,4 us non è riproducibile dal dataset grezzo.
    const wrong = microsecondsPerEvent(458.96, 36_300_058, 20)!;
    expect(wrong).toBeCloseTo(0.2529, 3);
    expect(wrong * 5).toBeCloseTo(us, 6);
  });

  it("calcola eventi/s sulla finestra misurata, non sul wall cumulativo", () => {
    expect(eventsPerSecond(1000, 500)).toBe(2000);
    expect(eventsPerSecond(1000, 1000)).toBe(1000);
    expect(eventsPerSecond(1000, 0)).toBeNull();
  });

  it("conta le perdite sommando tutte le sorgenti", () => {
    const s = counters({ droppedNonCritical: 2, criticalDropped: 1, lostByTypeSum: 3 });
    expect(counterLost(s)).toBe(6);
  });

  it("snapshotCounters estrae i totali dal summary reale", () => {
    const s = snapshotCounters({
      total: 42, sampled: 1, droppedNonCritical: 2, criticalDropped: 0,
      lostByType: { X: 3 }, flushedBatches: 4, flushedEvents: 40, flushErrors: 0,
      byType: { X: 42 }, attemptsByType: { X: 45 },
    } as unknown as EventSinkSummary);
    expect(s.recorded).toBe(42);
    expect(s.attempted).toBe(45);
    expect(s.lostByTypeSum).toBe(3);
    expect(counterLost(s)).toBe(5);
  });
});

