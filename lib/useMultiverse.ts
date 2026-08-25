"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Organism,
  PlanetConfig,
  PlanetInstance,
  SavedSession,
  SimulationSpeed,
  ViewportRequest,
  WorkerCommand,
  WorkerEvent,
  WorldSnapshot,
} from "../types";
import { saveSession as persistSession } from "./persistence";
import { maybeAppendHistory } from "./historyAccumulation";

const DEFAULT_POPULATION = 150;
/**
 * v1.1 — World Scale. Fixed size presets, replacing the old flat 100x100
 * default. Kept as constants here (not just in StartScreen) because
 * resetPlanet/recoverPlanet need a fallback size too, when a planet's own
 * config isn't available for some reason.
 */
export const WORLD_SIZE_PRESETS = {
  small: { width: 512, height: 512 },
  medium: { width: 1024, height: 1024 },
  large: { width: 2048, height: 2048 },
} as const;
const DEFAULT_PLANET_CONFIG = WORLD_SIZE_PRESETS.medium;
/** How long to wait for a worker to respond to a snapshot request before giving up (e.g. a stuck or terminated worker) — see saveSession. */
const SNAPSHOT_TIMEOUT_MS = 8000;
/** Same idea as SNAPSHOT_TIMEOUT_MS, for a single organism detail request (v1.0.4). */
const ORGANISM_DETAIL_TIMEOUT_MS = 5000;

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

interface PendingSnapshot {
  resolve: (snapshot: WorldSnapshot) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface PendingOrganismDetail {
  resolve: (organism: Organism | null) => void;
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
 * v1.0.1 added session persistence: saveSession asks every running
 * planet's worker for its current WorldSnapshot and writes them all to
 * IndexedDB together; loadSession tears down every currently running
 * planet and rebuilds each one from a saved WorldSnapshot, resuming
 * exactly where it left off.
 *
 * v1.0.2 added error recovery: if a planet's worker reports an internal
 * error, that planet's `error` field is set and its simulation loop has
 * stopped; recoverPlanet terminates the broken worker and starts a fresh
 * one with the same seed.
 *
 * v1.0.3 adds historical observation: every time a frame arrives, a
 * lightweight HistoryPoint is sampled at most once every
 * HISTORY_SAMPLE_INTERVAL_TICKS ticks (population, species count,
 * biodiversity, a couple of average traits, average vegetation) and
 * appended to that planet's history array, entirely client-side from data
 * already present in the RenderFrame — no new engine computation. History
 * is included in saved sessions so a resumed simulation keeps its
 * historical record.
 */
export function useMultiverse() {
  const [planets, setPlanets] = useState<PlanetInstance[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const workersRef = useRef<Map<string, Worker>>(new Map());
  const nextIndexRef = useRef(1);
  const pendingSnapshotsRef = useRef<Map<string, PendingSnapshot>>(new Map());
  const pendingOrganismDetailsRef = useRef<Map<string, PendingOrganismDetail>>(new Map());
  const planetsRef = useRef<PlanetInstance[]>([]);

  useEffect(() => {
    planetsRef.current = planets;
  }, [planets]);

  /** Wires up a worker's message handling, shared by every spawn path (fresh, resumed from snapshot, or recovered after an error). */
  const attachWorker = useCallback((id: string, worker: Worker, onReady: () => void) => {
    worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
      const msg = event.data;
      if (msg.type === "ready") {
        onReady();
        setPlanets((prev) => prev.map((p) => (p.id === id ? { ...p, ready: true, error: null } : p)));
      } else if (msg.type === "frame") {
        setPlanets((prev) =>
          prev.map((p) => (p.id === id ? { ...p, frame: msg.frame, error: null, history: maybeAppendHistory(p.history, msg.frame) } : p)),
        );
      } else if (msg.type === "viewportFrame") {
        // v1.1 — on-demand terrain payload, independent of the per-tick
        // frame; simply stored as the latest one for this planet.
        setPlanets((prev) => prev.map((p) => (p.id === id ? { ...p, viewportFrame: msg.frame } : p)));
      } else if (msg.type === "snapshot") {
        const pending = pendingSnapshotsRef.current.get(id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          pendingSnapshotsRef.current.delete(id);
          pending.resolve(msg.snapshot);
        }
      } else if (msg.type === "error") {
        setPlanets((prev) => prev.map((p) => (p.id === id ? { ...p, error: msg.message } : p)));
        const pending = pendingSnapshotsRef.current.get(id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          pendingSnapshotsRef.current.delete(id);
          pending.reject(new Error(msg.message));
        }
        const pendingDetail = pendingOrganismDetailsRef.current.get(id);
        if (pendingDetail) {
          clearTimeout(pendingDetail.timeoutId);
          pendingOrganismDetailsRef.current.delete(id);
          pendingDetail.reject(new Error(msg.message));
        }
      } else if (msg.type === "organismDetail") {
        const pendingDetail = pendingOrganismDetailsRef.current.get(id);
        if (pendingDetail) {
          clearTimeout(pendingDetail.timeoutId);
          pendingOrganismDetailsRef.current.delete(id);
          pendingDetail.resolve(msg.organism);
        }
      }
    };
    worker.onerror = () => {
      const message = `Il worker del pianeta ${id} ha smesso di rispondere.`;
      setPlanets((prev) => prev.map((p) => (p.id === id ? { ...p, error: message } : p)));
      const pending = pendingSnapshotsRef.current.get(id);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pendingSnapshotsRef.current.delete(id);
        pending.reject(new Error(message));
      }
      const pendingDetail = pendingOrganismDetailsRef.current.get(id);
      if (pendingDetail) {
        clearTimeout(pendingDetail.timeoutId);
        pendingOrganismDetailsRef.current.delete(id);
        pendingDetail.reject(new Error(message));
      }
    };
  }, []);

  const spawnPlanet = useCallback(
    (options?: { seed?: number; width?: number; height?: number; population?: number }) => {
      const id = `planet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const name = `Pianeta ${nextIndexRef.current++}`;
      const finalSeed = options?.seed ?? randomSeed();
      const config: PlanetConfig = {
        width: options?.width ?? DEFAULT_PLANET_CONFIG.width,
        height: options?.height ?? DEFAULT_PLANET_CONFIG.height,
        seed: finalSeed,
      };
      const population = options?.population ?? DEFAULT_POPULATION;

      const worker = new Worker(new URL("../workers/simulation.worker.ts", import.meta.url));
      workersRef.current.set(id, worker);
      attachWorker(id, worker, () => {
        worker.postMessage({ type: "init", config, initialPopulation: population } satisfies WorkerCommand);
      });

      setPlanets((prev) => [
        ...prev,
        { id, name, seed: finalSeed, config, frame: null, viewportFrame: null, speed: 1, ready: false, error: null, history: [] },
      ]);
      setActiveId((current) => current ?? id);
      return id;
    },
    [attachWorker],
  );

  const removePlanet = useCallback((id: string) => {
    workersRef.current.get(id)?.terminate();
    workersRef.current.delete(id);
    pendingSnapshotsRef.current.delete(id);
    pendingOrganismDetailsRef.current.delete(id);
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

  /**
   * v1.1 — resets at the planet's *own* previously configured size (kept
   * on PlanetInstance.config), not a hardcoded default: pre-v1.1 this
   * silently reset every planet back to a fixed 100x100 regardless of
   * what size it had actually been created at, a latent bug that was
   * invisible only because every planet used to be that same fixed size.
   */
  const resetPlanet = useCallback((id: string, seed?: number) => {
    const finalSeed = seed ?? randomSeed();
    const previous = planetsRef.current.find((p) => p.id === id);
    const size = previous?.config ?? DEFAULT_PLANET_CONFIG;
    const config: PlanetConfig = { width: size.width, height: size.height, seed: finalSeed };
    workersRef.current.get(id)?.postMessage({
      type: "reset",
      config,
      initialPopulation: DEFAULT_POPULATION,
    } satisfies WorkerCommand);
    setPlanets((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, seed: finalSeed, config, speed: 1, frame: null, viewportFrame: null, error: null, history: [] } : p,
      ),
    );
  }, []);

  /**
   * Recovers a planet whose worker reported an error (v1.0.2): terminates
   * the broken worker and starts a fresh one with the same seed. This is
   * an honest fresh restart, not a resume of the exact state at the
   * moment of failure — that would require a live snapshot kept
   * continuously up to date, which isn't done automatically (see v1.0.1's
   * manual "Salva sessione" for point-in-time saves the person controls).
   * The planet's chart history is kept (not reset), so recovering doesn't
   * erase what had already been observed.
   *
   * v1.1 — restarts at the planet's own config.width/height (same fix as
   * resetPlanet above), not a hardcoded size.
   */
  const recoverPlanet = useCallback(
    (id: string) => {
      const planet = planetsRef.current.find((p) => p.id === id);
      if (!planet) return;

      workersRef.current.get(id)?.terminate();
      pendingSnapshotsRef.current.delete(id);

      const config: PlanetConfig = { width: planet.config.width, height: planet.config.height, seed: planet.seed };
      const worker = new Worker(new URL("../workers/simulation.worker.ts", import.meta.url));
      workersRef.current.set(id, worker);
      attachWorker(id, worker, () => {
        worker.postMessage({ type: "init", config, initialPopulation: DEFAULT_POPULATION } satisfies WorkerCommand);
      });

      setPlanets((prev) => prev.map((p) => (p.id === id ? { ...p, config, error: null, ready: false, frame: null, viewportFrame: null } : p)));
    },
    [attachWorker],
  );

  /**
   * v1.1 — requests a terrain/vegetation texture for the given viewport
   * (see ViewportRequest/ViewportFrame), on demand — not tied to the
   * per-tick frame loop. Fire-and-forget from the caller's perspective:
   * the response arrives asynchronously as a "viewportFrame" worker
   * event, delivered via onViewportFrame's subscription below rather than
   * a promise, since the UI only ever cares about the *latest* one, not
   * about matching responses to individual requests.
   */
  const requestViewport = useCallback((id: string, request: ViewportRequest) => {
    workersRef.current.get(id)?.postMessage({ type: "requestViewport", request } satisfies WorkerCommand);
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

  /** v1.0.4 — Esplorazione individuale: fetches full detail (genome, brain, memory, position, etc.) for one specific organism, by id, from a planet's worker. Resolves to null if the organism is no longer alive/present. */
  const requestOrganismDetail = useCallback((planetId: string, organismId: number): Promise<Organism | null> => {
    const worker = workersRef.current.get(planetId);
    if (!worker) return Promise.reject(new Error(`Nessun worker attivo per il pianeta ${planetId}.`));

    return new Promise<Organism | null>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingOrganismDetailsRef.current.delete(planetId);
        reject(new Error("Timeout in attesa dei dettagli dell'organismo."));
      }, ORGANISM_DETAIL_TIMEOUT_MS);
      pendingOrganismDetailsRef.current.set(planetId, { resolve, reject, timeoutId });
      worker.postMessage({ type: "requestOrganismDetail", organismId } satisfies WorkerCommand);
    });
  }, []);

  /** Saves every currently running planet (including its history) as one session. Returns the new session's id. */
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
        planets: currentPlanets.map((p, i) => ({
          id: p.id,
          name: p.name,
          seed: p.seed,
          snapshot: snapshots[i],
          history: p.history,
        })),
      };

      await persistSession(session);
      return sessionId;
    },
    [planets, activeId, requestPlanetSnapshot],
  );

  /** Tears down every currently running planet and rebuilds each one from a saved session's WorldSnapshots (and history), resuming exactly where it left off. */
  const loadSession = useCallback(
    (session: SavedSession) => {
      for (const worker of workersRef.current.values()) worker.terminate();
      workersRef.current.clear();
      pendingSnapshotsRef.current.clear();

      const restored: PlanetInstance[] = session.planets.map((sp) => ({
        id: sp.id,
        name: sp.name,
        seed: sp.seed,
        // v1.1 — the saved snapshot carries the planet's real config
        // (including its size); a resumed session keeps the same world
        // size it was saved at, same fix as resetPlanet/recoverPlanet.
        config: sp.snapshot.planet.config,
        frame: null,
        viewportFrame: null,
        speed: 1,
        ready: false,
        error: null,
        history: sp.history,
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

  // v1.0.5 — no longer auto-spawns a planet on mount: the person now
  // chooses explicitly, via the start screen, whether to create a new
  // world (spawnPlanet) or resume a saved one (loadSession). This effect
  // only ever handles cleanup on unmount.
  useEffect(() => {
    return () => {
      for (const worker of workersRef.current.values()) worker.terminate();
      workersRef.current.clear();
      for (const pending of pendingSnapshotsRef.current.values()) clearTimeout(pending.timeoutId);
      pendingSnapshotsRef.current.clear();
      for (const pending of pendingOrganismDetailsRef.current.values()) clearTimeout(pending.timeoutId);
      pendingOrganismDetailsRef.current.clear();
    };
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
    recoverPlanet,
    saveSession,
    loadSession,
    requestOrganismDetail,
    requestViewport,
  };
}
