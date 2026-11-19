/**
 * IV1-A — script riproducibile della matrice di invarianza.
 *
 * Uso:
 *   IV1_A_CODE_COMMIT=<sha> IV1_A_OUT=docs/research/iv1-a \
 *   npx vitest run --config vitest.experiment.config.ts scripts/iv1_invariance.experiment.ts
 *
 * Genera un report JSON con configurazione, hash finali, confronti tick-per-tick,
 * lista divergenze (vuota in caso di successo) e diagnosi tecnica. Nessun dato
 * grafico o temporale entra nei fingerprint; elapsedMs non viene scritto.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stableStringify } from "../tools/e1/dataset";
import {
  caseId,
  compareRuns,
  IV1_CONFIGURATIONS,
  IV1_DEFAULTS,
  IV1_REPETITIONS,
  IV1_SCHEMA,
  IV1_SEEDS,
  runInvarianceCase,
  type IV1RunResult,
} from "../tools/iv1/invariance";

const REPO = resolve(process.cwd());
const OUT = process.env.IV1_A_OUT ?? join(REPO, "docs", "research", "iv1-a", "iv1-a-invariance-results.json");
const CODE_COMMIT = process.env.IV1_A_CODE_COMMIT;
const BRANCH = process.env.IV1_A_BRANCH ?? "iv1-a-rendering-observability-invariance";

const SOURCE_FILES = [
  "tools/iv1/invariance.ts",
  "tests/iv1/invariance.test.ts",
  "scripts/iv1_invariance.experiment.ts",
  "simulation/core/world.ts",
  "simulation/core/renderFrame.ts",
  "simulation/ecology/observability.ts",
  "simulation/evolution/reproduction.ts",
  "components/simulation/planet3d/creatureInstancing.ts",
  "lib/adaptiveRender.ts",
  "lib/visual/runtimeAnatomyRenderSource.ts",
  "scripts/g31Fixtures.ts",
];

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function lastObservation(result: IV1RunResult) {
  return result.ticks[result.ticks.length - 1];
}

function summarizeRun(result: IV1RunResult): Record<string, unknown> {
  const last = lastObservation(result);
  const planet = result.finalState.planet as { chunks?: readonly unknown[] };
  return {
    caseId: caseId(result.config.seed, result.config.repetition, result.config.rendering, result.config.observability),
    seed: result.config.seed,
    repetition: result.config.repetition,
    rendering: result.config.rendering,
    observability: result.config.observability,
    completedTicks: result.completedTicks,
    fingerprintTicks: result.ticks.length,
    finalSha256: result.finalSha256,
    population: last.population,
    randomState: last.randomState,
    cumulativeBirths: last.cumulativeBirths,
    cumulativeDeaths: last.cumulativeDeaths,
    cumulativePredationKills: last.cumulativePredationKills,
    speciesAlive: last.speciesAlive,
    speciesExtinct: last.speciesExtinct,
    organismsInFingerprint: result.finalState.organisms.length,
    chunksInFingerprint: planet.chunks?.length ?? 0,
    eventCountsByType: result.eventCountsByType,
    reproductionModes: result.reproductionModes,
    adaptiveRenderingActive: result.renderCounters?.adaptive === true,
  };
}

describe("IV1-A reproducible invariance matrix", () => {
  it("runs the full matrix and writes a portable report", () => {
    if (!CODE_COMMIT) throw new Error("IV1_A_CODE_COMMIT is required");

    const runs: IV1RunResult[] = [];
    for (const seed of IV1_SEEDS) {
      for (const repetition of IV1_REPETITIONS) {
        for (const configuration of IV1_CONFIGURATIONS) {
          runs.push(
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

    const comparisons: Array<Record<string, unknown>> = [];
    const divergences: Array<Record<string, unknown>> = [];
    for (const seed of IV1_SEEDS) {
      for (const repetition of IV1_REPETITIONS) {
        const baseline = runs.find(
          (run) =>
            run.config.seed === seed &&
            run.config.repetition === repetition &&
            run.config.rendering === "OFF" &&
            run.config.observability === "OFF",
        )!;
        for (const configuration of IV1_CONFIGURATIONS.slice(1)) {
          const other = runs.find(
            (run) =>
              run.config.seed === seed &&
              run.config.repetition === repetition &&
              run.config.rendering === configuration.rendering &&
              run.config.observability === configuration.observability,
          )!;
          const comparison = compareRuns(baseline, other);
          comparisons.push({
            baseline: caseId(seed, repetition, "OFF", "OFF"),
            other: caseId(seed, repetition, configuration.rendering, configuration.observability),
            diverged: comparison.diverged,
            firstDivergenceTick: comparison.tick,
            baselineSha256: comparison.baselineSha256,
            otherSha256: comparison.otherSha256,
            suspectedFields: comparison.suspectedFields,
            diagnosis: comparison.diagnosis,
          });
          if (comparison.diverged) {
            divergences.push({
              baseline: caseId(seed, repetition, "OFF", "OFF"),
              other: caseId(seed, repetition, configuration.rendering, configuration.observability),
              tick: comparison.tick,
              baselineObservation: comparison.baseline,
              otherObservation: comparison.other,
              diagnosis: comparison.diagnosis,
            });
          }
        }
      }
    }

    const baselines = runs.filter(
      (run) => run.config.rendering === "OFF" && run.config.observability === "OFF",
    );
    const observed = runs.filter((run) => run.config.observability === "ON");
    const rendered = runs.filter((run) => run.config.rendering === "ON");
    const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

    const checks: Record<string, boolean> = {
      matrixComplete: runs.length === IV1_SEEDS.length * IV1_REPETITIONS.length * IV1_CONFIGURATIONS.length,
      tickCoverage: runs.every(
        (run) =>
          run.completedTicks === IV1_DEFAULTS.ticks &&
          run.ticks.length === IV1_DEFAULTS.ticks + 1 &&
          run.ticks.every((tick, index) => tick.tick === index),
      ),
      allComparisonsPassed: divergences.length === 0,
      deterministicBaselines: IV1_SEEDS.every((seed) => {
        const byRepetition = IV1_REPETITIONS.map(
          (repetition) =>
            baselines.find((run) => run.config.seed === seed && run.config.repetition === repetition)!.finalSha256,
        );
        return byRepetition.every((hash) => hash === byRepetition[0]);
      }),
      reproductionObserved: sum(baselines.map((run) => lastObservation(run).cumulativeBirths)) > 0,
      mortalityObserved: sum(baselines.map((run) => lastObservation(run).cumulativeDeaths)) > 0,
      predationObserved: sum(baselines.map((run) => lastObservation(run).cumulativePredationKills)) > 0,
      mutationCoverage: sum(observed.map((run) => run.reproductionModes.ASEXUAL)) > 0,
      observabilityActive: observed.every(
        (run) =>
          (run.eventCountsByType.REPRODUCTION ?? 0) > 0 &&
          (run.eventCountsByType.DEATH ?? 0) > 0 &&
          (run.eventCountsByType.HUNT_ATTEMPT ?? 0) > 0 &&
          (run.eventCountsByType.ECOSYSTEM_SNAPSHOT ?? 0) === IV1_DEFAULTS.ticks,
      ),
      renderingActive: rendered.every(
        (run) =>
          run.renderCounters?.adaptive === true &&
          Number(run.renderCounters?.updated ?? 0) + Number(run.renderCounters?.skipped ?? 0) > 0,
      ),
      renderAbsentWhenOff: runs
        .filter((run) => run.config.rendering === "OFF")
        .every((run) => run.renderCounters === null),
    };

    const sourceHashes: Record<string, string> = {};
    for (const file of SOURCE_FILES) sourceHashes[file] = sha256(readFileSync(join(REPO, file)));

    const report: Record<string, unknown> = {
      schema: "evoworld.iv1-a.results.v1",
      branch: BRANCH,
      codeCommit: CODE_COMMIT,
      baseBranches: {
        observability: "research/e2-ecosystem-dynamics",
        rendering: "graphics/g3-renderer-integration",
        integrationCommit: "e936756",
      },
      fingerprint: {
        schema: IV1_SCHEMA,
        algorithm: "sha256(stableStringify(canonicalBiologicalState))",
        orderIndependentCollections: ["organisms", "speciesRegistry", "planet.chunks"],
        included: [
          "tick",
          "randomState",
          "nextOrganismId",
          "nextSpeciesId",
          "organisms (id, speciesId, position, home, energy, age, alive, genome, memory, brain)",
          "speciesRegistry",
          "planet.config",
          "planet.chunks (key, lastActiveTick, cells)",
          "genomeVersion",
          "advancedGenome",
          "geneEffects",
          "per-tick SimulationStats (births, deaths, predationKills, population, species, averageGenome)",
        ],
        excluded: [
          "RenderFrame and all graphical typed arrays/mesh/camera state",
          "G3.1 adaptive render counters",
          "E2.3.1 events, event hashes and sink summaries",
          "elapsedMs, Date.now, filesystem paths and any wall-clock metadata",
        ],
      },
      config: {
        ...IV1_DEFAULTS,
        seeds: IV1_SEEDS,
        repetitions: IV1_REPETITIONS,
        configurations: IV1_CONFIGURATIONS,
        initialCondition:
          "Identical deterministic transform on all cases: founder energy=220, fertility=20, age=ceil(lifespan*0.25). No RNG consumed.",
        observabilitySink: "scientific_full, all event types, snapshotEveryTicks=1, samplingSeed=1",
        rendering: "G3.1 adaptive ON with farStride=4, nearDistanceScales=8, anatomy source and periodic viewport refresh",
      },
      summary: {
        runs: runs.length,
        comparisons: comparisons.length,
        divergences: divergences.length,
        firstDivergenceTick: divergences.length ? divergences[0].tick : null,
        totalBiologicalEvents: {
          births: sum(baselines.map((run) => lastObservation(run).cumulativeBirths)),
          deaths: sum(baselines.map((run) => lastObservation(run).cumulativeDeaths)),
          predationKills: sum(baselines.map((run) => lastObservation(run).cumulativePredationKills)),
          asexualReproductions: sum(observed.map((run) => run.reproductionModes.ASEXUAL)),
        },
      },
      checks,
      runs: runs.map(summarizeRun),
      comparisons,
      divergences,
      diagnosis: divergences.length
        ? divergences.map((divergence) => String(divergence.diagnosis))
        : [
            "Nessuna divergenza rilevata: tutti i fingerprint biologici coincidono tick per tick in tutte le 60 corse.",
            "Il sink E2.3.1 emette eventi reali ma non consuma il RNG del motore e non modifica lo stato.",
            "Il percorso G3.1 adaptive legge il RenderFrame e scrive solo mesh/contatori di rendering.",
          ],
      provenance: {
        sourceSha256: sha256(SOURCE_FILES.map((file) => `${file}:${sourceHashes[file]}`).join("\n")),
        sourceHashes,
      },
      timingNote: "Wall-clock timings are deliberately omitted from this portable scientific artifact.",
    };

    report.payloadSha256 = sha256(stableStringify(report));
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(
      `IV1-A completed: runs=${runs.length} comparisons=${comparisons.length} divergences=${divergences.length} ` +
        `payloadSha256=${String(report.payloadSha256).slice(0, 16)} checks=${JSON.stringify(checks)}`,
    );

    for (const [name, ok] of Object.entries(checks)) expect(ok, `check ${name}`).toBe(true);
    expect(divergences).toEqual([]);
  }, 600_000);
});
