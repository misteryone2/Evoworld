/**
 * v1.9.1 — Le piante non sono entità della simulazione (ogni cella ha solo `vegetation`), ma nella scena 3D ogni
 * albero ha un tronco, e un animale non può attraversarlo. Questo modulo tiene i tronchi della scena locale e sposta
 * (solo nel disegno) le creature che finirebbero dentro un tronco, facendole girare intorno. La posizione nella
 * simulazione non cambia: lo scarto è al massimo il raggio di un corpo più quello di un tronco.
 */
import { bodyRadiusUnits } from "../simulation/core/scale";

export interface TrunkField {
  /** Posizione dei tronchi, in coordinate di griglia. */
  gx: Float32Array;
  gy: Float32Array;
  /** Raggio dei tronchi, in unità del mondo 3D. */
  radius: Float32Array;
  count: number;
  /** Lunghezza di una cella in unità del mondo 3D, lungo x (equatore) e lungo y (meridiano). */
  cellX: number;
  cellY: number;
  planetWidth: number;
  planetHeight: number;
}

export function createTrunkField(capacity: number): TrunkField {
  const n = Math.max(1, capacity);
  return { gx: new Float32Array(n), gy: new Float32Array(n), radius: new Float32Array(n), count: 0, cellX: 1, cellY: 1, planetWidth: 1, planetHeight: 1 };
}

function wrappedDelta(from: number, to: number, size: number): number {
  let d = to - from;
  if (d > size / 2) d -= size;
  else if (d < -size / 2) d += size;
  return d;
}

const MIN_LATITUDE_SINE = 0.12;

export interface XY {
  x: number;
  y: number;
}

/**
 * Posizione disegnata di una creatura di raggio `bodyRadius` (unità del mondo 3D) che sta in (x, y): la stessa se non
 * tocca nessun tronco, altrimenti spinta fuori dal tronco lungo la retta che li unisce. Scrive il risultato in `out`.
 */
export function pushOutOfTrunks(field: TrunkField, x: number, y: number, bodyRadius: number, out: XY): XY {
  out.x = x;
  out.y = y;
  const H = field.planetHeight;
  const W = field.planetWidth;
  // Due passate: spostarsi fuori da un tronco può mettere contro il vicino.
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    for (let k = 0; k < field.count; k++) {
      const dyCells = wrappedDelta(field.gy[k], out.y, H);
      const dyUnits = dyCells * field.cellY;
      const reach = bodyRadius + field.radius[k];
      if (dyUnits > reach || dyUnits < -reach) continue;
      const midY = field.gy[k] + dyCells / 2;
      const s = Math.max(MIN_LATITUDE_SINE, Math.sin((((midY % H) + H) % H) / H * Math.PI));
      const dxUnits = wrappedDelta(field.gx[k], out.x, W) * field.cellX * s;
      const d = Math.hypot(dxUnits, dyUnits);
      if (d >= reach) continue;
      let nx = 1;
      let ny = 0;
      if (d > 1e-9) {
        nx = dxUnits / d;
        ny = dyUnits / d;
      }
      const push = reach - d;
      out.x += (nx * push) / (field.cellX * s);
      out.y += (ny * push) / field.cellY;
      moved = true;
    }
    if (!moved) break;
  }
  return out;
}

/** Raggio dell'ingombro di una creatura di data taglia (scorciatoia per chi disegna). */
export function creatureBodyRadius(size: number): number {
  return bodyRadiusUnits(size);
}
