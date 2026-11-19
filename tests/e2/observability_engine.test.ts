import { describe, expect, it } from "vitest";
import { World } from "../../simulation/core/world";
import {
  InMemoryEventSink,
  NULL_EVENT_SINK,
  canonicalEventString,
  filterEvents,
  selectHuntEvents,
  type EcologicalEvent,
} from "../../simulation/ecology/observability";
import { applySetupWithInfo, type SetupKind } from "../../tools/e1/initialConditions";
import { buildObservedFoodWeb, energyLedger } from "../../simulation/ecology/observability";
import {
  compareRuns,
  runObservability,
  type ObservabilityRunSpec,
} from "../../tools/e2/observabilityRunner";
import { aggregateRun, validateRunForExport, verifyObservabilityArtifact, exportObservabilityDataset } from "../../tools/e2/observabilityPipeline";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function buildWorld(seed: number, setup: SetupKind, sink = NULL_EVENT_SINK): World {
  const world = new World({ width: 32, height: 32, seed }, 80, {
    enableAdvancedGenome: true,
    enableGeneEffects: true,
  });
  const prepared = applySetupWithInfo(world, setup);
  prepared.world.setEventSink(sink);
  return prepared.world;
}

/** Stato biologico completo + RNG: identico se e solo se il logging è passivo. */
function stateSignature(world: World): string {
  return canonicalEventString({ snapshot: world.toSnapshot(), stats: world.getStats() });
}

function baseSpec(overrides: Partial<ObservabilityRunSpec> = {}): ObservabilityRunSpec {
  return {
    id: "pilot",
    experimentId: "E2.3-TEST",
    simulationId: "sim-test",
    runId: "test-run",
    seed: 7,
    width: 32,
    height: 32,
    population: 80,
    ticks: 60,
    setup: "mixed",
    snapshotEveryTicks: 10,
    ...overrides,
  };
}

describe("E2.3 engine hooks (observer-only)", () => {
  it("does not change a single tick of engine state when logging is active", () => {
    const sink = new InMemoryEventSink({
      simulationId: "sim-test",
      experimentId: "E2.3-TEST",
      runId: "logged",
      snapshotEveryTicks: 5,
    });
    const quiet = buildWorld(23, "mixed", NULL_EVENT_SINK);
    const logged = buildWorld(23, "mixed", sink);
    expect(stateSignature(quiet)).toBe(stateSignature(logged));
    for (let tick = 0; tick < 45; tick++) {
      quiet.step();
      logged.step();
      expect(stateSignature(logged)).toBe(stateSignature(quiet));
    }
    expect(sink.eventsSnapshot().length).toBeGreaterThan(0);
  }, 180_000);

  it("emits hunt attempts at the real decision point with success/failure and correlated death", () => {
    const run = runObservability(baseSpec({ ticks: 120 }));
    expect(run.validation.valid).toBe(true);
    const attempts = filterEvents(run.events, { types: ["HUNT_ATTEMPT"] });
    expect(attempts.length).toBeGreaterThan(0);
    expect(selectHuntEvents(run.events, "HUNT_ATTEMPT").length).toBe(
      selectHuntEvents(run.events, "HUNT_SUCCESS").length + selectHuntEvents(run.events, "HUNT_FAILURE").length,
    );
    for (const event of attempts) {
      expect(event.payload).toHaveProperty("successChance");
      expect(event.payload).toHaveProperty("predatorId");
      expect(event.payload).toHaveProperty("preyId");
      expect(event.payload.outcome === "SUCCESS" || event.payload.outcome === "FAILURE").toBe(true);
    }
    const successes = selectHuntEvents(run.events, "PREDATION");
    const predationDeaths = filterEvents(run.events, { types: ["DEATH"] }).filter(
      (event) => event.payload.cause === "PREDATION",
    );
    expect(predationDeaths).toHaveLength(successes.length);
    for (const death of predationDeaths) {
      expect(run.events.some((event) => event.eventId === death.payload.huntCorrelationId)).toBe(false);
      expect(run.events.some((event) => event.correlationId === death.payload.huntCorrelationId)).toBe(true);
    }
    expect(buildObservedFoodWeb(run.events).every((edge) => edge.category === "OBSERVED")).toBe(true);
    expect(energyLedger(run.events).every((flow) => flow.category === "DERIVED")).toBe(true);
  }, 180_000);

  it("emits death causes derived from the engine predicates, never invented", () => {
    const run = runObservability(baseSpec({ setup: "oldWeak", ticks: 2 }));
    const deaths = filterEvents(run.events, { types: ["DEATH"] });
    expect(deaths.length).toBeGreaterThan(0);
    for (const death of deaths) {
      expect(String(death.payload.cause)).toMatch(/STARVATION|OLD_AGE|ENVIRONMENT_SETTLEMENT|PREDATION/);
      expect(death.payload).toHaveProperty("energy");
      expect(death.payload).toHaveProperty("age");
    }
    expect(deaths.some((d) => String(d.payload.cause).includes("STARVATION"))).toBe(true);
    expect(deaths.some((d) => String(d.payload.cause).includes("OLD_AGE"))).toBe(true);
    expect(deaths.some((d) => d.payload.cause === "DISEASE")).toBe(false);
  });

  it("emits reproduction with parentage, mode and real energy costs", () => {
    const world = buildWorld(31, "herbivore");
    for (const organism of world.organisms) {
      organism.energy = 145;
      organism.genome.fertility = 20;
      // La maturità è una frazione della lifespan: senza questo, nessun
      // organismo è eleggibile al primo tick (il comportamento del motore
      // resta invariato; è solo la condizione iniziale del test).
      organism.age = Math.max(1, Math.floor(organism.genome.lifespan * 0.3));
    }
    const sink = new InMemoryEventSink({ simulationId: "sim", experimentId: "exp", runId: "rep" });
    world.setEventSink(sink);
    world.step();
    const births = sink.eventsSnapshot().filter((event) => event.eventType === "REPRODUCTION");
    expect(births.length).toBeGreaterThan(0);
    for (const birth of births) {
      expect(birth.payload).toHaveProperty("offspringId");
      expect(birth.payload).toHaveProperty("parentIds");
      expect(["SEXUAL", "ASEXUAL"]).toContain(birth.payload.mode);
      expect(birth.payload.parentEnergyCost).toBeGreaterThan(0);
    }
  });

  it("records vegetation consumption, depletion and regeneration with before/after stock", () => {
    const run = runObservability(baseSpec({ setup: "herbivore", ticks: 12 }));
    const consumption = filterEvents(run.events, { types: ["RESOURCE_CONSUMPTION"] });
    const depletion = filterEvents(run.events, { types: ["RESOURCE_DEPLETION"] });
    const regeneration = filterEvents(run.events, { types: ["RESOURCE_REGENERATION"] });
    expect(consumption.length).toBeGreaterThan(0);
    expect(depletion.length).toBeGreaterThan(0);
    expect(regeneration.length).toBeGreaterThan(0);
    for (const event of consumption) {
      expect(event.payload.energyAfter).toBeGreaterThanOrEqual(event.payload.energyBefore as number);
      expect(event.payload.energyGained).toBeGreaterThan(0);
    }
    for (const event of depletion) {
      expect(event.payload.stockAfter).toBeLessThan(event.payload.stockBefore as number);
      expect(event.payload.quantityRemoved).toBeGreaterThan(0);
    }
    for (const event of regeneration) {
      expect(typeof event.payload.mode).toBe("string");
      expect(event.payload.stockAfter).not.toBe(event.payload.stockBefore);
    }
  }, 180_000);

  it("keeps aggregate snapshots separate from individual events", () => {
    const run = runObservability(baseSpec({ ticks: 25, snapshotEveryTicks: 10 }));
    const aggregate = aggregateRun(run);
    const ecosystem = aggregate.snapshots.ecosystem as EcologicalEvent[];
    const resource = aggregate.snapshots.resource as EcologicalEvent[];
    expect(ecosystem.map((e) => e.tick)).toEqual([10, 20]);
    expect(resource.map((e) => e.tick)).toEqual([10, 20]);
    for (const event of ecosystem) {
      expect(event.entityIds).toEqual([]);
      expect(event.payload).toHaveProperty("completedTicks");
    }
    for (const event of resource) {
      expect(event.entityIds).toEqual([]);
      expect(event.payload).toHaveProperty("cellCount");
      expect(event.payload.scope).toBe("materialized_chunks");
    }
    const individualTypes = new Set(["HUNT_ATTEMPT", "DEATH", "REPRODUCTION", "RESOURCE_CONSUMPTION"]);
    for (const event of run.events.filter((e) => individualTypes.has(e.eventType))) {
      expect(event.entityIds.length).toBeGreaterThan(0);
    }
  }, 180_000);
});

describe("E2.3 reproducibility and dataset integrity", () => {
  it("reproduces the same event payload from the same seed and manifest", () => {
    const a = runObservability(baseSpec({ runId: "same-seed" }));
    const b = runObservability(baseSpec({ runId: "same-seed" }));
    expect(compareRuns(a, b)).toEqual({ reproducible: true, differences: [] });
  }, 180_000);

  it("detects a different seed as a difference", () => {
    const a = runObservability(baseSpec({ seed: 3, runId: "same-seed" }));
    const b = runObservability(baseSpec({ seed: 4, runId: "same-seed" }));
    expect(compareRuns(a, b).reproducible).toBe(false);
    expect(compareRuns(a, b).differences).toContain("configSha256");
  }, 180_000);

  it("exports, verifies and rejects tampered datasets", () => {
    const run = runObservability(baseSpec({ runId: "export-run", ticks: 30 }));
    expect(validateRunForExport(run)).toEqual([]);
    const dir = mkdtempSync(join(tmpdir(), "e23-test-"));
    const result = exportObservabilityDataset({
      experiment: "E2.3-TEST",
      phase: "E2.3 pilot",
      runs: [run],
      outDir: dir,
      label: "e2.3-observability-test",
      executedAt: "2026-01-01T00:00:00.000Z",
      codeCommit: "test-commit",
      workingTreeDirty: false,
      sourceSha256: "a".repeat(64),
      e1SourceSha256: "b".repeat(64),
      runtime: { node: process.version, v8: process.versions.v8 },
    });
    expect(result.validationErrors).toEqual([]);
    expect(result.manifest.artifact).toBe("e2.3-observability-test.json.gz");
    expect(verifyObservabilityArtifact(result.archivePath, result.manifestPath).ok).toBe(true);

    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8")) as { payloadSha256: string };
    manifest.payloadSha256 = "0".repeat(64);
    const badPath = join(dir, "tampered.manifest.json");
    writeFileSync(badPath, JSON.stringify(manifest));
    expect(() => verifyObservabilityArtifact(result.archivePath, badPath)).toThrow(/payloadSha256 mismatch/);
  }, 180_000);
});
