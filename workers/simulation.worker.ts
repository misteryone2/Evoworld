/// <reference lib="webworker" />

import type { WorkerCommand, WorkerEvent } from "../types";
import { World } from "../simulation/core/world";
import { SimulationClock } from "../simulation/core/clock";
import { buildRenderFrame, computeSpeciesAnalysis, type SpeciesAnalysis } from "../simulation/core/renderFrame";
import { buildViewportFrame } from "../simulation/core/viewportFrame";

const DEFAULT_INITIAL_POPULATION = 150;
// Cap ticks processed per animation frame so a huge speed multiplier (x1000)
// cannot freeze the worker thread trying to catch up in a single burst.
const MAX_TICKS_PER_FRAME = 200;

// v1.6.0 — Modalità leggera: how often frames are sent to the screen and how
// often the (costly) per-species analysis is recomputed. These only change
// what is reported, never what is simulated. Defaults match the old
// behavior (a frame every ~33 ms, analysis fresh on every frame).
let frameIntervalMs = 33;
let speciesStatsIntervalMs = 0;
let lastPostAt = 0;
let lastPostedTick = -1;
let speciesCache: { at: number; value: SpeciesAnalysis } | null = null;

let world: World | null = null;
const clock = new SimulationClock();
let lastFrameTime = 0;
let loopHandle: ReturnType<typeof setInterval> | null = null;

function post(event: WorkerEvent): void {
  (self as unknown as Worker).postMessage(event);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Errore sconosciuto nel motore di simulazione.";
}

/** Builds and sends one frame, reusing the species analysis if it is recent enough (or recomputing it when `fresh`). */
function postFrame(now: number, fresh = false): void {
  if (!world) return;
  if (fresh || !speciesCache || now - speciesCache.at >= speciesStatsIntervalMs) {
    speciesCache = { at: now, value: computeSpeciesAnalysis(world) };
  }
  lastPostAt = now;
  lastPostedTick = world.tick;
  post({ type: "frame", frame: buildRenderFrame(world, speciesCache.value) });
}

/** Forgets cached state when a different world replaces the current one. */
function resetReporting(): void {
  speciesCache = null;
  lastPostAt = 0;
  lastPostedTick = -1;
}

function stopLoop(): void {
  if (loopHandle !== null) {
    clearInterval(loopHandle);
    loopHandle = null;
  }
}

/**
 * Runs one simulation tick with an error boundary (v1.0.2 — robustezza).
 * The engine itself has no known failure paths under normal use, but a
 * worker running unattended for a very long time, at very high speed
 * multipliers, on whatever hardware a phone happens to have, is exactly
 * the kind of long tail where defensive handling earns its cost: if
 * something does throw, this stops the loop (so it can't spin forever
 * re-throwing on every tick) and reports it to the UI instead of the
 * worker silently dying with no explanation.
 */
function safeStep(): boolean {
  if (!world) return false;
  try {
    world.step();
    return true;
  } catch (err) {
    stopLoop();
    post({ type: "error", message: errorMessage(err) });
    return false;
  }
}

function startLoop(): void {
  if (loopHandle !== null) return;
  lastFrameTime = Date.now();
  loopHandle = setInterval(() => {
    if (!world) return;
    const now = Date.now();
    const elapsed = now - lastFrameTime;
    lastFrameTime = now;

    const ticks = Math.min(clock.ticksForElapsed(elapsed), MAX_TICKS_PER_FRAME);
    for (let i = 0; i < ticks; i++) {
      if (!safeStep()) return; // loop already stopped inside safeStep on error
    }
    // Frames are sent at most every frameIntervalMs; while paused nothing
    // changes, so nothing is sent at all (the last frame is still on screen).
    const paused = clock.getSpeed() === 0;
    if (ticks > 0 || (paused && world.tick !== lastPostedTick)) {
      if (now - lastPostAt >= frameIntervalMs) postFrame(now);
    }
  }, 1000 / 30); // 30fps worker tick loop, independent of simulation speed
}

self.onmessage = (event: MessageEvent<WorkerCommand>) => {
  try {
    const command = event.data;
    switch (command.type) {
      case "init": {
        world = new World(command.config, command.initialPopulation ?? DEFAULT_INITIAL_POPULATION);
        clock.setSpeed(1);
        resetReporting();
        startLoop();
        postFrame(Date.now(), true);
        break;
      }
      case "reset": {
        world = new World(command.config, command.initialPopulation ?? DEFAULT_INITIAL_POPULATION);
        clock.reset();
        resetReporting();
        startLoop();
        postFrame(Date.now(), true);
        break;
      }
      case "setSpeed": {
        clock.setSpeed(command.speed);
        // Pausing: make sure the screen shows the very latest state, since no more frames follow.
        if (command.speed === 0 && world) postFrame(Date.now(), true);
        break;
      }
      case "setPerformance": {
        frameIntervalMs = Math.max(0, command.frameIntervalMs);
        speciesStatsIntervalMs = Math.max(0, command.speciesStatsIntervalMs);
        break;
      }
      case "requestSnapshot": {
        if (world) post({ type: "snapshot", snapshot: world.toSnapshot() });
        break;
      }
      case "requestOrganismDetail": {
        // v1.0.4 — Esplorazione individuale: full detail for one specific
        // organism, requested by id after the person selects it in the 3D
        // view. RenderFrame only carries the handful of visual traits
        // needed to draw a creature, not its full genome/brain/memory —
        // this is a separate, on-demand fetch so per-frame bandwidth stays
        // small regardless of how large the population is.
        const organism = world ? world.findOrganismById(command.organismId) : null;
        post({ type: "organismDetail", organismId: command.organismId, organism });
        break;
      }
      case "loadSnapshot": {
        // v1.0.1 — Persistenza: resumes a previously saved World exactly as
        // it was (same organisms, species registry, tick, RNG state — see
        // World.fromSnapshot), rather than generating a fresh random one.
        world = World.fromSnapshot(command.snapshot);
        clock.setSpeed(1);
        resetReporting();
        startLoop();
        postFrame(Date.now(), true);
        break;
      }
      case "requestViewport": {
        // v1.1 — on-demand terrain/vegetation texture for the 3D view,
        // decoupled from the per-tick frame loop entirely (see
        // simulation/core/viewportFrame.ts). Computed synchronously since
        // it's bounded by the request's own resolution cap, not by the
        // planet's actual size.
        if (world) post({ type: "viewportFrame", frame: buildViewportFrame(world, command.request) });
        break;
      }
    }
  } catch (err) {
    stopLoop();
    post({ type: "error", message: errorMessage(err) });
  }
};

post({ type: "ready" });
