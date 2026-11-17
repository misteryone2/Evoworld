/**
 * E1.3 — regressione spaziale: la cella individuata da `wrapCellCoord()` deve
 * essere esattamente quella restituita da `Planet.peekCell()` per la stessa
 * coordinata grezza. Nessuna regola del motore viene modificata: i test usano
 * solo API pubbliche di lettura/materializzazione in ambiente di test.
 */
import { describe, expect, it } from "vitest";
import { wrapCellCoord, sampleState, type E1Counters } from "../../tools/e1/metrics";
import { createWorld } from "../../tools/e1/runner";
import { buildScenarios } from "../../tools/e1/scenarios";

const zeroCounters: E1Counters = { births: 0, deaths: 0, predationKills: 0 };
const W = 16;
const H = 12;

function referenceCoord(value: number, size: number): number {
  const wrapped = Math.floor(value) % size;
  return wrapped < 0 ? wrapped + size : wrapped;
}

describe("E1.3 — coordinate spaziali coerenti con Planet.peekCell()", () => {
  it("usa la stessa convenzione Math.floor + wrap toroidale del motore", () => {
    const xs = [0, 1, 5, 15, 16, 19, -1, -0.2, -15.9, -16, -17.3, 5.2, 5.9, 15.5, 15.99, 47.7];
    const ys = [0, 3, 11, 12, 13, -1, -0.01, -11.8, 3.4, 3.999];
    for (const x of xs) expect(wrapCellCoord(x, W)).toBe(referenceCoord(x, W));
    for (const y of ys) expect(wrapCellCoord(y, H)).toBe(referenceCoord(y, H));
  });

  it("i centri di cella (x+0.5) restano nella cella, non in quella successiva", () => {
    for (let x = 0; x < W; x++) {
      expect(wrapCellCoord(x + 0.5, W)).toBe(x);
      expect(wrapCellCoord(x + 0.99, W)).toBe(x);
    }
    for (let y = 0; y < H; y++) expect(wrapCellCoord(y + 0.5, H)).toBe(y);
    // Il vecchio Math.round avrebbe restituito x+1 / y+1 per questi valori.
    expect(wrapCellCoord(5.5, W)).toBe(5);
    expect(wrapCellCoord(5.5, W)).not.toBe(Math.round(5.5) % W);
  });

  it("gestisce bordi, valori negativi e coordinate oltre il pianeta", () => {
    expect(wrapCellCoord(-0.01, W)).toBe(W - 1);
    expect(wrapCellCoord(-1, W)).toBe(W - 1);
    expect(wrapCellCoord(-W - 0.5, W)).toBe(W - 1);
    expect(wrapCellCoord(W, W)).toBe(0);
    expect(wrapCellCoord(W + 0.5, W)).toBe(0);
    expect(wrapCellCoord(W - 0.5, W)).toBe(W - 1);
    expect(wrapCellCoord(H - 0.001, H)).toBe(H - 1);
  });

  it("la cella E1 coincide con peekCell() su interi, frazionari, centri, bordi e wrap", () => {
    const world = createWorld({ id: "SPATIAL", description: "spatial regression", seed: 7, width: W, height: H, population: 8, ticks: 1, sampleEvery: 1, setup: "baseline" });
    const coords: Array<[number, number]> = [
      [0, 0], [3, 4], [W - 1, H - 1], [W, H], [W + 2.5, H + 1.5],
      [5, 6], [5.2, 6.8], [5.5, 6.5], [W - 0.5, H - 0.5],
      [-0.01, -0.01], [-1, -1], [-W - 0.5, -H - 0.5],
      [W * 3 + 2.7, H * 2 + 1.2],
    ];
    for (const [rawX, rawY] of coords) {
      // Materializza il chunk della coordinata grezza: peekCell è read-only.
      world.planet.getCell(rawX, rawY);
      const engine = world.planet.peekCell(rawX, rawY);
      const sampled = world.planet.peekCell(wrapCellCoord(rawX, W), wrapCellCoord(rawY, H));
      expect(engine).not.toBeNull();
      expect(sampled).not.toBeNull();
      expect(sampled!.vegetation).toBeCloseTo(engine!.vegetation, 12);
      expect(sampled!.terrain).toBe(engine!.terrain);
      expect(sampled!.elevation).toBeCloseTo(engine!.elevation, 12);
    }
  });

  it("S09, S10, S13, S14: sampleState legge la cella realmente occupata", () => {
    const wanted = new Set([
      "S09_poor_habitat",
      "S10_rich_habitat",
      "S13_poor_position_rich_resources",
      "S14_rich_position_poor_resources",
    ]);
    const specs = buildScenarios({ ticks: 4, sampleEvery: 1, seeds: [11], habitatControls: true })
      .filter((s) => wanted.has(s.id));
    expect(specs).toHaveLength(4);

    for (const spec of specs) {
      const world = createWorld(spec);
      for (const o of world.organisms) world.planet.getCell(o.position.x, o.position.y);

      // Ogni organismo è posizionato al centro della cella scelta: la cella
      // restituita da peekCell(raw) deve essere quella della griglia, non la
      // successiva (che il vecchio Math.round avrebbe letto).
      const distinct = new Map<string, { vegetation: number; land: boolean }>();
      for (const o of world.organisms) {
        const raw = o.position;
        const cx = wrapCellCoord(raw.x, world.planet.width);
        const cy = wrapCellCoord(raw.y, world.planet.height);
        const expected = world.planet.peekCell(raw.x, raw.y)!;
        const actual = world.planet.peekCell(cx, cy)!;
        expect(actual).toBe(expected);
        expect(cx).toBe(Math.floor(raw.x));
        expect(cy).toBe(Math.floor(raw.y));
        const key = `${cx},${cy}`;
        if (!distinct.has(key)) distinct.set(key, { vegetation: expected.vegetation, land: expected.terrain !== "ocean" });
      }

      const s = sampleState(world, { ...zeroCounters });
      const cells = [...distinct.values()];
      const expectedVeg = cells.length ? cells.reduce((sum, c) => sum + c.vegetation, 0) / cells.length : 0;
      const expectedLand = cells.length ? cells.filter((c) => c.land).length / cells.length : 0;
      expect(s.organismsSampled).toBe(world.organisms.length);
      expect(s.occupiedCellsSampled).toBe(distinct.size);
      expect(s.occupiedVegetation).toBeCloseTo(expectedVeg, 4);
      expect(s.occupiedLandFraction).toBeCloseTo(expectedLand, 4);
    }
  });
});
