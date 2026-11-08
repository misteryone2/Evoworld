/**
 * v1.9.0 — Filtro per distanza in terza persona. Elenca le creature entro un
 * raggio (unità del mondo 3D, lungo la superficie) da un punto, tenendo conto
 * che le celle sono più lunghe in x che in y e che si stringono verso i poli.
 *
 * È conservativo: nel dubbio include. Cambia solo cosa si disegna, mai cosa si simula.
 */
import { wrappedDelta } from "./creatureHeading";

let scratch = new Int32Array(1024);

/** Un buffer di indici abbastanza grande, riusato tra un frame e l'altro (nessuna allocazione a regime). */
export function ensureCandidateBuffer(capacity: number): Int32Array {
  if (scratch.length < capacity) scratch = new Int32Array(Math.max(capacity, scratch.length * 2));
  return scratch;
}

/**
 * Scrive in `out` gli indici delle creature vicine (in ordine crescente) e ne
 * restituisce il numero. `out` deve avere almeno `count` posti.
 */
export function collectNearbyOrganisms(
  out: Int32Array,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  count: number,
  centerX: number,
  centerY: number,
  planetWidth: number,
  planetHeight: number,
  rangeUnits: number,
  planetRadius: number,
): number {
  const cellX = (2 * Math.PI * planetRadius) / Math.max(1, planetWidth);
  const cellY = (Math.PI * planetRadius) / Math.max(1, planetHeight);
  const centerSin = Math.max(0.05, Math.sin((centerY / planetHeight) * Math.PI));
  const r2 = rangeUnits * rangeUnits;
  let n = 0;
  for (let k = 0; k < count; k++) {
    const dyUnits = wrappedDelta(centerY, ys[k], planetHeight) * cellY;
    if (dyUnits > rangeUnits || dyUnits < -rangeUnits) continue;
    // Scala di longitudine più piccola tra il centro e la creatura: così non si esclude mai chi è vicino.
    const s = Math.min(centerSin, Math.max(0.05, Math.sin((ys[k] / planetHeight) * Math.PI)));
    const dxUnits = wrappedDelta(centerX, xs[k], planetWidth) * cellX * s;
    if (dxUnits * dxUnits + dyUnits * dyUnits <= r2) out[n++] = k;
  }
  return n;
}
