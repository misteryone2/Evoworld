/**
 * v1.9.0 — Scala del mondo 3D. Una sola fonte per i rapporti di grandezza, così
 * animali e piante restano proporzionati tra loro.
 *
 * Scelta di progetto: una creatura di taglia 1 è circa 1 m ed è alta/lunga 0,12
 * unità del mondo 3D, quindi 1 m = 0,12 unità. Le piante si definiscono in metri
 * (un latifoglia ~14 m, una conifera ~20 m) e si convertono qui. La taglia del
 * genoma (0,2–3) copre così da un piccolo roditore a un grande erbivoro.
 *
 * Non dipende dalla dimensione del mondo scelta all'avvio: la dimensione della
 * cella è una scelta della simulazione e non si può rendere coerente con i metri
 * senza cambiare la simulazione. Il rapporto animale/albero, invece, sì.
 */

/** Unità del mondo 3D per metro. */
export const UNITS_PER_METER = 0.12;

/** Scala minima di una creatura (sotto, sparirebbe a qualunque distanza). */
export const MIN_CREATURE_SCALE = 0.05;

/** Scala di una creatura nel mondo 3D, dalla sua taglia genetica. */
export function creatureScale(size: number): number {
  return Math.max(MIN_CREATURE_SCALE, size * UNITS_PER_METER);
}

/**
 * Raggio (unità del mondo 3D, lungo la superficie) entro cui, in terza persona,
 * si disegnano le creature. La foschia le nasconde oltre 5,2 e la curvatura del
 * pianeta (raggio 5) le nasconde a una distanza simile: oltre questo raggio non
 * si vedrebbero comunque.
 */
export const FOLLOW_CREATURE_RANGE_UNITS = 6;
