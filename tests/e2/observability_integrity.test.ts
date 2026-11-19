import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CRITICAL_EVENT_TYPES,
  InMemoryEventSink,
  energyLedger,
  energyLedgerSummary,
  validateEvent,
  verifyEnergyConservation,
  verifyPredationCorrelations,
  type EcologicalEvent,
  type EcologicalObservation,
  type EventBatchWriter,
} from "../../simulation/ecology/observability";
import {
  buildObservabilityManifest,
  resolveSinkConfig,
  runObservability,
  type ObservabilityRunSpec,
} from "../../tools/e2/observabilityRunner";
import { exportObservabilityDataset } from "../../tools/e2/observabilityPipeline";

const BASE = { simulationId: "sim", experimentId: "exp", runId: "run" } as const;

function hunt(overrides: Partial<EcologicalObservation> = {}): EcologicalObservation {
  return {
    type: "HUNT_ATTEMPT",
    tick: 1,
    entityIds: [1, 2],
    source: "test:integrity",
    correlationId: "hunt:1:0",
    payload: {
      outcome: "SUCCESS",
      predatorId: 1,
      preyId: 2,
      predatorSpeciesId: 10,
      preySpeciesId: 20,
      successChance: 0.5,
      energyTransferred: 12,
      preyDeathCorrelationId: "hunt:1:0:death",
    },
    ...overrides,
  };
}

function death(overrides: Partial<EcologicalObservation> = {}): EcologicalObservation {
  return {
    type: "DEATH",
    tick: 1,
    entityIds: [2],
    source: "test:integrity",
    correlationId: "hunt:1:0:death",
    payload: {
      cause: "PREDATION",
      speciesId: 20,
      energy: 1,
      age: 3,
      predatorId: 1,
      predatorSpeciesId: 10,
      huntCorrelationId: "hunt:1:0",
    },
    ...overrides,
  };
}

function reproduction(overrides: Record<string, unknown> = {}): EcologicalObservation {
  const primaryId = 1;
  const secondaryId = typeof overrides.secondaryParentId === "number" ? overrides.secondaryParentId : null;
  const sexual = secondaryId !== null;
  return {
    type: "REPRODUCTION",
    tick: 1,
    entityIds: sexual ? [primaryId, secondaryId, 99] : [primaryId, 99],
    source: "test:integrity",
    correlationId: "birth:1:99",
    payload: {
      offspringId: 99,
      parentIds: sexual ? `${primaryId},${secondaryId}` : `${primaryId}`,
      parentCount: sexual ? 2 : 1,
      mode: sexual ? "SEXUAL" : "ASEXUAL",
      primaryParentId: primaryId,
      primaryParentEnergyCost: 55,
      primaryParentEnergyBefore: 200,
      primaryParentEnergyAfter: 145,
      secondaryParentId: secondaryId,
      secondaryParentEnergyCost: sexual ? 20 : null,
      secondaryParentEnergyBefore: sexual ? 180 : null,
      secondaryParentEnergyAfter: sexual ? 160 : null,
      costAttribution: sexual ? "PRIMARY_AND_SECONDARY" : "PRIMARY_ONLY",
      offspringEnergy: 50,
      ...overrides,
    } as EcologicalObservation["payload"],
  };
}

function collect(...observations: EcologicalObservation[]): readonly EcologicalEvent[] {
  const sink = new InMemoryEventSink(BASE);
  for (const observation of observations) sink.record(observation);
  return sink.eventsSnapshot();
}

describe("E2.3.1 energy ledger (E-REV-01)", () => {
  it("A — asexual reproduction: one parent, one cost, one debit", () => {
    const events = collect(reproduction());
    const flows = energyLedger(events).filter((flow) => flow.role !== "OTHER");
    expect(flows).toHaveLength(1);
    expect(flows[0]).toMatchObject({
      entityId: 1,
      flowType: "REPRODUCTION_COST",
      amount: -55,
      role: "PRIMARY_PARENT",
      status: "EXPLICIT",
    });
    const conservation = verifyEnergyConservation(events);
    expect(conservation.ok).toBe(true);
    expect(conservation.checked).toBe(1);
    expect(conservation.verified).toBe(1);
  });

  it("B — sexual reproduction: two distinct debits, no duplicate primary cost", () => {
    const events = collect(reproduction({ secondaryParentId: 2 }));
    const summary = energyLedgerSummary(events);
    expect(summary.byFlowType.REPRODUCTION_COST).toBe(-55);
    expect(summary.byFlowType.MATE_COST).toBe(-20);
    expect(summary.byEntity["1"]).toBe(-55);
    expect(summary.byEntity["2"]).toBe(-20);
    expect(summary.incompleteFlows).toBe(0);
    expect(summary.conservation.verified).toBe(1);
    const roles = energyLedger(events).map((flow) => flow.role);
    expect(roles).toEqual(["PRIMARY_PARENT", "SECONDARY_PARENT"]);
  });

  it("C — null mate cost is not invented and not copied from the primary", () => {
    const events = collect(reproduction({
      secondaryParentId: 2,
      secondaryParentEnergyCost: null,
      secondaryParentEnergyBefore: 180,
      secondaryParentEnergyAfter: 160,
    }));
    const summary = energyLedgerSummary(events);
    const secondary = energyLedger(events).find((flow) => flow.role === "SECONDARY_PARENT");
    expect(secondary?.amount).toBeNull();
    expect(secondary?.missingFields).toContain("secondaryParentEnergyCost");
    expect(summary.byFlowType.MATE_COST).toBeUndefined();
    expect(summary.byEntity["2"]).toBeUndefined();
    expect(summary.incompleteFlows).toBe(1);
    expect(summary.conservation.ok).toBe(true);
    expect(summary.conservation.incomplete).toBe(1);
  });

  it("D — missing fields are reported explicitly, never replaced by arbitrary values", () => {
    const incomplete = reproduction({
      secondaryParentId: 2,
      primaryParentEnergyCost: null,
      secondaryParentEnergyCost: null,
    });
    const payload = { ...incomplete.payload } as Record<string, unknown>;
    delete payload.primaryParentEnergyAfter;
    const event = collect({ ...incomplete, payload: payload as EcologicalObservation["payload"] })[0];
    expect(validateEvent(event).ok).toBe(false);
    const flows = energyLedger([event]);
    expect(flows.every((flow) => flow.amount === null)).toBe(true);
    expect(flows[0].missingFields.length).toBeGreaterThan(0);
    expect(flows[1].missingFields.length).toBeGreaterThan(0);
    expect(verifyEnergyConservation([event]).ok).toBe(true); // incompleto, non falso
    expect(verifyEnergyConservation([event]).incomplete).toBe(1);
  });

  it("E — conservation compares recorded costs with before/after deltas of both parents", () => {
    const good = collect(reproduction({ secondaryParentId: 2 }));
    expect(verifyEnergyConservation(good)).toMatchObject({ ok: true, checked: 1, verified: 1 });
    const badPayload = {
      ...reproduction({ secondaryParentId: 2 }).payload,
      primaryParentEnergyAfter: 144, // delta reale 56, costo registrato 55
    } as EcologicalObservation["payload"];
    const bad = collect({ ...reproduction({ secondaryParentId: 2 }), payload: badPayload });
    const report = verifyEnergyConservation(bad);
    expect(report.ok).toBe(false);
    expect(report.mismatches).toEqual([{
      eventId: bad[0].eventId,
      role: "PRIMARY_PARENT",
      parentId: 1,
      expected: 56,
      recorded: 55,
    }]);
  });
});

describe("E2.3.1 completeness policy (E-REV-02)", () => {
  it("1 — all critical types active can be COMPLETE", () => {
    const sink = new InMemoryEventSink(BASE);
    sink.record(hunt());
    sink.record(death());
    sink.record(reproduction());
    sink.record({
      type: "RESOURCE_CONSUMPTION",
      tick: 1,
      entityIds: [1],
      source: "test:integrity",
      payload: {
        organismId: 1,
        speciesId: 10,
        cellX: 0,
        cellY: 0,
        energyGained: 10,
        stockBefore: 20,
        energyBefore: 50,
        energyAfter: 60,
      },
    });
    const summary = sink.summary();
    expect([...CRITICAL_EVENT_TYPES].every((type) => summary.enabledTypes.includes(type))).toBe(true);
    expect(summary.completeness).toBe("COMPLETE");
    expect(summary.missingRequiredTypes).toEqual([]);
  });

  it("2 — a disabled critical type is rejected in scientific_full and PARTIAL in partial", () => {
    expect(() => new InMemoryEventSink({ ...BASE, enabledTypes: ["DEATH"] })).toThrow(/scientific_full.*critical/);
    const sink = new InMemoryEventSink({
      ...BASE,
      profile: "partial",
      enabledTypes: ["DEATH"],
      disabledReason: "benchmark subset",
    });
    sink.record(hunt());
    const summary = sink.summary();
    expect(summary.completeness).toBe("PARTIAL");
    expect(summary.missingRequiredTypes).toContain("HUNT_ATTEMPT");
    expect(summary.disabledReason).toBe("benchmark subset");
    expect(summary.lostByType.HUNT_ATTEMPT).toBe(1);
  });

  it("3 — disabling a non-critical type follows the declared partial profile", () => {
    const sink = new InMemoryEventSink({
      ...BASE,
      profile: "partial",
      enabledTypes: ["HUNT_ATTEMPT", "DEATH", "REPRODUCTION", "RESOURCE_CONSUMPTION", "RESOURCE_DEPLETION"],
    });
    sink.record(hunt());
    const summary = sink.summary();
    expect(summary.completeness).toBe("PARTIAL");
    expect(summary.disabledTypes).toContain("RESOURCE_REGENERATION");
    expect(summary.missingCategories).toContain("NON_CRITICAL");
  });

  it("4 — a diagnostic profile can never be presented as a complete scientific dataset", () => {
    const sink = new InMemoryEventSink({ ...BASE, profile: "diagnostic", enabledTypes: ["DEATH"] });
    sink.record(death());
    expect(sink.summary().completeness).toBe("PARTIAL");
    expect(sink.summary().profile).toBe("diagnostic");
  });

  it("5 — a critical event lost to overflow forces PARTIAL", () => {
    const sink = new InMemoryEventSink({ ...BASE, maxCriticalEvents: 1 });
    sink.record(hunt());
    sink.record(hunt({ correlationId: "hunt:1:1", payload: { ...hunt().payload, preyDeathCorrelationId: "hunt:1:1:death" } }));
    const summary = sink.summary();
    expect(summary.criticalDropped).toBe(1);
    expect(summary.lostByType.HUNT_ATTEMPT).toBe(1);
    expect(summary.completeness).toBe("PARTIAL");
  });

  it("6 — a flush error forces PARTIAL", () => {
    const failingWriter: EventBatchWriter = { writeBatch(): void { throw new Error("disk unavailable"); } };
    const sink = new InMemoryEventSink({ ...BASE, batchWriter: failingWriter, flushEveryEvents: 1 });
    sink.record(hunt()); // il flush automatico avviene qui e fallisce
    const summary = sink.summary();
    expect(summary.flushErrors).toBe(1);
    expect(summary.flushErrorMessages[0]).toContain("disk unavailable");
    expect(summary.completeness).toBe("PARTIAL");
  });

  it("7 — an export error throws instead of producing a valid-looking dataset", () => {
    const spec: ObservabilityRunSpec = {
      id: "E2.3.1-EXPORT-FAILURE",
      experimentId: "E2.3.1-TEST",
      simulationId: "sim",
      runId: "export-failure",
      seed: 7,
      width: 8,
      height: 8,
      population: 12,
      ticks: 2,
      setup: "mixed",
    };
    const run = runObservability(spec);
    const dir = mkdtempSync(join(tmpdir(), "e23-export-error-"));
    const fileAsDir = join(dir, "not-a-directory");
    writeFileSync(fileAsDir, "x");
    expect(() => exportObservabilityDataset({
      experiment: "E2.3.1-TEST",
      phase: "E2.3.1 test",
      runs: [run],
      outDir: fileAsDir,
      label: "must-not-exist",
      executedAt: "2026-01-01T00:00:00.000Z",
      codeCommit: "test",
      workingTreeDirty: true,
      sourceSha256: "a".repeat(64),
      e1SourceSha256: "b".repeat(64),
    })).toThrow();
  });

  it("8 — manifest is derived from the same configuration used by the sink", () => {
    const spec: ObservabilityRunSpec = {
      id: "E2.3.1-MANIFEST",
      experimentId: "E2.3.1-TEST",
      simulationId: "sim",
      runId: "manifest-run",
      seed: 7,
      width: 8,
      height: 8,
      population: 12,
      ticks: 2,
      setup: "mixed",
      profile: "partial",
      enabledTypes: ["DEATH"],
      disabledReason: "manifest coherence test",
    };
    const manifest = buildObservabilityManifest(spec);
    const sink = new InMemoryEventSink(resolveSinkConfig(spec));
    sink.record(death());
    const summary = sink.summary();
    expect(manifest.logging.profile).toBe(summary.profile);
    expect(manifest.logging.enabledTypes).toEqual(summary.enabledTypes);
    expect(manifest.logging.requiredTypes).toEqual(summary.requiredTypes);
    expect(manifest.logging.disabledReason).toBe(summary.disabledReason);
    expect(manifest.logging.eventSchema).toBe("evoworld.e2.3.event.v2");
    expect(summary.completeness).toBe("PARTIAL");
  });
});

describe("E2.3.1 predation/mortality correlations (E-REV-03)", () => {
  it("1 — correlated death verifies the relation", () => {
    const report = verifyPredationCorrelations(collect(hunt(), death()));
    expect(report.status).toBe("VERIFIED");
    expect(report.attemptChecks[0].status).toBe("VERIFIED");
    expect(report.counts.VERIFIED).toBe(1);
    expect(report.errors).toEqual([]);
  });

  it("2 — hunt without death is UNVERIFIED, not a confirmed predation", () => {
    const report = verifyPredationCorrelations(collect(hunt()));
    expect(report.attemptChecks[0].status).toBe("UNVERIFIED");
    expect(report.counts.VERIFIED).toBe(0);
    expect(report.status).toBe("NON_EVALUABLE");
  });

  it("3 — death without predation is non-predatory or unattributed", () => {
    const nonPredatory = death({ payload: { cause: "STARVATION", speciesId: 20, energy: 1, age: 3 } });
    expect(verifyPredationCorrelations(collect(nonPredatory)).orphanDeaths).toEqual([]);
    const orphan = verifyPredationCorrelations(collect(death()));
    expect(orphan.orphanDeaths).toHaveLength(1);
    expect(orphan.status).toBe("INCONSISTENT");
  });

  it("4 — a wrong correlation ID is an integrity error", () => {
    const report = verifyPredationCorrelations(collect(
      hunt(),
      death({ correlationId: "wrong-id" }),
    ));
    expect(report.attemptChecks[0].status).toBe("INCONSISTENT");
    expect(report.attemptChecks[0].reasons.join(" ")).toMatch(/correlation/i);
  });

  it("5 — a different prey ID is an integrity error", () => {
    const report = verifyPredationCorrelations(collect(hunt(), death({ entityIds: [777] })));
    expect(report.attemptChecks[0].status).toBe("INCONSISTENT");
    expect(report.attemptChecks[0].reasons).toContain("prey ID mismatch");
  });

  it("6 — a different run ID is not a valid relation", () => {
    const events = collect(hunt(), death());
    const foreignDeath = { ...events[1], runId: "another-run" };
    const report = verifyPredationCorrelations([events[0], foreignDeath]);
    expect(report.attemptChecks[0].status).toBe("INCONSISTENT");
    expect(report.attemptChecks[0].reasons).toContain("runId mismatch");
  });

  it("7 — an incoherent tick is documented as an anomaly", () => {
    const report = verifyPredationCorrelations(collect(hunt(), death({ tick: 5 })));
    expect(report.attemptChecks[0].status).toBe("INCONSISTENT");
    expect(report.attemptChecks[0].reasons).toContain("tick mismatch");
  });

  it("8 — two deaths for the same attempt are ambiguous, never double-counted", () => {
    const report = verifyPredationCorrelations(collect(hunt(), death(), death({ correlationId: "hunt:1:0:death" })));
    expect(report.attemptChecks[0].status).toBe("AMBIGUOUS");
    expect(report.counts.AMBIGUOUS).toBe(1);
    expect(report.counts.VERIFIED).toBe(0);
  });

  it("9 — an incomplete dataset makes missing relations NON_EVALUABLE", () => {
    const report = verifyPredationCorrelations(collect(hunt()), { completeness: "PARTIAL" });
    expect(report.attemptChecks[0].status).toBe("NON_EVALUABLE");
    expect(report.status).toBe("NON_EVALUABLE");
  });

  it("rejects one death confirming two different hunt attempts", () => {
    const events = collect(
      hunt(),
      hunt({ correlationId: "hunt:1:1", payload: { ...hunt().payload, preyDeathCorrelationId: "hunt:1:0:death" } }),
      death(),
    );
    const report = verifyPredationCorrelations(events);
    expect(report.attemptChecks.map((check) => check.status)).toEqual(["AMBIGUOUS", "AMBIGUOUS"]);
  });
});
