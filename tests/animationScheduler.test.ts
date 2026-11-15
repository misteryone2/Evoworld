import { describe, it, expect } from "vitest";
import { shouldDrawCreatures, ANIMATION_ONLY_MIN_INTERVAL_MS } from "../lib/animationScheduler";
import { createMotionBuffer, ingestMotionFrame, motionAlpha } from "../lib/motionInterpolation";
import { createLivingState, stepLiving, livingPresence } from "../lib/livingBehavior";

describe("v1.10.5 consolidamento — il ridisegno prosegue in pausa", () => {
  it("con dati nuovi si ridisegna rispettando l'intervallo di costo", () => {
    expect(shouldDrawCreatures({ dataDirty: true, drawnCount: 10, nowMs: 100, lastDrawAt: 100, costIntervalMs: 0 })).toBe(true);
    expect(shouldDrawCreatures({ dataDirty: true, drawnCount: 10, nowMs: 110, lastDrawAt: 100, costIntervalMs: 33 })).toBe(false);
    expect(shouldDrawCreatures({ dataDirty: true, drawnCount: 10, nowMs: 140, lastDrawAt: 100, costIntervalMs: 33 })).toBe(true);
  });

  it("senza dati nuovi (pausa) le creature disegnate continuano ad animarsi a circa 30 Hz", () => {
    const base = { dataDirty: false, drawnCount: 50, costIntervalMs: 0 };
    expect(shouldDrawCreatures({ ...base, nowMs: 1000, lastDrawAt: 990 })).toBe(false);
    expect(shouldDrawCreatures({ ...base, nowMs: 1000 + ANIMATION_ONLY_MIN_INTERVAL_MS, lastDrawAt: 1000 })).toBe(true);
    // se il costo impone già 33 ms, o più, non si scende sotto
    expect(shouldDrawCreatures({ ...base, costIntervalMs: 50, nowMs: 1040, lastDrawAt: 1000 })).toBe(false);
  });

  it("senza creature disegnate e senza dati nuovi non si ridisegna (nessun loop inutile)", () => {
    expect(shouldDrawCreatures({ dataDirty: false, drawnCount: 0, nowMs: 5000, lastDrawAt: 0, costIntervalMs: 0 })).toBe(false);
  });

  it("in pausa il buffer di movimento resta fermo (nessun tick, nessuna posizione cambiata) mentre il respiro avanza", () => {
    const buf = createMotionBuffer();
    const frame = { tick: 5, planetWidth: 100, planetHeight: 50, organismsId: [1], organismsX: [10], organismsY: [20] };
    expect(ingestMotionFrame(buf, frame, 0)).toBe(true);
    // lo stesso tick ripetuto non cambia nulla: la simulazione è ferma
    expect(ingestMotionFrame(buf, frame, 5000)).toBe(false);
    expect(motionAlpha(buf, 5000)).toBe(1);
    const living = createLivingState(1);
    const phase0 = living.breathPhase;
    for (let t = 0; t < 120; t++) stepLiving(living, 33, 0, 0); // ~4 s di pausa disegnata a 30 Hz
    expect(living.breathPhase).not.toBe(phase0);
    expect(livingPresence(living)).toBeGreaterThan(0.9);
    for (let t = 0; t < 150; t++) stepLiving(living, 33, 0, 0); // oltre i 4-8 s: passa al riposo
    expect(living.rest).toBeGreaterThan(0.5);
  });
});
