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
      world.step();
    }
    if (ticks > 0 || clock.getSpeed() === 0) {
      post({ type: "frame", frame: buildRenderFrame(world) });
    }
  }, 1000 / 30); // 30fps worker tick loop, independent of simulation speed
}

self.onmessage = (event: MessageEvent<WorkerCommand>) => {
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
  }
};

post({ type: "ready" });
