import { describe, expect, it } from "vitest";
import {
  ECOLOGICAL_EVENT_SCHEMA,
  InMemoryEventSink,
  buildObservedFoodWeb,
  canonicalEventString,
  energyLedger,
  filterEvents,
  selectHuntEvents,
  validateEvent,
  type EcologicalEvent,
  type EcologicalObservation,
} from "../../simulation/ecology/observability";

function observation(partial: Partial<EcologicalObservation> = {}): EcologicalObservation {
  return {
    type: "HUNT_ATTEMPT",
    tick: 1,
    entityIds: [1, 2],
    source: "test:unit",
    payload: {
      outcome: "SUCCESS",
      predatorId: 1,
      preyId: 2,
      predatorSpeciesId: 10,
      preySpeciesId: 20,
      successChance: 0.5,
      energyTransferred: 12,
      attemptCost: 12,
      burstCostPredator: 1,
      burstCostPrey: 2,
      preyDeathCorrelationId: "hunt:1:0:death",
    },
    ...partial,
  };
}

function makeEvent(overrides: Partial<EcologicalEvent> = {}): EcologicalEvent {
  const event: EcologicalEvent = {
    eventId: "run:0000000001:00000000",
    eventType: "HUNT_ATTEMPT",
    schemaVersion: ECOLOGICAL_EVENT_SCHEMA,
    simulationId: "sim",
    experimentId: "exp",
    runId: "run",
    tick: 1,
    simulationTime: 1,
    simulationYear: 0,
    category: "OBSERVED",
    entityIds: [1, 2],
    payload: {
      outcome: "SUCCESS",
      predatorId: 1,
      preyId: 2,
      predatorSpeciesId: 10,
      preySpeciesId: 20,
      successChance: 0.5,
      energyTransferred: 12,
      attemptCost: 12,
      preyDeathCorrelationId: "hunt:1:0:death",
    },
    source: "test:unit",
    correlationId: "hunt:1:0",
    metadata: { completeness: "COMPLETE", sampled: false, engineDerived: true },
    ...overrides,
  };
  return event;
}

const SINK_CONFIG = { simulationId: "sim", experimentId: "exp", runId: "run" };

describe("E2.3 event schema", () => {
  it("accepts a well-formed event and rejects malformed ones", () => {
    expect(validateEvent(makeEvent()).ok).toBe(true);
    expect(validateEvent({ ...makeEvent(), schemaVersion: "v0" }).ok).toBe(false);
    expect(validateEvent({ ...makeEvent(), tick: -1 }).ok).toBe(false);
    expect(validateEvent({ ...makeEvent(), entityIds: [1.5] }).ok).toBe(false);
    expect(validateEvent({ ...makeEvent(), payload: { ...makeEvent().payload, successChance: NaN } }).ok).toBe(false);
    const withoutField = { ...makeEvent(), payload: { ...makeEvent().payload } } as Record<string, unknown>;
    delete (withoutField.payload as Record<string, unknown>).successChance;
    expect(validateEvent(withoutField).ok).toBe(false);
  });

  it("freezes events and their nested structures", () => {
    const sink = new InMemoryEventSink(SINK_CONFIG);
    sink.record(observation());
    const event = sink.eventsSnapshot()[0];
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.payload)).toBe(true);
    expect(Object.isFrozen(event.entityIds)).toBe(true);
    expect(Object.isFrozen(event.metadata)).toBe(true);
  });

  it("assigns deterministic unique IDs and run/tick identity", () => {
    const a = new InMemoryEventSink(SINK_CONFIG);
    const b = new InMemoryEventSink(SINK_CONFIG);
    for (const sink of [a, b]) {
      sink.record(observation({ tick: 7 }));
      sink.record(observation({ tick: 7, type: "DEATH", payload: { cause: "PREDATION", speciesId: 2, energy: 1, age: 3 } }));
    }
    const ea = a.eventsSnapshot();
    const eb = b.eventsSnapshot();
    expect(ea.map((e) => e.eventId)).toEqual(eb.map((e) => e.eventId));
    expect(new Set(ea.map((e) => e.eventId)).size).toBe(2);
    expect(ea[0].eventId).toContain("run:0000000007:");
    expect(ea[0].simulationTime).toBe(7);
    expect(ea[0].simulationYear).toBe(0);
  });
});

describe("E2.3 logger policy", () => {
  it("refuses to sample critical event types", () => {
    expect(() => new InMemoryEventSink({ ...SINK_CONFIG, sampleRates: { HUNT_ATTEMPT: 0.5 } })).toThrow(
      /critical event type cannot be sampled/,
    );
  });

  it("declares PARTIAL when non-critical events are sampled", () => {
    const sink = new InMemoryEventSink({
      ...SINK_CONFIG,
      sampleRates: { RESOURCE_REGENERATION: 0 },
      samplingSeed: 5,
    });
    sink.record(observation({ type: "RESOURCE_REGENERATION", payload: { cellX: 1, cellY: 1, mode: "active", stockBefore: 0.1, stockAfter: 0.2, regrowth: 0.1 } }));
    sink.record(observation());
    expect(sink.eventsSnapshot().some((e) => e.eventType === "RESOURCE_REGENERATION")).toBe(false);
    expect(sink.eventsSnapshot().some((e) => e.eventType === "HUNT_ATTEMPT")).toBe(true);
    expect(sink.summary().completeness).toBe("PARTIAL");
    expect(sink.summary().droppedNonCritical).toBe(1);
  });

  it("bounds only non-critical events and never drops critical ones", () => {
    const sink = new InMemoryEventSink({ ...SINK_CONFIG, maxNonCriticalEvents: 2 });
    for (let i = 0; i < 6; i++) {
      sink.record(observation({ type: "RESOURCE_REGENERATION", payload: { cellX: i, cellY: 0, mode: "active", stockBefore: 0, stockAfter: 0.1, regrowth: 0.1 } }));
    }
    for (let i = 0; i < 3; i++) sink.record(observation({ tick: 2 }));
    expect(sink.summary().byType.RESOURCE_REGENERATION).toBe(2);
    expect(sink.summary().byType.HUNT_ATTEMPT).toBe(3);
    expect(sink.summary().droppedNonCritical).toBe(4);
    expect(sink.summary().criticalDropped).toBe(0);
    expect(sink.summary().completeness).toBe("PARTIAL");
  });

  it("exports canonical JSONL and stable hashes", () => {
    const sink = new InMemoryEventSink(SINK_CONFIG);
    sink.record(observation());
    const jsonl = sink.toJSONL();
    expect(jsonl.split("\n").filter(Boolean)).toHaveLength(1);
    expect(JSON.parse(jsonl.trim()).eventId).toBe(sink.eventsSnapshot()[0].eventId);
    expect(canonicalEventString({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

describe("E2.3 derived views (no fabricated events)", () => {
  it("exposes hunt attempt/success/failure/predation as views of one record", () => {
    const sink = new InMemoryEventSink(SINK_CONFIG);
    sink.record(observation({ tick: 1, correlationId: "h1", payload: { ...observation().payload, outcome: "SUCCESS" } }));
    sink.record(observation({ tick: 2, correlationId: "h2", payload: { ...observation().payload, outcome: "FAILURE", energyTransferred: 0, preyDeathCorrelationId: null } }));
    const events = sink.eventsSnapshot();
    expect(events).toHaveLength(2);
    expect(selectHuntEvents(events, "HUNT_ATTEMPT")).toHaveLength(2);
    expect(selectHuntEvents(events, "HUNT_SUCCESS")).toHaveLength(1);
    expect(selectHuntEvents(events, "HUNT_FAILURE")).toHaveLength(1);
    expect(selectHuntEvents(events, "PREDATION")).toHaveLength(1);
    expect(selectHuntEvents(events, "HUNT_ATTEMPT")[0].eventType).toBe("HUNT_ATTEMPT");
  });

  it("builds energy ledger and food web only from observed payloads", () => {
    const sink = new InMemoryEventSink(SINK_CONFIG);
    sink.record(observation());
    const events = sink.eventsSnapshot();
    const ledger = energyLedger(events);
    expect(ledger.every((f) => f.category === "DERIVED")).toBe(true);
    expect(ledger.find((f) => f.flowType === "PREDATION_GAIN")?.amount).toBe(12);
    expect(ledger.find((f) => f.flowType === "HUNT_ATTEMPT_COST")?.amount).toBe(-13);
    const web = buildObservedFoodWeb(events);
    expect(web).toHaveLength(1);
    expect(web[0]).toMatchObject({ predatorSpeciesId: 10, preySpeciesId: 20, attempts: 1, successes: 1, failures: 0, energyTransferred: 12 });
    expect(filterEvents(events, { tick: 99 })).toHaveLength(0);
  });
});
