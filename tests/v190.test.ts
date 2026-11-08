import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { RenderFrame } from "../types";
import { updateCreatureInstances, type SceneRefs } from "../components/simulation/Planet3DView";
import { collectNearbyOrganisms } from "../lib/followCull";
import { UNITS_PER_METER, creatureScale, FOLLOW_CREATURE_RANGE_UNITS, MIN_CREATURE_SCALE } from "../lib/worldScale";
import { plantShape, plantAreaUnits, plantsInCell, PLANT_KINDS } from "../lib/flora";
import { createLocalGround } from "../lib/localGround";
import { advanceHeading, nextHeading } from "../lib/creatureHeading";
import { projectToSphere, projectToSphereInto } from "../lib/sphereProjection";
import { makeVf } from "./helpers_vf";

const W = 512;
const H = 512;
const R = 5;

describe("v1.9.0 — scala del mondo", () => {
  it("una creatura di taglia 1 vale 0,12 unità (circa 1 m) e la scala minima è rispettata", () => {
    expect(UNITS_PER_METER).toBeCloseTo(0.12, 9);
    expect(creatureScale(1)).toBeCloseTo(0.12, 9);
    expect(creatureScale(0.01)).toBe(MIN_CREATURE_SCALE);
  });

  it("gli alberi sono molto più alti di un animale medio, l'erba no", () => {
    const g = { height: 0.5, crown: 0.5, lean: 0, hue: 0, vigor: 0.8 };
    const animal = creatureScale(1);
    expect(plantShape("broadleaf", g).height / animal).toBeGreaterThan(8);
    expect(plantShape("conifer", g).height / animal).toBeGreaterThan(10);
    expect(plantShape("palm", g).height / animal).toBeGreaterThan(10);
    expect(plantShape("acacia", g).height / animal).toBeGreaterThan(5);
    expect(plantShape("grass", g).height).toBeLessThan(animal);
    expect(plantShape("bush", g).height).toBeGreaterThan(animal);
  });

  it("ogni tipo ha un'area di suolo positiva, e gli alberi ne occupano più dei cespugli e dell'erba", () => {
    for (const k of PLANT_KINDS) expect(plantAreaUnits(k)).toBeGreaterThan(0);
    expect(plantAreaUnits("broadleaf")).toBeGreaterThan(plantAreaUnits("bush"));
    expect(plantAreaUnits("bush")).toBeGreaterThan(plantAreaUnits("grass"));
  });

  it("la densità per area non dipende dalla dimensione del mondo (stessa area, stesse piante, circa)", () => {
    const count = (world: number, cells: number) => {
      const g = createLocalGround(makeVf({ terrain: 4, vegetation: 0.8, originY: world / 2, cells }), world, world);
      let n = 0;
      for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) n += plantsInCell(g, g.vf.originX + x, g.vf.originY + y).filter((p) => p.kind !== "grass" && p.kind !== "bush").length;
      return n;
    };
    // 256 celle a 512 = stessa area di 512 celle a 1024.
    const a = count(512, 256);
    const b = count(1024, 512);
    expect(a).toBeGreaterThan(20);
    expect(b / a).toBeGreaterThan(0.6);
    expect(b / a).toBeLessThan(1.6);
  });
});

describe("v1.9.0 — filtro per distanza in terza persona", () => {
  it("include chi è vicino, esclude chi è lontano, anche attraverso il bordo del mondo", () => {
    const xs = new Float32Array([256, 258, 300, 0, 511, 256]);
    const ys = new Float32Array([256, 256, 256, 256, 256, 460]);
    const out = new Int32Array(xs.length);
    const n = collectNearbyOrganisms(out, xs, ys, xs.length, 256, 256, W, H, FOLLOW_CREATURE_RANGE_UNITS, R);
    const kept = Array.from(out.slice(0, n));
    expect(kept).toContain(0);
    expect(kept).toContain(1);
    expect(kept).not.toContain(3); // all'altro lato del pianeta
    expect(kept).not.toContain(5); // 204 celle a sud, ~6,3 unità
    // attraverso il bordo: 511 è a 1 cella da 0
    const n2 = collectNearbyOrganisms(out, xs, ys, xs.length, 0, 256, W, H, FOLLOW_CREATURE_RANGE_UNITS, R);
    const kept2 = Array.from(out.slice(0, n2));
    expect(kept2).toContain(3);
    expect(kept2).toContain(4);
  });

  it("vicino ai poli le celle in x sono più strette: chi è vicino non viene escluso", () => {
    const xs = new Float32Array([100, 200]);
    const ys = new Float32Array([3, 3]);
    const out = new Int32Array(2);
    // 100 celle a latitudine ~1° valgono meno di 1 unità, anche se all'equatore ne varrebbero 12
    const n = collectNearbyOrganisms(out, xs, ys, 2, 100, 3, W, H, FOLLOW_CREATURE_RANGE_UNITS, R);
    expect(n).toBe(2);
  });

  const CAP = 3200;
  const mesh = (n: number) => new THREE.InstancedMesh(new THREE.SphereGeometry(1, 4, 3), new THREE.MeshBasicMaterial(), n);
  const refsFor = (maxCreatures = 1000) =>
    ({
      bodyMesh: mesh(CAP),
      headMesh: mesh(CAP),
      eyeMesh: mesh(CAP * 2),
      tailMesh: mesh(CAP),
      jawMesh: mesh(CAP),
      spikeMesh: mesh(CAP * 3),
      legMesh: mesh(CAP * 4),
      earMesh: mesh(CAP * 2),
      shadowMesh: mesh(CAP),
      creatureTrack: new Map(),
      instanceOrganismId: new Uint32Array(CAP),
      heightmap: null,
      capacity: CAP,
      maxCreatures,
      detail: 1,
    }) as unknown as SceneRefs;

  /** Una metà degli animali sta vicino a (100, 256), l'altra metà dall'altra parte del pianeta. */
  function splitFrame(n: number): RenderFrame {
    const f = {
      planetWidth: W,
      planetHeight: H,
      organismsX: new Float32Array(n),
      organismsY: new Float32Array(n),
      organismsSpecies: new Uint16Array(n),
      organismsSize: new Float32Array(n).fill(1),
      organismsSpeed: new Float32Array(n).fill(1),
      organismsCarnivory: new Float32Array(n),
      organismsVision: new Float32Array(n).fill(1),
      organismsEvasion: new Float32Array(n),
      organismsHuntingSkill: new Float32Array(n).fill(1),
      organismsId: new Uint32Array(n),
    };
    for (let i = 0; i < n; i++) {
      f.organismsId[i] = i + 1;
      const near = i % 2 === 0;
      f.organismsX[i] = near ? 100 + (i % 20) : 356 + (i % 20);
      f.organismsY[i] = 256 + (i % 7);
    }
    return f as unknown as RenderFrame;
  }
  const drawn = (refs: SceneRefs) => Array.from(refs.instanceOrganismId.slice(0, refs.bodyMesh.count));

  it("senza filtro si disegnano anche i lontani; col filtro solo i vicini (e l'animale seguito)", () => {
    const f = splitFrame(400);
    const all = refsFor();
    updateCreatureInstances(all, f, 1);
    expect(drawn(all)).toHaveLength(400);

    const culled = refsFor();
    updateCreatureInstances(culled, f, 1, FOLLOW_CREATURE_RANGE_UNITS);
    const ids = drawn(culled);
    expect(ids).toContain(1);
    expect(ids.length).toBeGreaterThan(150);
    expect(ids.length).toBeLessThan(250);
    for (const id of ids) expect(f.organismsX[id - 1]).toBeLessThan(200); // nessuno dell'altra metà
  });

  it("col filtro, il campionamento si fa sui vicini: più dettaglio vicino quando la popolazione è alta", () => {
    const f = splitFrame(3000);
    const plain = refsFor(429); // passo 7, dispari: i vicini (indici pari) e i lontani si alternano
    updateCreatureInstances(plain, f, 1);
    const culled = refsFor(429);
    updateCreatureInstances(culled, f, 1, FOLLOW_CREATURE_RANGE_UNITS);
    const near = (refs: SceneRefs) => drawn(refs).filter((id) => f.organismsX[id - 1] < 200).length;
    expect(near(culled)).toBeGreaterThan(near(plain));
    expect(drawn(culled).filter((id) => id === 1)).toHaveLength(1);
  });

  it("un id inesistente con il filtro non cambia nulla rispetto a senza", () => {
    const f = splitFrame(400);
    const a = refsFor();
    const b = refsFor();
    updateCreatureInstances(a, f, 999999);
    updateCreatureInstances(b, f, 999999, FOLLOW_CREATURE_RANGE_UNITS);
    expect(drawn(b)).toEqual(drawn(a));
  });

  it("la traccia si aggiorna sul posto e chi non è più disegnato esce", () => {
    const f = splitFrame(400);
    const refs = refsFor();
    updateCreatureInstances(refs, f, 1, FOLLOW_CREATURE_RANGE_UNITS);
    const entry = refs.creatureTrack.get(1);
    expect(entry).toBeDefined();
    const sizeBefore = refs.creatureTrack.size;
    expect(sizeBefore).toBeLessThan(400); // i lontani non entrano
    updateCreatureInstances(refs, f, 1, FOLLOW_CREATURE_RANGE_UNITS);
    expect(refs.creatureTrack.get(1)).toBe(entry); // stesso oggetto: nessuna allocazione per creatura
    // l'animale seguito cambia posto: chi era vicino e ora è lontano esce dalla traccia
    updateCreatureInstances(refs, f, 2, FOLLOW_CREATURE_RANGE_UNITS); // id 2 è nell'altra metà
    expect(refs.creatureTrack.has(1)).toBe(false);
  });

  it("l'anatomia in cache cambia se cambiano i geni", () => {
    const f = splitFrame(40);
    const refs = refsFor();
    updateCreatureInstances(refs, f, 1);
    const first = refs.creatureTrack.get(1)!.anatomy;
    updateCreatureInstances(refs, f, 1);
    expect(refs.creatureTrack.get(1)!.anatomy).toBe(first);
    (f.organismsSpeed as Float32Array)[0] = 1.6;
    updateCreatureInstances(refs, f, 1);
    expect(refs.creatureTrack.get(1)!.anatomy).not.toBe(first);
  });
});

describe("v1.9.0 — funzioni senza allocazioni equivalenti alle originali", () => {
  it("advanceHeading dà gli stessi risultati di nextHeading", () => {
    const moves: Array<[number, number]> = [[1, 0], [0.5, 0.5], [0, 0], [-1, 0.2], [-1, -0.2], [0.0001, 0], [0, 3]];
    let prev = null as ReturnType<typeof nextHeading>;
    const state = { hasHeading: false, hx: 0, hy: -1 };
    for (const [dx, dy] of moves) {
      prev = nextHeading(prev, dx, dy);
      advanceHeading(state, dx, dy);
      if (prev) {
        expect(state.hasHeading).toBe(true);
        expect(state.hx).toBeCloseTo(prev.hx, 12);
        expect(state.hy).toBeCloseTo(prev.hy, 12);
      } else {
        expect(state.hasHeading).toBe(false);
      }
    }
  });

  it("projectToSphereInto dà lo stesso punto di projectToSphere", () => {
    const out = { x: 0, y: 0, z: 0, normalX: 0, normalY: 0, normalZ: 0 };
    for (const [x, y] of [[0, 0], [12.5, 200], [511, 511], [-3, 700]]) {
      const a = projectToSphere(x, y, W, H, 5.2);
      const b = projectToSphereInto(out, x, y, W, H, 5.2);
      expect(b).toBe(out);
      expect(b).toEqual(a);
    }
  });
});
