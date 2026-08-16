/// <reference lib="webworker" />

import type { WorkerCommand, WorkerEvent } from "../types";
import { World } from "../simulation/core/world";
import { SimulationClock } from "../simulation/core/clock";
import { buildRenderFrame } from "../simulation/core/renderFrame";

const DEFAULT_INITIAL_POPULATION = 150;
// Cap ticks processed per animation frame so a huge speed multiplier (x1000)
// cannot freeze the worker thread trying to catch up in a single burst.
const MAX_TICKS_PER_FRAME = 200;

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
    if (ticks > 0 || clock.getSpeed() === 0) {
      post({ type: "frame", frame: buildRenderFrame(world) });
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
        startLoop();
        post({ type: "frame", frame: buildRenderFrame(world) });
        break;
      }
      case "reset": {
        world = new World(command.config, command.initialPopulation ?? DEFAULT_INITIAL_POPULATION);
        clock.reset();
        startLoop();
        post({ type: "frame", frame: buildRenderFrame(world) });
        break;
      }
      case "setSpeed": {
        clock.setSpeed(command.speed);
        break;
      }
      case "requestSnapshot": {
        if (world) post({ type: "snapshot", snapshot: world.toSnapshot() });
        break;
      }
      case "loadSnapshot": {
        // v1.0.1 — Persistenza: resumes a previously saved World exactly as
        // it was (same organisms, species registry, tick, RNG state — see
        // World.fromSnapshot), rather than generating a fresh random one.
        world = World.fromSnapshot(command.snapshot);
        clock.setSpeed(1);
        startLoop();
        post({ type: "frame", frame: buildRenderFrame(world) });
        break;
      }
    }
  } catch (err) {
    stopLoop();
    post({ type: "error", message: errorMessage(err) });
  }
};

post({ type: "ready" });
