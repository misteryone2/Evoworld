import { describe, it, expect } from "vitest";
import { nearestOrganismId, stepOrganismId, randomOrganismId } from "../lib/followTarget";
import type { RenderFrame } from "../types";

function frame(ids: number[], xs: number[], ys: number[], w = 100, h = 100): RenderFrame {
  return {
    organismsId: new Uint32Array(ids),
    organismsX: new Float32Array(xs),
    organismsY: new Float32Array(ys),
    planetWidth: w,
    planetHeight: h,
  } as unknown as RenderFrame;
}

describe("v1.7.0 — scelta dell'animale da seguire", () => {
  it("nearestOrganismId trova il più vicino escludendo se stesso", () => {
    const f = frame([1, 2, 3], [10, 12, 50], [10, 10, 50]);
    expect(nearestOrganismId(f, 10, 10, 1)).toBe(2);
    expect(nearestOrganismId(f, 10, 10, null)).toBe(1);
  });

  it("nearestOrganismId tiene conto del mondo che si richiude (bordo opposto)", () => {
    const f = frame([1, 2, 3], [1, 99, 40], [50, 50, 50]);
    // da x=1 l'animale 2 (x=99) dista 2 oltre il bordo, l'animale 3 dista 39
    expect(nearestOrganismId(f, 1, 50, 1)).toBe(2);
  });

  it("nearestOrganismId restituisce null se non c'è nessun altro animale", () => {
    expect(nearestOrganismId(frame([7], [5], [5]), 5, 5, 7)).toBeNull();
    expect(nearestOrganismId(frame([], [], []), 5, 5, null)).toBeNull();
  });

  it("stepOrganismId avanza e torna indietro ciclicamente", () => {
    const f = frame([4, 5, 6], [0, 0, 0], [0, 0, 0]);
    expect(stepOrganismId(f, 4, 1)).toBe(5);
    expect(stepOrganismId(f, 6, 1)).toBe(4);
    expect(stepOrganismId(f, 4, -1)).toBe(6);
    expect(stepOrganismId(f, 5, -1)).toBe(4);
  });

  it("stepOrganismId senza animale corrente parte dal primo (o dall'ultimo), e null se il frame è vuoto", () => {
    const f = frame([4, 5, 6], [0, 0, 0], [0, 0, 0]);
    expect(stepOrganismId(f, null, 1)).toBe(4);
    expect(stepOrganismId(f, 999, 1)).toBe(4);
    expect(stepOrganismId(f, null, -1)).toBe(6);
    expect(stepOrganismId(frame([], [], []), 1, 1)).toBeNull();
  });

  it("randomOrganismId sceglie un indice valido anche ai bordi", () => {
    const f = frame([4, 5, 6], [0, 0, 0], [0, 0, 0]);
    expect(randomOrganismId(f, 0)).toBe(4);
    expect(randomOrganismId(f, 0.5)).toBe(5);
    expect(randomOrganismId(f, 0.999999)).toBe(6);
    expect(randomOrganismId(f, 1)).toBe(6);
    expect(randomOrganismId(frame([], [], []), 0.3)).toBeNull();
  });
});
