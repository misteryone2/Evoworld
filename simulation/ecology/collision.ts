import type { Organism } from "../../types";
import { Planet } from "../planet/planet";
import { bodyMass, bodyRadiusUnits, cellLengthsUnits } from "../core/scale";

/**
 * v1.9.1 — Collisioni tra animali. Ogni creatura occupa uno spazio (un disco sulla superficie del pianeta, con la
 * stessa scala della grafica 3D, vedi core/scale.ts): due creature non possono stare una dentro l'altra. Se i dischi si
 * sovrappongono, le due si spingono via: chi è più grosso (massa = taglia al cubo) si sposta meno, chi è più piccolo di più.
 *
 * Lo spazio si misura in unità fisiche, non in celle: le celle sono più lunghe in x che in y e si stringono verso i
 * poli, e una collisione deve corrispondere a ciò che si vede.
 *
 * Una passata dopo il movimento di ogni tick. Non tocca il generatore casuale (la direzione di una sovrapposizione
 * esatta viene dagli id), quindi non cambia nient'altro della sequenza della simulazione.
 */

/** Passate di risoluzione per tick: più d'una, perché spingere una creatura può metterla contro un'altra. */
const RESOLVE_ITERATIONS = 2;

/** Sotto questo seno di latitudine le celle in x si considerano larghe come a quella latitudine (evita divisioni per ~0 ai poli). */
const MIN_LATITUDE_SINE = 0.12;

/** Due creature si "toccano" (e possono cacciare/accoppiarsi) se il margine tra i corpi è sotto questa frazione di cella. */
const TOUCH_MARGIN_CELLS = 0.5;

function wrap(value: number, max: number): number {
  const v = value % max;
  return v < 0 ? v + max : v;
}

function wrappedDelta(from: number, to: number, size: number): number {
  let d = to - from;
  if (d > size / 2) d -= size;
  else if (d < -size / 2) d += size;
  return d;
}

function latitudeSine(y: number, planetHeight: number): number {
  return Math.max(MIN_LATITUDE_SINE, Math.sin((wrap(y, planetHeight) / planetHeight) * Math.PI));
}

/** Direzione stabile (dagli id) per due creature esattamente sovrapposte, senza usare il generatore casuale. */
function fallbackDirection(idA: number, idB: number): [number, number] {
  const h = Math.imul(idA * 2654435761 + idB * 40503, 2246822519) >>> 0;
  const angle = (h / 4294967296) * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)];
}

export interface CollisionStats {
  /** Coppie in contatto prima della risoluzione (somma sulle passate). */
  contacts: number;
}

/** Il corpo più grande tra quelli vivi, per dimensionare la griglia (in unità del mondo 3D). */
function largestRadiusUnits(organisms: Organism[]): number {
  let maxSize = 0;
  for (const o of organisms) if (o.alive && o.genome.size > maxSize) maxSize = o.genome.size;
  return bodyRadiusUnits(maxSize);
}

/** Distanza di contatto più grande possibile tra due creature vive, in celle (la più lunga tra x e y). Serve a dimensionare le ricerche dei vicini. */
export function maxContactCells(organisms: Organism[], planet: Planet): number {
  const { x, y } = cellLengthsUnits(planet.width, planet.height);
  const contactUnits = 2 * largestRadiusUnits(organisms);
  return Math.ceil(contactUnits / (Math.min(x, y) * MIN_LATITUDE_SINE)) + 1;
}

/** Distanza fisica tra due creature in unità del mondo 3D (tiene conto del mondo che si richiude e dei poli). */
export function physicalDistanceUnits(a: Organism, b: Organism, planet: Planet): number {
  const cell = cellLengthsUnits(planet.width, planet.height);
  const midY = a.position.y + wrappedDelta(a.position.y, b.position.y, planet.height) / 2;
  const s = latitudeSine(midY, planet.height);
  const dx = wrappedDelta(a.position.x, b.position.x, planet.width) * cell.x * s;
  const dy = wrappedDelta(a.position.y, b.position.y, planet.height) * cell.y;
  return Math.hypot(dx, dy);
}

/**
 * Le due creature si toccano (o quasi)? Con le collisioni attive una creatura grossa non può stare più vicina di
 * "somma dei raggi", quindi caccia e accoppiamento devono funzionare anche a quella distanza: il raggio di
 * ricerca in celle, da solo, non basterebbe a corpi più larghi del raggio stesso.
 */
export function areTouching(a: Organism, b: Organism, planet: Planet): boolean {
  const cell = cellLengthsUnits(planet.width, planet.height);
  const contact = bodyRadiusUnits(a.genome.size) + bodyRadiusUnits(b.genome.size);
  return physicalDistanceUnits(a, b, planet) <= contact + TOUCH_MARGIN_CELLS * Math.min(cell.x, cell.y);
}

function isOcean(planet: Planet, x: number, y: number): boolean {
  const cx = wrap(Math.round(x), planet.width) % planet.width;
  const cy = wrap(Math.round(y), planet.height) % planet.height;
  return planet.getCell(cx, cy).terrain === "ocean";
}

/**
 * Risolve le sovrapposizioni tra tutte le creature vive. Modifica le posizioni sul posto.
 * Una spinta non porta mai una creatura in acqua: se uno dei due finirebbe in mare, è l'altro a farsi spingere di più.
 */
export function resolveCollisions(organisms: Organism[], planet: Planet): CollisionStats {
  const stats: CollisionStats = { contacts: 0 };
  const alive: Organism[] = [];
  for (const o of organisms) if (o.alive) alive.push(o);
  if (alive.length < 2) return stats;

  const W = planet.width;
  const H = planet.height;
  const cell = cellLengthsUnits(W, H);
  const maxContactUnits = 2 * largestRadiusUnits(alive);
  // Dimensione dei secchi della griglia, in celle, abbastanza grande da contenere la distanza di contatto massima.
  const bucketW = Math.max(2, Math.ceil(maxContactUnits / (cell.x * MIN_LATITUDE_SINE)));
  const bucketH = Math.max(2, Math.ceil(maxContactUnits / cell.y));
  const bucketsX = Math.max(1, Math.ceil(W / bucketW));
  const bucketsY = Math.max(1, Math.ceil(H / bucketH));

  for (let iteration = 0; iteration < RESOLVE_ITERATIONS; iteration++) {
    const grid = new Map<number, Organism[]>();
    for (const o of alive) {
      const bx = Math.floor(wrap(o.position.x, W) / bucketW) % bucketsX;
      const by = Math.floor(wrap(o.position.y, H) / bucketH) % bucketsY;
      const key = by * bucketsX + bx;
      const list = grid.get(key);
      if (list) list.push(o);
      else grid.set(key, [o]);
    }

    let moved = false;
    for (const a of alive) {
      const bx = Math.floor(wrap(a.position.x, W) / bucketW) % bucketsX;
      const by = Math.floor(wrap(a.position.y, H) / bucketH) % bucketsY;
      const seen = new Set<number>();
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const key = ((by + oy + bucketsY) % bucketsY) * bucketsX + ((bx + ox + bucketsX) % bucketsX);
          if (seen.has(key)) continue;
          seen.add(key);
          const list = grid.get(key);
          if (!list) continue;
          for (const b of list) {
            if (b.id <= a.id) continue; // ogni coppia una volta sola
            if (separate(a, b, planet, cell)) {
              stats.contacts++;
              moved = true;
            }
          }
        }
      }
    }
    if (!moved) break;
  }
  return stats;
}

/** Spinge via due creature che si sovrappongono. Restituisce true se erano in contatto. */
function separate(a: Organism, b: Organism, planet: Planet, cell: { x: number; y: number }): boolean {
  const W = planet.width;
  const H = planet.height;
  const dyCells = wrappedDelta(a.position.y, b.position.y, H);
  const midY = a.position.y + dyCells / 2;
  const s = latitudeSine(midY, H);
  const dxUnits = wrappedDelta(a.position.x, b.position.x, W) * cell.x * s;
  const dyUnits = dyCells * cell.y;
  const distance = Math.hypot(dxUnits, dyUnits);
  const contact = bodyRadiusUnits(a.genome.size) + bodyRadiusUnits(b.genome.size);
  if (distance >= contact) return false;

  let nx: number;
  let ny: number;
  if (distance < 1e-9) {
    [nx, ny] = fallbackDirection(a.id, b.id);
  } else {
    nx = dxUnits / distance;
    ny = dyUnits / distance;
  }
  const overlap = contact - distance;
  const massA = bodyMass(a.genome.size);
  const massB = bodyMass(b.genome.size);
  let shareA = massB / (massA + massB); // chi pesa meno si sposta di più
  let shareB = massA / (massA + massB);

  // a va nel verso opposto a b (−n), b nel verso di n.
  const aX = wrap(a.position.x - (nx * overlap * shareA) / (cell.x * s), W);
  const aY = wrap(a.position.y - (ny * overlap * shareA) / cell.y, H);
  const bX = wrap(b.position.x + (nx * overlap * shareB) / (cell.x * s), W);
  const bY = wrap(b.position.y + (ny * overlap * shareB) / cell.y, H);
  const aBlocked = isOcean(planet, aX, aY);
  const bBlocked = isOcean(planet, bX, bY);
  if (aBlocked && bBlocked) return true; // contatto reale, ma nessuno può spostarsi
  if (aBlocked) {
    shareA = 0;
    shareB = 1;
  } else if (bBlocked) {
    shareA = 1;
    shareB = 0;
  }
  if (shareA > 0) {
    const x = wrap(a.position.x - (nx * overlap * shareA) / (cell.x * s), W);
    const y = wrap(a.position.y - (ny * overlap * shareA) / cell.y, H);
    if (!isOcean(planet, x, y)) {
      a.position.x = x;
      a.position.y = y;
    }
  }
  if (shareB > 0) {
    const x = wrap(b.position.x + (nx * overlap * shareB) / (cell.x * s), W);
    const y = wrap(b.position.y + (ny * overlap * shareB) / cell.y, H);
    if (!isOcean(planet, x, y)) {
      b.position.x = x;
      b.position.y = y;
    }
  }
  return true;
}
