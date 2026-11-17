/**
 * E1 — runner indipendente: crea un World, avanza con step() e campiona
 * metriche. Non modifica il motore; usa solo API pubbliche e snapshot.
 */
import type { World } from "../../simulation/core/world";
import { World as WorldClass } from "../../simulation/core/world";
import { accumulate, sampleState, type E1Counters, type E1Sample } from "./metrics";
import {
  applyPerturbationWithReport,
  applySetupWithInfo,
  type PerturbationKind,
  type PerturbationReport,
  type SetupInfo,
  type SetupKind,
} from "./initialConditions";

export interface ScenarioSpec {
  id: string;
  description: string;
  seed: number;
  width: number;
  height: number;
  population: number;
  ticks: number;
  sampleEvery: number;
  setup: SetupKind;
  perturbation?: { atTick: number; kind: PerturbationKind } | null;
  options?: { enableAdvancedGenome?: boolean; enableGeneEffects?: boolean };
}

export interface RunResult {
  scenario: string;
  description: string;
  seed: number;
  width: number;
  height: number;
  initialPopulation: number;
  ticks: number;
  sampleEvery: number;
  setup: SetupKind;
  /** Metodo di selezione delle celle per gli scenari habitat (se applicabile). */
  setupInfo: SetupInfo;
  perturbation: { atTick: number; kind: PerturbationKind } | null;
  /** Conteggi esatti rimossi/conservati della perturbazione (se applicabile). */
  perturbationReport: PerturbationReport | null;
  options: ScenarioSpec["options"];
  completedTicks: number;
  extinctAt: number | null;
  elapsedMs: number;
  samples: E1Sample[];
}

/** Crea il World e restituisce i metadati delle condizioni iniziali. */
export function createWorldWithInfo(spec: ScenarioSpec): { world: World; info: SetupInfo } {
  const fresh = new WorldClass(
    { width: spec.width, height: spec.height, seed: spec.seed },
    spec.population,
    spec.options,
  );
  return applySetupWithInfo(fresh, spec.setup);
}

export function createWorld(spec: ScenarioSpec): World {
  return createWorldWithInfo(spec).world;
}

export function runScenario(spec: ScenarioSpec): RunResult {
  const started = Date.now();
  const created = createWorldWithInfo(spec);
  let world = created.world;
  // I contatori cumulativi vivono qui, fuori dal World: la ricostruzione da
  // snapshot fatta dalle perturbazioni non li riceve e non può azzerarli.
  const counters: E1Counters = { births: 0, deaths: 0, predationKills: 0 };
  const initialPopulation = world.organisms.length;
  const samples: E1Sample[] = [
    sampleState(world, counters, undefined, {
      populationAtStart: initialPopulation,
      populationAfterStep: initialPopulation,
      perturbationRemoved: 0,
      perturbationKept: initialPopulation,
    }),
  ];
  let extinctAt: number | null = null;
  let perturbationReport: PerturbationReport | null = null;

  for (let i = 0; i < spec.ticks; i++) {
    const populationAtStart = world.organisms.length;
    world.step();
    const tickEvents = accumulate(counters, world);
    const populationAfterStep = world.organisms.length;
    let perturbationRemoved = 0;
    let perturbationKept = populationAfterStep;

    if (spec.perturbation && spec.perturbation.atTick === world.tick) {
      const applied = applyPerturbationWithReport(world, spec.perturbation.kind, world.tick);
      world = applied.world;
      perturbationReport = applied.report;
      perturbationRemoved = applied.report.removed;
      perturbationKept = applied.report.kept;
    }

    if (world.organisms.length === 0 && extinctAt === null) extinctAt = world.tick;
    if (world.tick % spec.sampleEvery === 0 || world.organisms.length === 0) {
      samples.push(sampleState(world, counters, tickEvents, {
        populationAtStart,
        populationAfterStep,
        perturbationRemoved,
        perturbationKept,
      }));
    }
    if (world.organisms.length === 0) break;
  }

  return {
    scenario: spec.id,
    description: spec.description,
    seed: spec.seed,
    width: spec.width,
    height: spec.height,
    initialPopulation: spec.population,
    ticks: spec.ticks,
    sampleEvery: spec.sampleEvery,
    setup: spec.setup,
    setupInfo: created.info,
    perturbation: spec.perturbation ?? null,
    perturbationReport,
    options: spec.options ?? {},
    completedTicks: world.tick,
    extinctAt,
    elapsedMs: Date.now() - started,
    samples,
  };
}
