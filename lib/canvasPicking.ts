import { wrappedDelta } from "./creatureHeading";

/**
 * v1.6.0 — Modalità leggera. Which creature is under a tap on the flat 2D
 * map: the nearest one within `maxDistance` cells of the tapped grid point
 * (distances wrap around the planet's edges), or null if none is close
 * enough. A plain scan: it runs once per tap, not per frame.
 */
export function pickNearestOrganism(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  ids: ArrayLike<number>,
  gridX: number,
  gridY: number,
  planetWidth: number,
  planetHeight: number,
  maxDistance: number,
): number | null {
  let bestId: number | null = null;
  let bestSq = maxDistance * maxDistance;
  for (let i = 0; i < xs.length; i++) {
    const dx = wrappedDelta(gridX, xs[i], planetWidth);
    const dy = wrappedDelta(gridY, ys[i], planetHeight);
    const sq = dx * dx + dy * dy;
    if (sq <= bestSq) {
      bestSq = sq;
      bestId = ids[i];
    }
  }
  return bestId;
}
