/**
 * v1.9.0 — Scala del mondo 3D. Una sola fonte per i rapporti di grandezza, così
 * animali e piante restano proporzionati tra loro.
 *
 * Scelta di progetto: 1 m = 0,12 unità del mondo 3D. La scala di una creatura di taglia 1 è 1 m; il suo corpo è lungo
 * 2-3 volte tanto (circa un pony). Le piante si definiscono in metri
 * (un latifoglia ~14 m, una conifera ~20 m) e si convertono qui. La taglia del
 * genoma (0,2–3) copre così da un piccolo roditore a un grande erbivoro.
 *
 * Non dipende dalla dimensione del mondo scelta all'avvio: la dimensione della
 * cella è una scelta della simulazione e non si può rendere coerente con i metri
 * senza cambiare la simulazione. Il rapporto animale/albero, invece, sì.
 */

// v1.9.1 — la scala vive nella simulazione (simulation/core/scale.ts), così le collisioni e la grafica usano gli stessi numeri.
export { UNITS_PER_METER, MIN_CREATURE_SCALE, creatureScale } from "../simulation/core/scale";

/**
 * Raggio (unità del mondo 3D, lungo la superficie) entro cui, in terza persona,
 * si disegnano le creature. La foschia le nasconde oltre 5,2 e la curvatura del
 * pianeta (raggio 5) le nasconde a una distanza simile: oltre questo raggio non
 * si vedrebbero comunque.
 */
export const FOLLOW_CREATURE_RANGE_UNITS = 6;
