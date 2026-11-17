/**
 * E1 — runner indipendente: crea un World, avanza con step() e campiona
 * metriche. Non modifica il motore; usa solo API pubbliche e snapshot.
 */
import type { World } from "../../simulation/core/world";
import { World as WorldClass } from "../../simulation/core/world";
import { accumulate, sampleState, type E1Counters, type E1Sample } from "./metrics";
import { applyPerturbation, applySetup, type PerturbationKind, type SetupKind } from "./initialConditions";

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
  perturbation: { atTick: number; kind: PerturbationKind } | null;
  options: ScenarioSpec["options"];
  completedTicks: number;
  extinctAt: number | null;
  elapsedMs: number;
  samples: E1Sample[];
}

export function createWorld(spec: ScenarioSpec): World {
  const fresh = new WorldClass(
    { width: spec.width, height: spec.height, seed: spec.seed },
    spec.population,
    spec.options,
  );
  return applySetup(fresh, spec.setup);
}

export function runScenario(spec: ScenarioSpec): RunResult {
  const started = Date.now();
  let world = createWorld(spec);
  // I contatori cumulativi vivono qui, fuori dal World: la ricostruzione da
  // snapshot fatta dalle perturbazioni non li riceve e non può azzerarli.
  const counters: E1Counters = { births: 0, deaths: 0, predationKills: 0 };
  const samples: E1Sample[] = [sampleState(world, counters)];
  let extinctAt: number | null = null;

  for (let i = 0; i < spec.ticks; i++) {
    world.step();
    const tickEvents = accumulate(counters, world);

    if (spec.perturbation && spec.perturbation.atTick === world.tick) {
      world = applyPerturbation(world, spec.perturbation.kind);
    }

    if (world.organisms.length === 0 && extinctAt === null) extinctAt = world.tick;
    if (world.tick % spec.sampleEvery === 0 || world.organisms.length === 0) {
      samples.push(sampleState(world, counters, tickEvents));
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
    perturbation: spec.perturbation ?? null,
    options: spec.options ?? {},
    completedTicks: world.tick,
    extinctAt,
    elapsedMs: Date.now() - started,
    samples,
  };
}
