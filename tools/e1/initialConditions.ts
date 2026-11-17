/**
 * E1 — costruzione di condizioni iniziali e perturbazioni.
 *
 * Queste funzioni modificano SOLO lo snapshot del mondo (cioè le condizioni
 * iniziali) o l'array pubblico degli organismi per una perturbazione
 * esplicita. Non toccano nessuna regola, costante o funzione del motore.
 */
import type { Organism, SpeciesRecord, WorldSnapshot } from "../../types";
import type { World } from "../../simulation/core/world";
import { World as WorldClass } from "../../simulation/core/world";

export type SetupKind =
  | "baseline"
  | "herbivore"
  | "carnivore"
  | "mixed"
  | "oldWeak"
  | "poorHabitat"
  | "richHabitat";

export type PerturbationKind = "none" | "cull80" | "cull95";

function syncRegistry(snapshot: WorldSnapshot): void {
  const counts = new Map<number, number>();
  for (const o of snapshot.organisms) counts.set(o.speciesId, (counts.get(o.speciesId) ?? 0) + 1);
  for (const r of snapshot.speciesRegistry) {
    r.population = counts.get(r.speciesId) ?? 0;
    r.alive = r.population > 0;
    r.extinctionTick = r.alive ? null : (r.extinctionTick ?? snapshot.tick);
  }
  const missing = [...counts.keys()].filter((id) => !snapshot.speciesRegistry.some((r) => r.speciesId === id));
  for (const id of missing) {
    const example = snapshot.organisms.find((o) => o.speciesId === id)!;
    const record: SpeciesRecord = {
      speciesId: id,
      parentSpeciesId: null,
      originTick: snapshot.tick,
      originYear: Math.floor(snapshot.tick / 400),
      population: counts.get(id) ?? 0,
      alive: true,
      extinctionTick: null,
      originGenomeSnapshot: { ...example.genome },
    };
    snapshot.speciesRegistry.push(record);
  }
  snapshot.nextSpeciesId = Math.max(snapshot.nextSpeciesId, ...counts.keys(), ...snapshot.speciesRegistry.map((r) => r.speciesId)) + 1;
}

/** Trova celle non-ocean con vegetazione baseline più bassa/alta (read-only). */
function habitatCells(world: World, wantHigh: boolean, count: number): Array<{ x: number; y: number }> {
  const candidates: Array<{ x: number; y: number; v: number }> = [];
  const step = Math.max(2, Math.floor(Math.min(world.planet.width, world.planet.height) / 32));
  for (let y = 0; y < world.planet.height; y += step) {
    for (let x = 0; x < world.planet.width; x += step) {
      const cell = world.planet.sampleBaseline(x, y);
      if (cell.terrain === "ocean") continue;
      candidates.push({ x, y, v: cell.vegetation });
    }
  }
  candidates.sort((a, b) => (wantHigh ? b.v - a.v : a.v - b.v));
  return candidates.slice(0, Math.max(1, count)).map(({ x, y }) => ({ x, y }));
}

/** Applica una condizione iniziale; restituisce un World ricostruito dallo snapshot. */
export function applySetup(world: World, kind: SetupKind): World {
  if (kind === "baseline") return world;
  const snapshot = world.toSnapshot();
  const organisms: Organism[] = snapshot.organisms;

  switch (kind) {
    case "herbivore":
      for (const o of organisms) o.genome.carnivory = 0.05;
      break;
    case "carnivore":
      for (const o of organisms) o.genome.carnivory = 0.6;
      break;
    case "mixed":
      organisms.forEach((o, i) => {
        const predator = i % 2 === 1;
        o.genome.carnivory = predator ? 0.6 : 0.05;
        o.speciesId = predator ? 2 : 1;
      });
      break;
    case "oldWeak":
      for (const o of organisms) {
        o.energy = 3;
        o.age = Math.max(0, Math.floor(o.genome.lifespan) - 1);
      }
      break;
    case "poorHabitat":
    case "richHabitat": {
      const cells = habitatCells(world, kind === "richHabitat", 24);
      organisms.forEach((o, i) => {
        const cell = cells[i % cells.length];
        o.position = { x: cell.x + 0.5, y: cell.y + 0.5 };
        o.home = { x: cell.x + 0.5, y: cell.y + 0.5 };
      });
      break;
    }
    default:
      break;
  }

  syncRegistry(snapshot);
  return WorldClass.fromSnapshot(snapshot);
}

/** Perturbazione esplicita: rimozione di una frazione della popolazione, senza RNG. */
export function applyPerturbation(world: World, kind: PerturbationKind): World {
  if (kind === "none") return world;
  const keepEvery = kind === "cull80" ? 5 : 20;
  const snapshot = world.toSnapshot();
  snapshot.organisms = snapshot.organisms.filter((_, i) => i % keepEvery === 0);
  syncRegistry(snapshot);
  return WorldClass.fromSnapshot(snapshot);
}
