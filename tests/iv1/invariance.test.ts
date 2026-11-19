/**
 * IV1-A / IV1-A-R1 — test automatici di invarianza biologica post-render.
 *
 * A: stessa configurazione ripetuta => stesso stato tick per tick.
 * B: osservabilita' ON/OFF => stesso RNG, stessa evoluzione, stessa mortalita'.
 * C: quattro configurazioni (OFF/OFF, ON/OFF, OFF/ON, ON/ON).
 * D: 5 seed x 3 ripetizioni, 120 tick, confronto tick per tick e primo tick divergente.
 *
 * R1: la fingerprint e' acquisita DOPO il rendering (incluso l'ultimo tick) e
 * i test di mutazione artificiale dimostrano che una mutazione in quella
 * finestra viene rilevata, mentre il vecchio ordine l'avrebbe mancata.
 *
 * La matrice viene eseguita una sola volta in beforeAll e condivisa dai test.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { World } from "../../simulation/core/world";
import { stableStringify } from "../../tools/e1/dataset";
import {
  buildCanonicalBiologicalState,
  caseId,
  compareRuns,
  fingerprintState,
  IV1_CONFIGURATIONS,
  IV1_DEFAULTS,
  IV1_REPETITIONS,
  IV1_SCHEMA,
  IV1_SEEDS,
  runInvarianceCase,
  type IV1RunResult,
  type ObservabilityMode,
  type RenderingMode,
} from "../../tools/iv1/invariance";

const matrix = new Map<string, IV1RunResult>();

function run(
  seed: number,
  repetition: number,
  rendering: RenderingMode,
  observability: ObservabilityMode,
): IV1RunResult {
  const result = matrix.get(caseId(seed, repetition, rendering, observability));
  if (!result) throw new Error(`IV1-A: caso mancante ${caseId(seed, repetition, rendering, observability)}`);
  return result;
}

beforeAll(() => {
  for (const seed of IV1_SEEDS) {
    for (const repetition of IV1_REPETITIONS) {
      for (const configuration of IV1_CONFIGURATIONS) {
        const key = caseId(seed, repetition, configuration.rendering, configuration.observability);
        matrix.set(
          key,
          runInvarianceCase({
            seed,
            repetition,
            rendering: configuration.rendering,
            observability: configuration.observability,
          }),
        );
      }
    }
  }
}, 300_000);

describe("IV1-A — fingerprint biologico canonico", () => {
  it("include lo stato biologico completo e nessun dato grafico/temporale", () => {
    const result = run(IV1_SEEDS[0], 1, "OFF", "OFF");
    expect(result.finalState.schema).toBe(IV1_SCHEMA);
    expect(result.ticks).toHaveLength(IV1_DEFAULTS.ticks + 1);

    const text = stableStringify(result.finalState);
    for (const field of [
      "randomState",
      "nextOrganismId",
      "nextSpeciesId",
      "organisms",
      "genome",
      "brain",
      "speciesRegistry",
      "chunks",
      "births",
      "deaths",
      "predationKills",
    ]) {
      expect(text, `campo biologico mancante: ${field}`).toContain(`"${field}"`);
    }
    for (const forbidden of [
      "organismsX",
      "organismsBodyStature",
      "elapsedMs",
      "creatureRenderStats",
      "instanced",
      "eventId",
      "simulationTime",
    ]) {
      expect(text, `dato non biologico presente: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("e' indipendente dall'ordine di organismi, specie e chunk", () => {
    const world = new World({ width: IV1_DEFAULTS.width, height: IV1_DEFAULTS.height, seed: 7 }, 30);
    world.step();
    const snapshot = world.toSnapshot();
    const stats = world.getStats();
    const canonical = buildCanonicalBiologicalState(snapshot, stats);
    const shuffled = buildCanonicalBiologicalState(
      {
        ...snapshot,
        organisms: [...snapshot.organisms].reverse(),
        speciesRegistry: [...snapshot.speciesRegistry].reverse(),
        planet: { ...snapshot.planet, chunks: [...(snapshot.planet.chunks ?? [])].reverse() },
      },
      stats,
    );
    expect(fingerprintState(shuffled)).toBe(fingerprintState(canonical));
  });
});

describe("IV1-A — matrice di invarianza", () => {
  it("A — ripetizioni della stessa configurazione sono deterministiche", () => {
    const first = run(IV1_SEEDS[0], 1, "OFF", "OFF");
    for (const repetition of IV1_REPETITIONS.slice(1)) {
      const comparison = compareRuns(first, run(IV1_SEEDS[0], repetition, "OFF", "OFF"));
      expect(comparison.diverged, `ripetizione ${repetition}`).toBe(false);
      expect(comparison.otherSha256).toBe(first.finalSha256);
    }
  });

  it("B — osservabilita' ON/OFF non altera RNG, riproduzione o mortalita'", () => {
    const off = run(IV1_SEEDS[0], 1, "OFF", "OFF");
    const on = run(IV1_SEEDS[0], 1, "OFF", "ON");
    const comparison = compareRuns(off, on);
    expect(comparison.diverged).toBe(false);
    expect(comparison.otherSha256).toBe(off.finalSha256);

    const lastOff = off.ticks[off.ticks.length - 1];
    const lastOn = on.ticks[on.ticks.length - 1];
    expect(lastOn.randomState).toBe(lastOff.randomState);
    expect(lastOn.cumulativeBirths).toBe(lastOff.cumulativeBirths);
    expect(lastOn.cumulativeDeaths).toBe(lastOff.cumulativeDeaths);
    expect(lastOn.cumulativePredationKills).toBe(lastOff.cumulativePredationKills);

    // Il sink ha davvero lavorato: gli eventi non sono un no-op.
    expect(on.eventCountsByType.REPRODUCTION ?? 0).toBeGreaterThan(0);
    expect(on.eventCountsByType.DEATH ?? 0).toBeGreaterThan(0);
    expect(on.eventCountsByType.HUNT_ATTEMPT ?? 0).toBeGreaterThan(0);
    expect(on.eventCountsByType.ECOSYSTEM_SNAPSHOT ?? 0).toBe(IV1_DEFAULTS.ticks);
    // Nessun campionamento, nessuna perdita: la copertura resta COMPLETE.
    expect(on.observability?.completeness).toBe("COMPLETE");
    expect(on.observability?.sampled).toBe(0);
    expect(on.observability?.droppedNonCritical).toBe(0);
    expect(on.observability?.criticalDropped).toBe(0);
  });

  it("C — le quattro configurazioni producono lo stesso stato biologico", () => {
    const baseline = run(IV1_SEEDS[0], 1, "OFF", "OFF");
    for (const configuration of IV1_CONFIGURATIONS) {
      const other = run(IV1_SEEDS[0], 1, configuration.rendering, configuration.observability);
      const comparison = compareRuns(baseline, other);
      expect(comparison.diverged, `${configuration.rendering}/${configuration.observability}`).toBe(false);
      expect(comparison.otherSha256).toBe(baseline.finalSha256);
      if (configuration.rendering === "ON") {
        expect(other.renderCounters?.adaptive).toBe(true);
        const updated = Number(other.renderCounters?.updated ?? 0);
        const skipped = Number(other.renderCounters?.skipped ?? 0);
        expect(updated + skipped).toBeGreaterThan(0);
      } else {
        expect(other.renderCounters).toBeNull();
      }
    }
  });

  it("D — 5 seed x 3 ripetizioni: nessuna divergenza, eventi biologici osservati", () => {
    expect(matrix.size).toBe(IV1_SEEDS.length * IV1_REPETITIONS.length * IV1_CONFIGURATIONS.length);

    for (const seed of IV1_SEEDS) {
      for (const repetition of IV1_REPETITIONS) {
        const baseline = run(seed, repetition, "OFF", "OFF");
        expect(baseline.completedTicks, `seed ${seed} rep ${repetition}`).toBe(IV1_DEFAULTS.ticks);
        for (const configuration of IV1_CONFIGURATIONS) {
          const other = run(seed, repetition, configuration.rendering, configuration.observability);
          const comparison = compareRuns(baseline, other);
          expect(
            comparison.diverged,
            `${caseId(seed, repetition, configuration.rendering, configuration.observability)} @ tick ${comparison.tick}`,
          ).toBe(false);
          expect(other.finalSha256).toBe(baseline.finalSha256);
          expect(other.ticks.every((tick, index) => tick.tick === index)).toBe(true);
        }
      }
    }

    const baselines = [...matrix.values()].filter(
      (result) => result.config.rendering === "OFF" && result.config.observability === "OFF",
    );
    const last = (result: IV1RunResult) => result.ticks[result.ticks.length - 1];
    expect(baselines.reduce((sum, result) => sum + last(result).cumulativeBirths, 0)).toBeGreaterThan(0);
    expect(baselines.reduce((sum, result) => sum + last(result).cumulativeDeaths, 0)).toBeGreaterThan(0);
    expect(baselines.reduce((sum, result) => sum + last(result).cumulativePredationKills, 0)).toBeGreaterThan(0);

    const observed = [...matrix.values()].filter((result) => result.config.observability === "ON");
    expect(observed.every((result) => (result.eventCountsByType.REPRODUCTION ?? 0) > 0)).toBe(true);
    // Riproduzione asessuata = cloneWithMutation: le mutazioni sono coperte.
    expect(observed.reduce((sum, result) => sum + result.reproductionModes.ASEXUAL, 0)).toBeGreaterThan(0);
  });

  it("se ci fosse una divergenza il confronto individua il primo tick", () => {
    const baseline = run(IV1_SEEDS[0], 1, "OFF", "OFF");
    const altered: IV1RunResult = {
      ...baseline,
      ticks: baseline.ticks.map((tick, index) =>
        index === 12 ? { ...tick, sha256: "0".repeat(64), population: tick.population + 1 } : tick,
      ),
      finalSha256: "0".repeat(64),
    };
    const comparison = compareRuns(baseline, altered);
    expect(comparison.diverged).toBe(true);
    expect(comparison.tick).toBe(12);
    expect(comparison.suspectedFields).toContain("population");
    expect(comparison.diagnosis).toContain("tick 12");
  });
});

describe("IV1-A-R1 — integrita' post-render", () => {
  /** Mutazione biologica deterministica, senza consumo di RNG. */
  const mutateBiology = (world: World): void => {
    const target = world.organisms[0];
    target.energy += 1;
    target.genome.lifespan += 1;
  };

  it("una mutazione durante il rendering viene rilevata in un tick intermedio", () => {
    const baseline = run(IV1_SEEDS[0], 1, "ON", "ON");
    const mutated = runInvarianceCase({
      seed: IV1_SEEDS[0],
      repetition: 1,
      rendering: "ON",
      observability: "ON",
      postRenderMutation: (world, tick) => {
        if (tick === 50) mutateBiology(world);
      },
    });
    const comparison = compareRuns(baseline, mutated);
    expect(comparison.diverged).toBe(true);
    expect(comparison.tick).toBe(50);
  });

  it("una mutazione nell'ULTIMO tick viene rilevata (finestra chiusa da R1)", () => {
    const baseline = run(IV1_SEEDS[0], 1, "ON", "ON");
    const lastTick = IV1_DEFAULTS.ticks;
    const mutated = runInvarianceCase({
      seed: IV1_SEEDS[0],
      repetition: 1,
      rendering: "ON",
      observability: "ON",
      capturePreRenderFingerprint: true,
      postRenderMutation: (world, tick) => {
        if (tick === lastTick) mutateBiology(world);
      },
    });
    const comparison = compareRuns(baseline, mutated);
    expect(comparison.diverged).toBe(true);
    expect(comparison.tick).toBe(lastTick);

    // Prova che il test fallirebbe con il vecchio ordine: la fingerprint
    // pre-render dell'ultimo tick coincide col baseline, quindi non avrebbe
    // rilevato la mutazione; quella post-render invece diverge.
    const lastObservation = mutated.ticks[mutated.ticks.length - 1];
    expect(lastObservation.preRenderSha256).toBe(baseline.finalSha256);
    expect(lastObservation.sha256).not.toBe(baseline.finalSha256);
  });

  it("il rilevatore non produce falsi positivi e il rendering da solo non muta nulla", () => {
    const baseline = run(IV1_SEEDS[0], 1, "ON", "ON");
    const control = runInvarianceCase({
      seed: IV1_SEEDS[0],
      repetition: 1,
      rendering: "ON",
      observability: "ON",
      capturePreRenderFingerprint: true,
      postRenderMutation: () => {
        /* nessuna mutazione iniettata */
      },
    });
    expect(compareRuns(baseline, control).diverged).toBe(false);
    // Con rendering ON e nessuna mutazione, pre-render e post-render coincidono
    // a ogni tick: la fase di rendering non tocca lo stato biologico.
    for (const observation of control.ticks.slice(1)) {
      expect(observation.preRenderSha256, `tick ${observation.tick}`).toBe(observation.sha256);
    }
  });
});
