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
import { DEFAULT_CHUNK_SIZE } from "../../simulation/core/constants";
import { hash32 } from "./metrics";

export type SetupKind =
  | "baseline"
  | "herbivore"
  | "carnivore"
  | "mixed"
  | "oldWeak"
  | "poorHabitat"
  | "richHabitat"
  /** S13: posizioni della griglia povera, vegetazione iniziale della griglia ricca. */
  | "poorPositionRichResources"
  /** S14: posizioni della griglia ricca, vegetazione iniziale della griglia povera. */
  | "richPositionPoorResources";

export type PerturbationKind = "none" | "cull80" | "cull95";

export interface HabitatSampledCell {
  x: number;
  y: number;
  vegetation: number;
}

/**
 * Metadati che dichiarano esplicitamente come sono state scelte le celle.
 * Le celle sono il risultato di una griglia regolare campionata: NON sono le
 * celle globalmente più ricche/povere del pianeta (che richiederebbero una
 * scansione esaustiva o la materializzazione di tutti i chunk).
 */
export interface HabitatSamplingInfo {
  method: "sampled_regular_grid";
  step: number;
  width: number;
  height: number;
  gridX: number;
  gridY: number;
  gridSamples: number;
  landCandidates: number;
  selectedCells: HabitatSampledCell[];
  meanSelectedVegetation: number;
  /** Nei controlli scambiati: valori di vegetazione applicati alle posizioni. */
  resourceCells?: HabitatSampledCell[];
  meanResourceVegetation?: number;
  globalExtremesClaimed: false;
  note: string;
}

export interface SetupInfo {
  kind: SetupKind;
  habitat?: HabitatSamplingInfo;
}

export interface PerturbationSpeciesCount {
  speciesId: number;
  before: number;
  removed: number;
  kept: number;
}

/** Report completo della perturbazione: conteggi esatti e metodo usato. */
export interface PerturbationReport {
  kind: PerturbationKind;
  tick: number;
  populationBefore: number;
  populationAfter: number;
  removed: number;
  kept: number;
  expectedKept: number;
  method: "deterministic_stratified_hash";
  perSpecies: PerturbationSpeciesCount[];
}

export interface PerturbationPlan {
  kept: Organism[];
  removed: Organism[];
  report: PerturbationReport;
}

/**
 * `World.fromSnapshot()` conserva `advancedGenome`/`geneEffects`, ma azzera
 * altri flag interni non serializzati. L'harness usa solo queste due opzioni:
 * se una di esse cambiasse nella ricostruzione, la corsa deve fallire invece
 * di produrre risultati silenziosamente non confrontabili.
 */
function assertSnapshotOptionsPreserved(before: WorldSnapshot, after: WorldSnapshot, context: string): void {
  const wanted = {
    advancedGenome: before.advancedGenome ?? true,
    geneEffects: before.geneEffects ?? true,
  };
  const actual = {
    advancedGenome: after.advancedGenome ?? true,
    geneEffects: after.geneEffects ?? true,
  };
  if (wanted.advancedGenome !== actual.advancedGenome || wanted.geneEffects !== actual.geneEffects) {
    throw new Error(
      `E1 ${context}: opzioni alterate da World.fromSnapshot() ` +
      `(advancedGenome ${wanted.advancedGenome}->${actual.advancedGenome}, ` +
      `geneEffects ${wanted.geneEffects}->${actual.geneEffects})`,
    );
  }
}

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

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/**
 * Celle non-ocean selezionate su una GRIGLIA REGOLARE CAMPIONATA, ordinate per
 * vegetazione baseline. `globalExtremesClaimed` resta false: la griglia non è
 * esaustiva e quindi non possiamo affermare che siano le celle globali estreme.
 */
function habitatCells(
  world: World,
  wantHigh: boolean,
  count: number,
): { cells: HabitatSampledCell[]; info: HabitatSamplingInfo } {
  const step = Math.max(2, Math.floor(Math.min(world.planet.width, world.planet.height) / 32));
  const candidates: HabitatSampledCell[] = [];
  let gridSamples = 0;
  for (let y = 0; y < world.planet.height; y += step) {
    for (let x = 0; x < world.planet.width; x += step) {
      gridSamples++;
      const cell = world.planet.sampleBaseline(x, y);
      if (cell.terrain === "ocean") continue;
      candidates.push({ x, y, vegetation: cell.vegetation });
    }
  }
  // Ordine totale deterministico: vegetazione, poi coordinate (tie-break).
  candidates.sort((a, b) =>
    wantHigh
      ? b.vegetation - a.vegetation || a.x - b.x || a.y - b.y
      : a.vegetation - b.vegetation || a.x - b.x || a.y - b.y,
  );
  const cells = candidates.slice(0, Math.max(1, count));
  return {
    cells,
    info: {
      method: "sampled_regular_grid",
      step,
      width: world.planet.width,
      height: world.planet.height,
      gridX: Math.ceil(world.planet.width / step),
      gridY: Math.ceil(world.planet.height / step),
      gridSamples,
      landCandidates: candidates.length,
      selectedCells: cells.map((c) => ({ ...c })),
      meanSelectedVegetation: round(mean(cells.map((c) => c.vegetation))),
      globalExtremesClaimed: false,
      note:
        "Celle selezionate da una griglia regolare campionata (step=" + step +
        "), non da una scansione esaustiva: non sono le celle globalmente più ricche o più povere.",
    },
  };
}

function round(value: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

interface SwapPreparation {
  position: ReturnType<typeof habitatCells>;
  resource: ReturnType<typeof habitatCells>;
  info: HabitatSamplingInfo;
}

/**
 * Prepara S13/S14: le posizioni vengono prese da una griglia e la vegetazione
 * iniziale dall'altra. Materializziamo solo i chunk delle posizioni scelte per
 * poter sovrascrivere la vegetazione nello snapshot: e una modifica delle
 * condizioni iniziali, non una regola del motore.
 */
function prepareSwap(world: World, kind: "poorPositionRichResources" | "richPositionPoorResources"): SwapPreparation {
  const richPositions = kind === "richPositionPoorResources";
  const position = habitatCells(world, richPositions, 24);
  const resource = habitatCells(world, !richPositions, 24);
  for (const cell of position.cells) world.planet.getCell(cell.x, cell.y);
  return {
    position,
    resource,
    info: {
      ...position.info,
      resourceCells: resource.cells.map((c) => ({ ...c })),
      meanResourceVegetation: round(mean(resource.cells.map((c) => c.vegetation))),
      note:
        position.info.note +
        " Le posizioni appartengono alla griglia " + (richPositions ? "ricca" : "povera") +
        "; la vegetazione iniziale e' prelevata dalla griglia " + (richPositions ? "povera" : "ricca") +
        " agli stessi indici di selezione, per separare effetto posizione ed effetto risorsa.",
    },
  };
}

/** Sovrascrive la vegetazione iniziale delle celle selezionate nello snapshot. */
function overrideVegetation(snapshot: WorldSnapshot, positions: HabitatSampledCell[], values: number[]): void {
  const chunkSize = snapshot.planet.config.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunks = new Map((snapshot.planet.chunks ?? []).map((c) => [c.key, c]));
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const cx = Math.floor(p.x / chunkSize);
    const cy = Math.floor(p.y / chunkSize);
    const chunk = chunks.get(`${cx},${cy}`);
    if (!chunk) throw new Error(`E1 habitat: chunk ${cx},${cy} non materializzato per la cella ${p.x},${p.y}`);
    const lx = p.x - cx * chunkSize;
    const ly = p.y - cy * chunkSize;
    const index = ly * chunkSize + lx;
    if (!chunk.cells[index]) throw new Error(`E1 habitat: cella assente nello snapshot per ${p.x},${p.y}`);
    chunk.cells[index].vegetation = values[i % values.length];
  }
}

/** Applica una condizione iniziale; restituisce World e metadati di selezione. */
export function applySetupWithInfo(world: World, kind: SetupKind): { world: World; info: SetupInfo } {
  if (kind === "baseline") return { world, info: { kind } };

  let swap: SwapPreparation | null = null;
  if (kind === "poorPositionRichResources" || kind === "richPositionPoorResources") {
    swap = prepareSwap(world, kind);
  }
  const snapshot = world.toSnapshot();
  const organisms: Organism[] = snapshot.organisms;
  let habitatInfo: HabitatSamplingInfo | undefined;

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
      const selected = habitatCells(world, kind === "richHabitat", 24);
      organisms.forEach((o, i) => {
        const cell = selected.cells[i % selected.cells.length];
        o.position = { x: cell.x + 0.5, y: cell.y + 0.5 };
        o.home = { x: cell.x + 0.5, y: cell.y + 0.5 };
      });
      habitatInfo = selected.info;
      break;
    }
    case "poorPositionRichResources":
    case "richPositionPoorResources": {
      const selected = swap!;
      organisms.forEach((o, i) => {
        const cell = selected.position.cells[i % selected.position.cells.length];
        o.position = { x: cell.x + 0.5, y: cell.y + 0.5 };
        o.home = { x: cell.x + 0.5, y: cell.y + 0.5 };
      });
      overrideVegetation(snapshot, selected.position.cells, selected.resource.cells.map((c) => c.vegetation));
      habitatInfo = selected.info;
      break;
    }
    default:
      break;
  }

  syncRegistry(snapshot);
  const rebuilt = WorldClass.fromSnapshot(snapshot);
  assertSnapshotOptionsPreserved(snapshot, rebuilt.toSnapshot(), `setup/${kind}`);
  return { world: rebuilt, info: { kind, habitat: habitatInfo } };
}

/** Applica una condizione iniziale; restituisce solo il World (compatibilità E1.0/E1.1). */
export function applySetup(world: World, kind: SetupKind): World {
  return applySetupWithInfo(world, kind).world;
}

/**
 * Piano di cull deterministico e stratificato per specie.
 *
 * Quota TOTALE (non per specie): vengono conservati esattamente
 * `ceil(N / keepEvery)` organismi, dove `N` è la popolazione complessiva e
 * `keepEvery` è 5 per `cull80` (20 per `cull95`).
 *
 * Ripartizione per specie — metodo dei maggiori resti (largest remainder):
 *  1. quota base di ogni specie: `floor(n_species / keepEvery)`;
 *  2. i seggi ancora disponibili fino a `ceil(N / keepEvery)` sono assegnati
 *     alle specie con il resto `n_species / keepEvery` più grande, in ordine
 *     decrescente di resto e con tie-break su `speciesId` crescente;
 *  3. ogni assegnazione è limitata da `n_species` (una specie non può conservare
 *     più organismi di quelli che possiede).
 *
 * Di conseguenza NON è vero che ogni specie conserva sempre
 * `ceil(n_species / keepEvery)`: una specie può conservare meno o più di quella
 * quantità, a seconda dei resti delle altre specie. Esempio con `keepEvery = 5`
 * e due specie da 1 e 9 organismi: `ceil(10/5) = 2` sopravvissuti in totale,
 * quote base 0 e 1, un seggio residuo al resto maggiore (0.8 della specie da 9):
 * la specie da 1 conserva 0 organismi (non `ceil(1/5) = 1`) e quella da 9 ne
 * conserva 2.
 *
 * Entro ogni specie gli organismi sono ordinati per hash(tick, speciesId, id),
 * poi per id: l'ordine dell'array e l'RNG del motore non influenzano la scelta.
 * L'hash non usa alcun dato del genoma: non può favorire sistematicamente un
 * gruppo genetico. Il conteggio rimosso/conservato è esatto per costruzione e
 * verificato (nessun organismo duplicato o perso).
 */
export function planPerturbation(organisms: Organism[], kind: PerturbationKind, tick: number): PerturbationPlan {
  if (kind === "none") {
    return {
      kept: organisms.slice(),
      removed: [],
      report: {
        kind,
        tick,
        populationBefore: organisms.length,
        populationAfter: organisms.length,
        removed: 0,
        kept: organisms.length,
        expectedKept: organisms.length,
        method: "deterministic_stratified_hash",
        perSpecies: [...new Set(organisms.map((o) => o.speciesId))]
          .sort((a, b) => a - b)
          .map((speciesId) => ({
            speciesId,
            before: organisms.filter((o) => o.speciesId === speciesId).length,
            removed: 0,
            kept: organisms.filter((o) => o.speciesId === speciesId).length,
          })),
      },
    };
  }

  const keepEvery = kind === "cull80" ? 5 : 20;
  const groups = new Map<number, Organism[]>();
  for (const o of organisms) {
    const group = groups.get(o.speciesId);
    if (group) group.push(o);
    else groups.set(o.speciesId, [o]);
  }
  const speciesIds = [...groups.keys()].sort((a, b) => a - b);
  const expectedKept = Math.ceil(organisms.length / keepEvery);
  const floors = speciesIds.map((id) => Math.floor(groups.get(id)!.length / keepEvery));
  const targets = new Map<number, number>(speciesIds.map((id, i) => [id, floors[i]]));
  const remaining = Math.max(0, expectedKept - floors.reduce((a, b) => a + b, 0));
  const byRemainder = speciesIds
    .map((id, i) => ({ id, remainder: groups.get(id)!.length / keepEvery - floors[i] }))
    .sort((a, b) => b.remainder - a.remainder || a.id - b.id);
  for (let i = 0; i < remaining; i++) {
    const id = byRemainder[i % byRemainder.length].id;
    targets.set(id, Math.min(groups.get(id)!.length, targets.get(id)! + 1));
  }

  const keptIds = new Set<number>();
  const perSpecies: PerturbationSpeciesCount[] = [];
  for (const id of speciesIds) {
    const group = groups.get(id)!;
    const ranked = group
      .slice()
      .sort((a, b) => hash32(tick, id, a.id) - hash32(tick, id, b.id) || a.id - b.id);
    const keepCount = Math.max(0, Math.min(group.length, targets.get(id)!));
    for (const o of ranked.slice(0, keepCount)) keptIds.add(o.id);
    perSpecies.push({ speciesId: id, before: group.length, kept: keepCount, removed: group.length - keepCount });
  }

  // L'ordine relativo degli organismi sopravvissuti resta quello del mondo.
  const kept = organisms.filter((o) => keptIds.has(o.id));
  const removed = organisms.filter((o) => !keptIds.has(o.id));
  if (kept.length + removed.length !== organisms.length) {
    throw new Error("E1 cull: il numero di organismi rimossi e conservati non corrisponde al totale");
  }
  if (kept.length !== expectedKept) {
    throw new Error(`E1 cull: conservati ${kept.length}, attesi ${expectedKept}`);
  }
  return {
    kept,
    removed,
    report: {
      kind,
      tick,
      populationBefore: organisms.length,
      populationAfter: kept.length,
      removed: removed.length,
      kept: kept.length,
      expectedKept,
      method: "deterministic_stratified_hash",
      perSpecies,
    },
  };
}

/** Applica la perturbazione e restituisce anche il report esatto. */
export function applyPerturbationWithReport(
  world: World,
  kind: PerturbationKind,
  tick = world.tick,
): { world: World; report: PerturbationReport } {
  if (kind === "none") {
    return { world, report: planPerturbation(world.organisms, kind, tick).report };
  }
  const plan = planPerturbation(world.organisms, kind, tick);
  const snapshot = world.toSnapshot();
  snapshot.organisms = plan.kept;
  syncRegistry(snapshot);
  const rebuilt = WorldClass.fromSnapshot(snapshot);
  assertSnapshotOptionsPreserved(snapshot, rebuilt.toSnapshot(), `perturbation/${kind}`);
  if (rebuilt.organisms.length !== plan.report.kept) {
    throw new Error(`E1 cull: il mondo ricostruito ha ${rebuilt.organisms.length} organismi, attesi ${plan.report.kept}`);
  }
  return { world: rebuilt, report: plan.report };
}

/** Perturbazione esplicita, senza RNG (compatibilità con E1.0/E1.1). */
export function applyPerturbation(world: World, kind: PerturbationKind, tick = world.tick): World {
  return applyPerturbationWithReport(world, kind, tick).world;
}
