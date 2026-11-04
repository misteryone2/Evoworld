/**
 * v1.7.0 — Terza persona. Quale animale seguire: l'animale più vicino a un
 * punto e il passaggio all'animale successivo o precedente. Funzioni pure sui
 * dati del RenderFrame, senza React né Three.js.
 */
import type { RenderFrame } from "../types";
import { wrappedDelta } from "./creatureHeading";

export type FollowFrame = Pick<RenderFrame, "organismsId" | "organismsX" | "organismsY" | "planetWidth" | "planetHeight">;

/** L'animale più vicino a (x, y) sul mondo che si richiude su se stesso, escluso `excludeId`. Null se non ce ne sono altri. */
export function nearestOrganismId(frame: FollowFrame, x: number, y: number, excludeId: number | null = null): number | null {
  const { organismsId, organismsX, organismsY, planetWidth, planetHeight } = frame;
  let best: number | null = null;
  let bestDistSq = Infinity;
  for (let i = 0; i < organismsId.length; i++) {
    const id = organismsId[i];
    if (id === excludeId) continue;
    const dx = wrappedDelta(x, organismsX[i], planetWidth);
    const dy = wrappedDelta(y, organismsY[i], planetHeight);
    const d = dx * dx + dy * dy;
    if (d < bestDistSq) {
      bestDistSq = d;
      best = id;
    }
  }
  return best;
}

/**
 * L'animale dopo (`step` = 1) o prima (`step` = -1) di quello indicato, nell'ordine del frame, ricominciando
 * da capo ai bordi. Se `currentId` non c'è (più) nel frame, parte dal primo (o dall'ultimo). Null se il frame è vuoto.
 */
export function stepOrganismId(frame: Pick<RenderFrame, "organismsId">, currentId: number | null, step: 1 | -1): number | null {
  const ids = frame.organismsId;
  const n = ids.length;
  if (n === 0) return null;
  let index = -1;
  if (currentId !== null) {
    for (let i = 0; i < n; i++) {
      if (ids[i] === currentId) {
        index = i;
        break;
      }
    }
  }
  if (index === -1) return step === 1 ? ids[0] : ids[n - 1];
  return ids[(index + step + n) % n];
}

/** Un animale scelto a caso (`random` in [0, 1), iniettabile per i test). Null se il frame è vuoto. */
export function randomOrganismId(frame: Pick<RenderFrame, "organismsId">, random: number = Math.random()): number | null {
  const n = frame.organismsId.length;
  if (n === 0) return null;
  const index = Math.min(n - 1, Math.max(0, Math.floor(random * n)));
  return frame.organismsId[index];
}
