"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PlanetConfig,
  PlanetInstance,
  SavedSession,
  SimulationSpeed,
  WorkerCommand,
  WorkerEvent,
  WorldSnapshot,
} from "../types";
import { saveSession as persistSession } from "./persistence";

const PLANET_WIDTH = 100;
const PLANET_HEIGHT = 100;
const DEFAULT_POPULATION = 150;
/** How long to wait for a worker to respond to a snapshot request before giving up (e.g. a stuck or terminated worker) — see saveSession. */
const SNAPSHOT_TIMEOUT_MS = 8000;

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

interface PendingSnapshot {
  resolve: (snapshot: WorldSnapshot) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
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
 *
 * v1.0.1 adds session persistence: saveSession asks every running
 * planet's worker for its current WorldSnapshot (the same
 * requestSnapshot/snapshot protocol that has existed since the worker was
 * first written) and writes them all to IndexedDB together; loadSession
 * tears down every currently running planet and rebuilds each one from a
 * saved WorldSnapshot via the new "loadSnapshot" worker command, resuming
 * exactly where it left off — same organisms, species registry, tick, and
 * RNG state.
 */
export function useMultiverse() {
  const [planets, setPlanets] = useState<PlanetInstance[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const workersRef = useRef<Map<string, Worker>>(new Map());
  const nextIndexRef = useRef(1);
  const pendingSnapshotsRef = useRef<Map<string, PendingSnapshot>>(new Map());

  /** Wires up a worker's message handling, shared by both the "start fresh" and "resume from snapshot" spawn paths. */
  const attachWorker = useCallback((id: string, worker: Worker, onReady: () => void) => {
    worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
      const msg = event.data;
      if (msg.type === "ready") {
        onReady();
        setPlanets((prev) => prev.map((p) => (p.id === id ? { ...p, ready: true } : p)));
      } else if (msg.type === "frame") {
        setPlanets((prev) => prev.map((p) => (p.id === id ? { ...p, frame: msg.frame } : p)));
      } else if (msg.type === "snapshot") {
        const pending = pendingSnapshotsRef.current.get(id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          pendingSnapshotsRef.current.delete(id);
          pending.resolve(msg.snapshot);
        }
      }
    };
    worker.onerror = () => {
      const pending = pendingSnapshotsRef.current.get(id);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pendingSnapshotsRef.current.delete(id);
        pending.reject(new Error(`Il worker del pianeta ${id} ha smesso di rispondere.`));
      }
    };
  }, []);

  const spawnPlanet = useCallback(
    (seed?: number) => {
      const id = `planet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const name = `Pianeta ${nextIndexRef.current++}`;
      const finalSeed = seed ?? randomSeed();
      const config: PlanetConfig = { width: PLANET_WIDTH, height: PLANET_HEIGHT, seed: finalSeed };

      const worker = new Worker(new URL("../workers/simulation.worker.ts", import.meta.url));
      workersRef.current.set(id, worker);
      attachWorker(id, worker, () => {
        worker.postMessage({ type: "init", config, initialPopulation: DEFAULT_POPULATION } satisfies WorkerCommand);
      });

      setPlanets((prev) => [...prev, { id, name, seed: finalSeed, frame: null, speed: 1, ready: false }]);
      setActiveId((current) => current ?? id);
      return id;
    },
    [attachWorker],
  );

  const removePlanet = useCallback((id: string) => {
    workersRef.current.get(id)?.terminate();
    workersRef.current.delete(id);
    pendingSnapshotsRef.current.delete(id);
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

  /** Asks one planet's worker for its current WorldSnapshot. Rejects if it doesn't respond within SNAPSHOT_TIMEOUT_MS. */
  const requestPlanetSnapshot = useCallback((id: string): Promise<WorldSnapshot> => {
    const worker = workersRef.current.get(id);
    if (!worker) return Promise.reject(new Error(`Nessun worker attivo per il pianeta ${id}.`));

    return new Promise<WorldSnapshot>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingSnapshotsRef.current.delete(id);
        reject(new Error(`Timeout in attesa dello snapshot del pianeta ${id}.`));
      }, SNAPSHOT_TIMEOUT_MS);
      pendingSnapshotsRef.current.set(id, { resolve, reject, timeoutId });
      worker.postMessage({ type: "requestSnapshot" } satisfies WorkerCommand);
    });
  }, []);

  /** Saves every currently running planet as one session. Returns the new session's id. */
  const saveSession = useCallback(
    async (label?: string): Promise<string> => {
      const currentPlanets = planets;
      if (currentPlanets.length === 0) {
        throw new Error("Nessun pianeta da salvare.");
      }

      const snapshots = await Promise.all(currentPlanets.map((p) => requestPlanetSnapshot(p.id)));

      const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const session: SavedSession = {
        id: sessionId,
        label: label?.trim() || new Date().toLocaleString("it-IT"),
        savedAt: Date.now(),
        activePlanetId: activeId,
        planets: currentPlanets.map((p, i) => ({ id: p.id, name: p.name, seed: p.seed, snapshot: snapshots[i] })),
      };

      await persistSession(session);
      return sessionId;
    },
    [planets, activeId, requestPlanetSnapshot],
  );

  /** Tears down every currently running planet and rebuilds each one from a saved session's WorldSnapshots, resuming exactly where it left off. */
  const loadSession = useCallback(
    (session: SavedSession) => {
      for (const worker of workersRef.current.values()) worker.terminate();
      workersRef.current.clear();
      pendingSnapshotsRef.current.clear();

      const restored: PlanetInstance[] = session.planets.map((sp) => ({
        id: sp.id,
        name: sp.name,
        seed: sp.seed,
        frame: null,
        speed: 1,
        ready: false,
      }));
      setPlanets(restored);
      setActiveId(session.activePlanetId ?? session.planets[0]?.id ?? null);

      for (const sp of session.planets) {
        const worker = new Worker(new URL("../workers/simulation.worker.ts", import.meta.url));
        workersRef.current.set(sp.id, worker);
        attachWorker(sp.id, worker, () => {
          worker.postMessage({ type: "loadSnapshot", snapshot: sp.snapshot } satisfies WorkerCommand);
        });
      }
    },
    [attachWorker],
  );

  // Start with exactly one planet, matching the pre-v0.9 default experience.
  useEffect(() => {
    spawnPlanet();
    return () => {
      for (const worker of workersRef.current.values()) worker.terminate();
      workersRef.current.clear();
      for (const pending of pendingSnapshotsRef.current.values()) clearTimeout(pending.timeoutId);
      pendingSnapshotsRef.current.clear();
    };
    // Intentionally mount-only: spawnPlanet itself is stable (useCallback,
    // no changing deps) and we only ever want this initial spawn once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    planets,
    activeId,
    setActiveId,
    spawnPlanet,
    removePlanet,
    setSpeed,
    togglePause,
    resetPlanet,
    saveSession,
    loadSession,
  };
}
