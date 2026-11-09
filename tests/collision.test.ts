import { describe, it, expect } from "vitest";
import { Planet } from "../simulation/planet/planet";
import { createOrganism } from "../simulation/biology/organism";
import { resolveCollisions, areTouching, physicalDistanceUnits, maxContactCells } from "../simulation/ecology/collision";
import { bodyMass, bodyRadiusUnits, cellLengthsUnits } from "../simulation/core/scale";
import { World } from "../simulation/core/world";
import type { Genome, Organism } from "../types";

const base: Genome = {
  size: 1,
  speed: 1,
  metabolism: 1,
  vision: 5,
  fertility: 0.5,
  lifespan: 500,
  carnivory: 0,
  preferredTemperature: 20,
  temperatureTolerance: 20,
  preferredWater: 0.4,
  waterTolerance: 0.5,
  evasion: 0.2,
  huntingSkill: 0.2,
};

const W = 256;
const planet = new Planet({ width: W, height: W, seed: 7 });

/** Un punto di terraferma con spazio intorno (nessun oceano nel quadrato 24x24 attorno). */
function findLand(): { x: number; y: number } {
  for (let y = 80; y < 180; y += 6) {
    for (let x = 20; x < 230; x += 6) {
      let ok = true;
      for (let dy = -12; dy <= 12 && ok; dy += 3) for (let dx = -12; dx <= 12; dx += 3) if (planet.getCell(x + dx, y + dy).terrain === "ocean") ok = false;
      if (ok) return { x, y };
    }
  }
  throw new Error("nessuna terraferma trovata");
}
const land = findLand();

const make = (id: number, dx: number, dy: number, size = 1): Organism => createOrganism(id, 1, land.x + dx, land.y + dy, { ...base, size });

describe("v1.9.1 — scala fisica", () => {
  it("il raggio di un corpo cresce con la taglia e la massa con il cubo", () => {
    expect(bodyRadiusUnits(2)).toBeGreaterThan(bodyRadiusUnits(1));
    expect(bodyMass(2) / bodyMass(1)).toBeCloseTo(8, 9);
  });
  it("le celle sono più lunghe in x che in y quando larghezza e altezza coincidono", () => {
    const c = cellLengthsUnits(256, 256);
    expect(c.x / c.y).toBeCloseTo(2, 9);
  });
});

describe("v1.9.1 — collisioni tra animali", () => {
  it("due creature sovrapposte vengono separate fino al contatto", () => {
    const a = make(1, 0, 0);
    const b = make(2, 0.2, 0);
    resolveCollisions([a, b], planet);
    expect(physicalDistanceUnits(a, b, planet)).toBeGreaterThanOrEqual(bodyRadiusUnits(1) * 2 - 1e-6);
  });

  it("due creature esattamente nello stesso punto si separano comunque (direzione dagli id)", () => {
    const a = make(1, 0, 0);
    const b = make(2, 0, 0);
    resolveCollisions([a, b], planet);
    expect(physicalDistanceUnits(a, b, planet)).toBeGreaterThanOrEqual(bodyRadiusUnits(1) * 2 - 1e-6);
    const again = [make(1, 0, 0), make(2, 0, 0)];
    resolveCollisions(again, planet);
    expect(again[0].position).toEqual(a.position); // stesso risultato: deterministico
  });

  it("chi è più grosso si sposta meno, chi è più piccolo di più", () => {
    const big = make(1, 0, 0, 3);
    const small = make(2, 0.3, 0, 0.5);
    const bigBefore = { ...big.position };
    const smallBefore = { ...small.position };
    resolveCollisions([big, small], planet);
    const bigMoved = Math.hypot(big.position.x - bigBefore.x, big.position.y - bigBefore.y);
    const smallMoved = Math.hypot(small.position.x - smallBefore.x, small.position.y - smallBefore.y);
    expect(smallMoved).toBeGreaterThan(bigMoved * 10);
  });

  it("chi non si tocca non viene spostato", () => {
    const a = make(1, 0, 0);
    const b = make(2, 20, 0);
    const before = [{ ...a.position }, { ...b.position }];
    const stats = resolveCollisions([a, b], planet);
    expect(stats.contacts).toBe(0);
    expect(a.position).toEqual(before[0]);
    expect(b.position).toEqual(before[1]);
  });

  it("i morti non contano", () => {
    const a = make(1, 0, 0);
    const b = make(2, 0.1, 0);
    b.alive = false;
    const before = { ...a.position };
    resolveCollisions([a, b], planet);
    expect(a.position).toEqual(before);
  });

  it("un gruppo fitto si distende: alla fine nessuna coppia si sovrappone (di molto)", () => {
    const group: Organism[] = [];
    for (let i = 0; i < 12; i++) group.push(make(i + 1, (i % 4) * 0.4, Math.floor(i / 4) * 0.4, 1));
    // più passate (come nei tick successivi)
    for (let k = 0; k < 40; k++) resolveCollisions(group, planet);
    let worst = Infinity;
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) worst = Math.min(worst, physicalDistanceUnits(group[i], group[j], planet) / (bodyRadiusUnits(1) * 2));
    expect(worst).toBeGreaterThan(0.95);
  });

  it("attraverso il bordo del mondo funziona come altrove", () => {
    const a = createOrganism(1, 1, 0.1, land.y, { ...base });
    const b = createOrganism(2, 1, W - 0.1, land.y, { ...base });
    // il bordo può essere in mare: la prova vale solo dove c'è terra; altrimenti nessuno si sposta (e non si rompe nulla)
    expect(() => resolveCollisions([a, b], planet)).not.toThrow();
    expect(a.position.x).toBeGreaterThanOrEqual(0);
    expect(a.position.x).toBeLessThan(W);
  });

  it("una spinta non porta mai una creatura in acqua", () => {
    // cerca una costa: una cella di terra con un oceano a est
    let coast: { x: number; y: number } | null = null;
    for (let y = 20; y < 236 && !coast; y++)
      for (let x = 5; x < 250; x++)
        if (planet.getCell(x, y).terrain !== "ocean" && planet.getCell(x + 1, y).terrain === "ocean" && planet.getCell(x - 1, y).terrain !== "ocean") {
          coast = { x, y };
          break;
        }
    expect(coast).not.toBeNull();
    const a = createOrganism(1, 1, coast!.x, coast!.y, { ...base });
    const b = createOrganism(2, 1, coast!.x - 0.3, coast!.y, { ...base });
    for (let k = 0; k < 10; k++) resolveCollisions([a, b], planet);
    for (const o of [a, b]) expect(planet.getCell(Math.round(o.position.x) % W, Math.round(o.position.y) % W).terrain).not.toBe("ocean");
  });

  it("areTouching: vero a contatto, falso a distanza", () => {
    const a = make(1, 0, 0);
    const near = make(2, 0.5, 0);
    const far = make(3, 30, 0);
    expect(areTouching(a, near, planet)).toBe(true);
    expect(areTouching(a, far, planet)).toBe(false);
  });

  it("maxContactCells cresce con la taglia più grossa", () => {
    const small = [make(1, 0, 0, 0.5), make(2, 5, 0, 0.5)];
    const big = [make(1, 0, 0, 3), make(2, 5, 0, 0.5)];
    expect(maxContactCells(big, planet)).toBeGreaterThan(maxContactCells(small, planet));
  });
});

describe("v1.9.1 — nel mondo", () => {
  it("con le collisioni, dopo ogni tick nessuna coppia di vivi si sovrappone di molto", () => {
    const world = new World({ width: 128, height: 128, seed: 3 }, 120);
    for (let t = 0; t < 40; t++) world.step();
    const alive = world.organisms.filter((o) => o.alive);
    const p = new Planet({ width: 128, height: 128, seed: 3 });
    let worst = Infinity;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const contact = bodyRadiusUnits(alive[i].genome.size) + bodyRadiusUnits(alive[j].genome.size);
        const d = physicalDistanceUnits(alive[i], alive[j], p);
        if (d < contact) worst = Math.min(worst, d / contact);
      }
    }
    // qualche sovrapposizione residua è possibile (nati sul genitore, spinte contro il mare), ma lieve
    if (Number.isFinite(worst)) expect(worst).toBeGreaterThan(0.3);
  });

  it("senza le collisioni (opzione) il comportamento precedente resta disponibile", () => {
    const a = new World({ width: 128, height: 128, seed: 5 }, 60, { enableCollisions: false });
    const b = new World({ width: 128, height: 128, seed: 5 }, 60, { enableCollisions: false });
    for (let t = 0; t < 20; t++) {
      a.step();
      b.step();
    }
    expect(a.organisms.map((o) => [o.position.x, o.position.y])).toEqual(b.organisms.map((o) => [o.position.x, o.position.y]));
  });

  it("deterministico anche con le collisioni: stesso seme, stesso mondo", () => {
    const a = new World({ width: 128, height: 128, seed: 9 }, 80);
    const b = new World({ width: 128, height: 128, seed: 9 }, 80);
    for (let t = 0; t < 25; t++) {
      a.step();
      b.step();
    }
    expect(a.organisms.length).toBe(b.organisms.length);
    expect(a.organisms.map((o) => [o.position.x, o.position.y])).toEqual(b.organisms.map((o) => [o.position.x, o.position.y]));
  });
});
