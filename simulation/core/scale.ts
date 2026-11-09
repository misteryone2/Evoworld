/**
 * v1.9.1 — Scala fisica del mondo, condivisa dalla simulazione (collisioni) e dalla grafica 3D.
 *
 * La grafica disegna una creatura di taglia `s` con una scala di `s * UNITS_PER_METER` unità del mondo 3D e un
 * pianeta di raggio WORLD_RADIUS_UNITS. Perché una collisione si veda davvero (due corpi disegnati non si
 * sovrappongono), la simulazione misura lo spazio occupato con le stesse unità: stessa scala, stesso pianeta.
 * Una sola fonte, così le due non possono scostarsi.
 */

/** Raggio del pianeta 3D, in unità del mondo 3D. */
export const WORLD_RADIUS_UNITS = 5;

/** Unità del mondo 3D per "metro": una creatura di taglia 1 ha scala 0,12 (il corpo è lungo circa 2-3 volte la scala). */
export const UNITS_PER_METER = 0.12;

/** Raggio dell'ingombro di una creatura, in multipli della sua scala (il corpo è largo 0,65-0,8 e lungo 1-1,55 mezze scale). */
export const BODY_RADIUS_PER_SCALE = 0.9;

/** Scala minima di una creatura (sotto, sparirebbe a qualunque distanza). */
export const MIN_CREATURE_SCALE = 0.05;

/** Scala di una creatura nel mondo 3D, dalla sua taglia genetica. */
export function creatureScale(size: number): number {
  return Math.max(MIN_CREATURE_SCALE, size * UNITS_PER_METER);
}

/** Raggio dell'ingombro di una creatura, in unità del mondo 3D. */
export function bodyRadiusUnits(size: number): number {
  return creatureScale(size) * BODY_RADIUS_PER_SCALE;
}

/** Massa relativa: cresce col volume (taglia al cubo). Chi è più grosso sposta chi è più piccolo. */
export function bodyMass(size: number): number {
  const s = Math.max(0.05, size);
  return s * s * s;
}

/** Lunghezza di una cella in unità del mondo 3D: lungo l'equatore (x) e lungo un meridiano (y). */
export function cellLengthsUnits(planetWidth: number, planetHeight: number): { x: number; y: number } {
  return {
    x: (2 * Math.PI * WORLD_RADIUS_UNITS) / Math.max(1, planetWidth),
    y: (Math.PI * WORLD_RADIUS_UNITS) / Math.max(1, planetHeight),
  };
}
