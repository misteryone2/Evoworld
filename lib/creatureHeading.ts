/**
 * v1.5.0 — Creature 3D. Which way a creature faces. The simulation does not
 * store a heading; a creature simply faces the way it has been moving
 * between two rendered frames. Pure helpers so the 3D view stays thin.
 */

export interface Heading {
  /** Unit direction in grid coordinates (x grows eastward, y southward). */
  hx: number;
  hy: number;
}

/** Shortest signed distance from `from` to `to` on a wrapping axis of length `size`. */
export function wrappedDelta(from: number, to: number, size: number): number {
  let d = (to - from) % size;
  if (d > size / 2) d -= size;
  else if (d < -size / 2) d += size;
  return d;
}

/** Movement smaller than this (in cells) between frames does not change a creature's heading. */
export const HEADING_MIN_MOVEMENT = 1e-3;

/**
 * Next heading from the previous heading (or null) and the latest movement.
 * Keeps the previous heading when the creature barely moved (it pauses
 * facing where it was going); otherwise blends toward the new direction so
 * the creature turns smoothly instead of snapping. Returns null only when
 * there is neither a previous heading nor movement.
 */
export function nextHeading(prev: Heading | null, dx: number, dy: number, blend = 0.4): Heading | null {
  const len = Math.hypot(dx, dy);
  if (len < HEADING_MIN_MOVEMENT) return prev;
  const nx = dx / len;
  const ny = dy / len;
  if (!prev) return { hx: nx, hy: ny };
  const bx = prev.hx * (1 - blend) + nx * blend;
  const by = prev.hy * (1 - blend) + ny * blend;
  const bl = Math.hypot(bx, by);
  if (bl < 1e-6) return { hx: nx, hy: ny }; // exact U-turn: just take the new direction
  return { hx: bx / bl, hy: by / bl };
}

/** Stato di orientamento modificabile sul posto (v1.9.0: evita un oggetto nuovo per creatura a ogni frame). */
export interface MutableHeading {
  hasHeading: boolean;
  hx: number;
  hy: number;
}

/** Come nextHeading, ma scrive il risultato in `state` invece di restituire un oggetto nuovo. */
export function advanceHeading(state: MutableHeading, dx: number, dy: number, blend = 0.4): void {
  const len = Math.hypot(dx, dy);
  if (len < HEADING_MIN_MOVEMENT) return;
  const nx = dx / len;
  const ny = dy / len;
  if (!state.hasHeading) {
    state.hx = nx;
    state.hy = ny;
    state.hasHeading = true;
    return;
  }
  const bx = state.hx * (1 - blend) + nx * blend;
  const by = state.hy * (1 - blend) + ny * blend;
  const bl = Math.hypot(bx, by);
  if (bl < 1e-6) {
    state.hx = nx;
    state.hy = ny;
    return;
  }
  state.hx = bx / bl;
  state.hy = by / bl;
}
