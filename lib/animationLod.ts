/**
 * v1.10.5 — LOD dell'animazione. Nessuna creatura diventa statica perché è lontana: cambia il dettaglio con cui si
 * anima, in modo graduale. Solo per il disegno; la geometria (parti disegnate) non cambia, quindi non c'è "popping".
 *
 *  - ALTO (vicino): tutto — andature, rimbalzo e ondeggiamento, testa, coda, comportamenti da ferma.
 *  - MEDIO: zampe e corpo poco ridotti, testa e coda a metà, comportamenti da ferma ridotti.
 *  - BASSO (lontano): posizione e rotazione continue (v1.10.1-2), zampe e rimbalzo semplificati, respiro; niente testa,
 *    coda e sguardo (a quella distanza non si vedrebbero).
 *
 * La distanza si misura in lunghezze di scala della creatura (distanza dalla camera / scala), così una creatura grossa
 * resta in dettaglio più lontano di una piccola. I tre pesi sono continui (smoothstep), sommano 1, e i fattori di
 * ciascun componente sono combinazioni lineari dei pesi: nessun salto passando da un livello all'altro.
 */

/** Fino a questa distanza (in scale) tutto è ALTO; poi sfuma verso MEDIO. */
export const LOD_HIGH_FULL = 30;
export const LOD_HIGH_NONE = 55;
/** Da qui comincia a sfumare verso BASSO; da lì in poi tutto è BASSO. */
export const LOD_LOW_START = 110;
export const LOD_LOW_FULL = 170;

export interface LodWeights {
  high: number;
  medium: number;
  low: number;
}

/** Quanto di ciascun componente della posa si applica, 0..1. */
export interface LodDetail {
  legs: number;
  body: number;
  head: number;
  tail: number;
  living: number;
  breath: number;
}

export function createLodWeights(): LodWeights {
  return { high: 1, medium: 0, low: 0 };
}

export function createLodDetail(): LodDetail {
  return { legs: 1, body: 1, head: 1, tail: 1, living: 1, breath: 1 };
}

/** Un dettaglio pieno: usato quando non c'è una camera (nessun LOD). */
export const FULL_DETAIL: Readonly<LodDetail> = Object.freeze({ legs: 1, body: 1, head: 1, tail: 1, living: 1, breath: 1 });

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = x <= edge0 ? 0 : x >= edge1 ? 1 : (x - edge0) / (edge1 - edge0);
  return t * t * (3 - 2 * t);
}

/** Pesi ALTO / MEDIO / BASSO per una distanza espressa in scale della creatura. */
export function lodWeights(distanceInScales: number, out: LodWeights): LodWeights {
  const r = Number.isFinite(distanceInScales) ? Math.max(0, distanceInScales) : LOD_LOW_FULL;
  const notHigh = smoothstep(LOD_HIGH_FULL, LOD_HIGH_NONE, r);
  const low = smoothstep(LOD_LOW_START, LOD_LOW_FULL, r);
  out.high = 1 - notHigh;
  out.low = low;
  out.medium = notHigh - low;
  return out;
}

/** Fattori di dettaglio dai pesi. Combinazioni lineari: continui. A BASSO: testa, coda e sguardo valgono esattamente 0. */
export function lodDetail(w: LodWeights, out: LodDetail): LodDetail {
  out.legs = w.high + 0.85 * w.medium + 0.6 * w.low;
  out.body = w.high + 0.7 * w.medium + 0.35 * w.low;
  out.head = w.high + 0.5 * w.medium;
  out.tail = w.high + 0.5 * w.medium;
  out.living = w.high + 0.6 * w.medium;
  out.breath = 1 - 0.35 * w.low;
  return out;
}
