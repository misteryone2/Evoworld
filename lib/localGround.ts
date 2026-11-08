/**
 * v1.8.0 — Mondo 3D da vicino. Il terreno "locale": una porzione del pianeta
 * intorno all'animale seguito, alla risoluzione delle celle della simulazione
 * (un ViewportFrame richiesto su un'area piccola, vedi simulation/core/viewportFrame.ts).
 * Qui c'è solo la parte pura — campionamento dei canali, rumore deterministico,
 * altezza del suolo — così si testa senza WebGL; la geometria Three.js sta in
 * components/simulation/localScene.ts.
 *
 * Lo stesso oggetto serve a tre cose, per non farle mai divergere: disegnare
 * la mesh del terreno, appoggiarci sopra gli animali e piantarci la flora.
 */
import type { ViewportFrame } from "../types";
import { elevationDisplacement } from "./sphereProjection";
import { wrappedDelta } from "./creatureHeading";

/** La mesh locale sta un filo sopra quella globale, che da lontano è più grossolana e altrimenti la bucherebbe. */
export const LOCAL_LIFT = 0.02;
/** Ampiezza (unità del mondo 3D) delle piccole asperità del suolo, che le celle da sole non hanno. */
export const MICRO_RELIEF = 0.006;

/** Hash deterministico di una coppia di interi (più un sale) in [0, 1). Stessa cella, stessa pianta, sempre. */
export function hash2(x: number, y: number, salt = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Rumore a valori in [0, 1], continuo, deterministico. */
export function valueNoise(x: number, y: number, salt = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = hash2(x0, y0, salt);
  const b = hash2(x0 + 1, y0, salt);
  const c = hash2(x0, y0 + 1, salt);
  const d = hash2(x0 + 1, y0 + 1, salt);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

export interface LocalGround {
  vf: ViewportFrame;
  planetWidth: number;
  planetHeight: number;
  /** Centro dell'area, in coordinate di griglia. */
  centerX: number;
  centerY: number;
  cellsWidth: number;
  cellsHeight: number;
}

export function createLocalGround(vf: ViewportFrame, planetWidth: number, planetHeight: number): LocalGround {
  return {
    vf,
    planetWidth,
    planetHeight,
    centerX: vf.originX + vf.cellsWidth / 2,
    centerY: vf.originY + vf.cellsHeight / 2,
    cellsWidth: vf.cellsWidth,
    cellsHeight: vf.cellsHeight,
  };
}

/** Coordinate in celle, relative all'angolo dell'area (gestisce il mondo che si richiude su se stesso). */
function localCells(g: LocalGround, gx: number, gy: number): [number, number] {
  return [wrappedDelta(g.centerX, gx, g.planetWidth) + g.cellsWidth / 2, wrappedDelta(g.centerY, gy, g.planetHeight) + g.cellsHeight / 2];
}

/** Il punto (gx, gy) cade nell'area, con un margine (in celle) dai bordi? */
export function groundContains(g: LocalGround, gx: number, gy: number, margin = 0): boolean {
  const [lx, ly] = localCells(g, gx, gy);
  return lx >= margin && ly >= margin && lx < g.cellsWidth - margin && ly < g.cellsHeight - margin;
}

function texPos(g: LocalGround, gx: number, gy: number): [number, number] {
  const [lx, ly] = localCells(g, gx, gy);
  return [(lx / g.cellsWidth) * g.vf.texWidth - 0.5, (ly / g.cellsHeight) * g.vf.texHeight - 0.5];
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Campione bilineare di un canale numerico; fuori dall'area vale il valore del bordo. */
export function groundChannel(g: LocalGround, channel: Float32Array, gx: number, gy: number): number {
  const { texWidth: w, texHeight: h } = g.vf;
  const [fx, fy] = texPos(g, gx, gy);
  const x = clamp(fx, 0, w - 1);
  const y = clamp(fy, 0, h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = channel[y0 * w + x0] + (channel[y0 * w + x1] - channel[y0 * w + x0]) * tx;
  const b = channel[y1 * w + x0] + (channel[y1 * w + x1] - channel[y1 * w + x0]) * tx;
  return a + (b - a) * ty;
}

/** Campione del vicino più prossimo di un canale a codici (terreno, laghi). */
export function groundCode(g: LocalGround, channel: Uint8Array, gx: number, gy: number): number {
  const { texWidth: w, texHeight: h } = g.vf;
  const [fx, fy] = texPos(g, gx, gy);
  const x = clamp(Math.round(fx), 0, w - 1);
  const y = clamp(Math.round(fy), 0, h - 1);
  return channel[y * w + x];
}

export const groundElevation = (g: LocalGround, gx: number, gy: number) => groundChannel(g, g.vf.elevation, gx, gy);
export const groundVegetation = (g: LocalGround, gx: number, gy: number) => groundChannel(g, g.vf.vegetation, gx, gy);
export const groundTemperature = (g: LocalGround, gx: number, gy: number) => groundChannel(g, g.vf.temperature, gx, gy);
export const groundTerrain = (g: LocalGround, gx: number, gy: number) => groundCode(g, g.vf.terrain, gx, gy);

/**
 * Di quanto il suolo si discosta dal raggio base del pianeta: il rilievo
 * dell'elevazione (come nella mesh globale), più asperità deterministiche sulla
 * terraferma, più il piccolo sollevamento LOCAL_LIFT.
 */
export function groundDisplacement(g: LocalGround, gx: number, gy: number): number {
  const e = groundElevation(g, gx, gy);
  const ocean = groundTerrain(g, gx, gy) === 0;
  let d = elevationDisplacement(e, ocean);
  if (!ocean) {
    const n = (valueNoise(gx * 1.7, gy * 1.7, 11) - 0.5) * 2 + (valueNoise(gx * 4.1, gy * 4.1, 23) - 0.5) * 0.6;
    d += n * MICRO_RELIEF * (0.5 + e);
  }
  return d + LOCAL_LIFT;
}

/** Raggio del suolo in (gx, gy), dato il raggio base del pianeta. */
export function groundRadius(g: LocalGround, gx: number, gy: number, planetRadius: number): number {
  return planetRadius + groundDisplacement(g, gx, gy);
}

/**
 * Quanto è grande l'area da richiedere intorno all'animale, in celle di raggio:
 * abbastanza da coprire `halfUnits` unità del mondo 3D, ma tra un minimo e un
 * massimo che tengono basso il costo qualunque sia la dimensione del mondo.
 */
export function localPatchRadiusCells(planetWidth: number, planetRadius: number, halfUnits: number): number {
  const cellUnits = (2 * Math.PI * planetRadius) / Math.max(1, planetWidth);
  return Math.round(clamp(halfUnits / cellUnits, 20, 64));
}

/**
 * Un ViewportFrame è "locale" se copre solo una piccola parte del pianeta
 * (quello del pianeta intero, richiesto dalla vista dall'alto, ne copre tutta
 * la larghezza). Serve a non scambiare l'uno per l'altro: arrivano dallo
 * stesso canale.
 */
export function isLocalViewport(vf: Pick<ViewportFrame, "cellsWidth">, planetWidth: number): boolean {
  return vf.cellsWidth < planetWidth * 0.9;
}
