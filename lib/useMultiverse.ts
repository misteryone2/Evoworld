"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlanetConfig, PlanetInstance, SimulationSpeed, WorkerCommand, WorkerEvent } from "../types";

const PLANET_WIDTH = 100;
const PLANET_HEIGHT = 100;
const DEFAULT_POPULATION = 150;

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

/**
 * Manages any number of independent planets (v0.9), each its own World
 * running in its own Web Worker — the engine itself (simulation/) has no
 * idea multiple planets can exist; every worker is just running the exact
 * same single-world simulation.worker.ts as before, spawned more than
 * once. This hook's only job is bookkeeping: tracking each planet's latest
 * frame, forwarding commands to the right worker, and cleaning up workers
 * when a planet is removed or the app unmounts.
 *
 * Only the currently active planet's 3D view is ever mounted in the UI
 * (see app/page.tsx) — every planet keeps simulating in its worker
 * regardless of which one is "active", but rendering N simultaneous
 * WebGL scenes would risk exceeding a browser's (especially a mobile
 * browser's) concurrent WebGL context limit, so only one is ever drawn at
 * a time. The comparison view (PlanetComparison) only needs each planet's
 * lightweight stats, not its 3D scene, so it works across all planets at
 * once without that constraint.
 */
export function useMultiverse() {
  const [planets, setPlanets] = useState<PlanetInstance[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const workersRef = useRef<Map<string, Worker>>(new Map());
  const nextIndexRef = useRef(1);

  const spawnPlanet = useCallback((seed?: number) => {
    const id = `planet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const name = `Pianeta ${nextIndexRef.current++}`;
    const finalSeed = seed ?? randomSeed();
    const config: PlanetConfig = { width: PLANET_WIDTH, height: PLANET_HEIGHT, seed: finalSeed };

    const worker = new Worker(new URL("../workers/simulation.worker.ts", import.meta.url));
    workersRef.current.set(id, worker);

    worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
      const msg = event.data;
      if (msg.type === "ready") {
        worker.postMessage({ type: "init", config, initialPopulation: DEFAULT_POPULATION } satisfies WorkerCommand);
        setPlanets((prev) => prev.map((p) => (p.id === id ? { ...p, ready: true } : p)));
      } else if (msg.type === "frame") {
        setPlanets((prev) => prev.map((p) => (p.id === id ? { ...p, frame: msg.frame } : p)));
      }
    };

    setPlanets((prev) => [...prev, { id, name, seed: finalSeed, frame: null, speed: 1, ready: false }]);
    setActiveId((current) => current ?? id);
    return id;
  }, []);

  const removePlanet = useCallback((id: string) => {
    workersRef.current.get(id)?.terminate();
    workersRef.current.delete(id);
    setPlanets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      setActiveId((current) => (current === id ? (next[0]?.id ?? null) : current));
      return next;
    });
  }, []);

  const setSpeed = useCallback((id: string, speed: SimulationSpeed) => {
    workersRef.current.get(id)?.postMessage({ type: "setSpeed", speed } satisfies WorkerCommand);
    setPlanets((prev) => prev.map((p) => (p.id === id ? { ...p, speed } : p)));
  }, []);

  const togglePause = useCallback((id: string) => {
    setPlanets((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const next: SimulationSpeed = p.speed === 0 ? 1 : 0;
        workersRef.current.get(id)?.postMessage({ type: "setSpeed", speed: next } satisfies WorkerCommand);
        return { ...p, speed: next };
      }),
    );
  }, []);

  const resetPlanet = useCallback((id: string, seed?: number) => {
    const finalSeed = seed ?? randomSeed();
    const config: PlanetConfig = { width: PLANET_WIDTH, height: PLANET_HEIGHT, seed: finalSeed };
    workersRef.current.get(id)?.postMessage({
      type: "reset",
      config,
      initialPopulation: DEFAULT_POPULATION,
    } satisfies WorkerCommand);
    setPlanets((prev) => prev.map((p) => (p.id === id ? { ...p, seed: finalSeed, speed: 1, frame: null } : p)));
  }, []);

  // Start with exactly one planet, matching the pre-v0.9 default experience.
  useEffect(() => {
    spawnPlanet();
    return () => {
      for (const worker of workersRef.current.values()) worker.terminate();
      workersRef.current.clear();
    };
    // Intentionally mount-only: spawnPlanet itself is stable (useCallback,
    // no changing deps) and we only ever want this initial spawn once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { planets, activeId, setActiveId, spawnPlanet, removePlanet, setSpeed, togglePause, resetPlanet };
}
