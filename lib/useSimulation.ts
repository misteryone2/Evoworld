"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlanetConfig, RenderFrame, SimulationSpeed, WorkerCommand, WorkerEvent } from "../types";

const DEFAULT_CONFIG: PlanetConfig = { width: 100, height: 100, seed: 1337 };
const DEFAULT_POPULATION = 150;

/**
 * The only place in the UI layer that knows a Worker exists. Everything
 * else (canvas, controls, stats) just consumes the `frame` this hook
 * exposes. The simulation engine itself lives entirely inside the worker.
 */
export function useSimulation() {
  const workerRef = useRef<Worker | null>(null);
  const [frame, setFrame] = useState<RenderFrame | null>(null);
  const [speed, setSpeedState] = useState<SimulationSpeed>(1);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/simulation.worker.ts", import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
      const msg = event.data;
      if (msg.type === "ready") {
        setReady(true);
        send({ type: "init", config: DEFAULT_CONFIG, initialPopulation: DEFAULT_POPULATION });
      } else if (msg.type === "frame") {
        setFrame(msg.frame);
      }
    };

    function send(command: WorkerCommand) {
      worker.postMessage(command);
    }

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const setSpeed = useCallback((next: SimulationSpeed) => {
    setSpeedState(next);
    workerRef.current?.postMessage({ type: "setSpeed", speed: next } satisfies WorkerCommand);
  }, []);

  const togglePause = useCallback(() => {
    setSpeedState((current) => {
      const next: SimulationSpeed = current === 0 ? 1 : 0;
      workerRef.current?.postMessage({ type: "setSpeed", speed: next } satisfies WorkerCommand);
      return next;
    });
  }, []);

  const reset = useCallback((seed?: number) => {
    const config: PlanetConfig = { ...DEFAULT_CONFIG, seed: seed ?? Date.now() % 1_000_000 };
    workerRef.current?.postMessage({
      type: "reset",
      config,
      initialPopulation: DEFAULT_POPULATION,
    } satisfies WorkerCommand);
    setSpeedState(1);
  }, []);

  return { frame, speed, setSpeed, togglePause, reset, ready };
}
