/**
 * v1.8.0 — Flora 3D. Quali piante crescono dove, e come sono fatte.
 *
 * Importante, perché è una scelta di progetto: la simulazione non ha piante
 * come individui (ogni cella ha solo `vegetation` da 0 a 1). Le piante qui
 * sono quindi una *rappresentazione* della vegetazione di ogni cella: il tipo
 * dipende dal bioma e dal clima della cella, la quantità dalla vegetazione, e
 * ogni pianta ha un piccolo "genoma visivo" (PlantGenes) ricavato in modo
 * deterministico dalla sua cella. Stessa cella, stessa pianta, a ogni
 * aggiornamento. Quando le piante avranno un genoma vero nella simulazione,
 * basterà sostituire plantGenesFor: il resto (forma, colore, posizione) già
 * legge solo PlantGenes.
 *
 * Funzioni pure, senza Three.js: si testano senza WebGL.
 */
import { applySeasonalTintRGB } from "./terrainColor";
import {
  type LocalGround,
  groundContains,
  groundElevation,
  groundRadius,
  groundTemperature,
  groundTerrain,
  groundVegetation,
  hash2,
} from "./localGround";
import { wrappedDelta } from "./creatureHeading";
import { UNITS_PER_METER } from "./worldScale";

export type PlantKind = "grass" | "bush" | "broadleaf" | "palm" | "acacia" | "conifer" | "cactus";

export const PLANT_KINDS: PlantKind[] = ["grass", "bush", "broadleaf", "palm", "acacia", "conifer", "cactus"];

/** Il "genoma visivo" di una pianta. Tutto in [0, 1] tranne dove indicato. */
export interface PlantGenes {
  /** 0..1 — quanto è alta rispetto alla media del suo tipo. */
  height: number;
  /** 0..1 — quanto è larga la chioma. */
  crown: number;
  /** -1..1 — inclinazione del fusto. */
  lean: number;
  /** -1..1 — spostamento di tonalità del fogliame. */
  hue: number;
  /** 0..1 — vigore: dipende dalla vegetazione della cella. */
  vigor: number;
}

export interface PlantPlacement {
  kind: PlantKind;
  /** Posizione in coordinate di griglia (continue). */
  gx: number;
  gy: number;
  /** Rotazione del fusto attorno alla verticale, in radianti. */
  yaw: number;
  genes: PlantGenes;
  cellX: number;
  cellY: number;
  terrain: number;
  vegetation: number;
  temperature: number;
}

/** Quante piante di ogni famiglia si possono disegnare al massimo, dato il budget totale. */
export interface FloraBudget {
  trees: number;
  bushes: number;
  grass: number;
}

export function floraBudget(total: number): FloraBudget {
  const t = Math.max(0, Math.floor(total));
  return { trees: Math.ceil(t * 0.6), bushes: Math.ceil(t * 0.15), grass: Math.ceil(t * 0.25) };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Clima di una cella, indipendente dalla stagione: 1 all'equatore, 0 ai poli,
 * abbassato dalla quota. La temperatura stagionale non va bene per scegliere
 * il tipo di pianta (un albero non diventerebbe conifera in inverno): serve
 * solo per i colori (neve, autunno).
 */
export function climateIndex(gy: number, planetHeight: number, elevation: number): number {
  const wrapped = ((gy % planetHeight) + planetHeight) % planetHeight;
  const latitude = Math.abs((2 * wrapped) / planetHeight - 1); // 0 equatore, 1 polo
  return Math.min(1, Math.max(0, 1 - latitude - Math.max(0, elevation - 0.4) * 0.5));
}

interface Candidate {
  kind: PlantKind;
  /** Numero atteso di piante di questo tipo in una cella (può superare 1, per l'erba). */
  expected: number;
}

/**
 * Cosa può crescere in una cella. `terrain` usa i codici di renderFrame.ts:
 * 0 oceano, 1 pianura, 2 deserto, 3 montagna, 4 foresta, 5 tundra, 6 savana.
 */
export function floraCandidates(terrain: number, vegetation: number, climate: number, elevation: number): Candidate[] {
  const v = Math.min(1, Math.max(0, vegetation));
  const boreal = 1 - smoothstep(0.25, 0.5, climate);
  const tropical = smoothstep(0.55, 0.8, climate);
  switch (terrain) {
    case 4: {
      const trees = 0.2 + 0.45 * v;
      return [
        { kind: "conifer", expected: trees * boreal },
        { kind: "palm", expected: trees * (1 - boreal) * 0.3 * tropical },
        { kind: "broadleaf", expected: trees * (1 - boreal) * (1 - 0.3 * tropical) },
        { kind: "bush", expected: 0.12 * v },
        { kind: "grass", expected: 0.5 * v },
      ];
    }
    case 1:
      return [
        { kind: "broadleaf", expected: 0.04 * v * (1 - boreal * 0.5) },
        { kind: "conifer", expected: 0.03 * boreal * v },
        { kind: "bush", expected: 0.1 * v },
        { kind: "grass", expected: 1.2 * v },
      ];
    case 6:
      return [
        { kind: "acacia", expected: 0.01 + 0.07 * v },
        { kind: "bush", expected: 0.08 * v },
        { kind: "grass", expected: 1.4 * v },
      ];
    case 2:
      return [
        { kind: "cactus", expected: climate > 0.35 ? 0.035 * (0.4 + v) : 0 },
        { kind: "bush", expected: 0.03 * (0.2 + v) },
        { kind: "grass", expected: 0.06 * v },
      ];
    case 5:
      return [
        { kind: "bush", expected: 0.09 * (0.3 + v) },
        { kind: "grass", expected: 0.35 * v },
        { kind: "conifer", expected: 0.012 * v },
      ];
    case 3:
      return elevation < 0.7
        ? [
            { kind: "conifer", expected: elevation < 0.65 ? 0.07 * v : 0 },
            { kind: "bush", expected: 0.02 * v },
            { kind: "grass", expected: 0.1 * v },
          ]
        : [];
    default:
      return []; // oceano
  }
}

const plantAreaCache = new Map<PlantKind, number>();

/** Area di suolo (unità² del mondo 3D) che occupa una pianta adulta media del suo tipo: il quadrato del diametro della chioma. */
export function plantAreaUnits(kind: PlantKind): number {
  let area = plantAreaCache.get(kind);
  if (area === undefined) {
    const shape = plantShape(kind, { height: 0.5, crown: 0.5, lean: 0, hue: 0, vigor: 0.8 });
    area = Math.max(1e-4, (2 * shape.crownRadius) ** 2);
    plantAreaCache.set(kind, area);
  }
  return area;
}

const KIND_SALT: Record<PlantKind, number> = { grass: 1, bush: 2, broadleaf: 3, palm: 4, acacia: 5, conifer: 6, cactus: 7 };
const MAX_SLOTS = 3;

/**
 * Il genoma visivo di una pianta, ricavato dalla sua cella. È il punto in cui,
 * in futuro, entrerà un genoma vero.
 */
export function plantGenesFor(cellX: number, cellY: number, kind: PlantKind, vegetation: number, climate: number): PlantGenes {
  const s = KIND_SALT[kind] * 101;
  const vigor = Math.min(1, Math.max(0, vegetation * 0.7 + climate * 0.3));
  return {
    height: hash2(cellX, cellY, s + 1),
    crown: hash2(cellX, cellY, s + 2),
    lean: hash2(cellX, cellY, s + 3) * 2 - 1,
    hue: hash2(cellX, cellY, s + 4) * 2 - 1,
    vigor,
  };
}

/** Le piante di una cella (di solito nessuna, a volte una o più). Deterministico. */
export function plantsInCell(ground: LocalGround, cellX: number, cellY: number): PlantPlacement[] {
  const gx = cellX + 0.5;
  const gy = cellY + 0.5;
  const { vf } = ground;
  // acqua: né laghi né fiumi consistenti
  const terrain = groundTerrain(ground, gx, gy);
  if (terrain === 0) return [];
  const nearestIndex = (() => {
    const [wx, wy] = [wrappedDelta(ground.centerX, gx, ground.planetWidth) + ground.cellsWidth / 2, wrappedDelta(ground.centerY, gy, ground.planetHeight) + ground.cellsHeight / 2];
    const tx = Math.min(vf.texWidth - 1, Math.max(0, Math.round((wx / ground.cellsWidth) * vf.texWidth - 0.5)));
    const ty = Math.min(vf.texHeight - 1, Math.max(0, Math.round((wy / ground.cellsHeight) * vf.texHeight - 0.5)));
    return ty * vf.texWidth + tx;
  })();
  if (vf.lake[nearestIndex] === 1 || vf.riverFlow[nearestIndex] > 0.25) return [];

  const vegetation = groundVegetation(ground, gx, gy);
  const elevation = groundElevation(ground, gx, gy);
  const temperature = groundTemperature(ground, gx, gy);
  const climate = climateIndex(gy, ground.planetHeight, elevation);
  const out: PlantPlacement[] = [];
  for (const candidate of floraCandidates(terrain, vegetation, climate, elevation)) {
    if (candidate.expected <= 0) continue;
    // v1.9.0 — `expected` è quanto il terreno è "pieno" (0 vuoto, 1 fitto); le piante per cella vengono
    // dall'area della cella e da quella che serve a una pianta adulta: stessa foresta con qualunque dimensione del mondo.
    const expected = (candidate.expected * ground.cellAreaUnits) / plantAreaUnits(candidate.kind);
    const slots = Math.min(MAX_SLOTS, Math.ceil(expected));
    const p = expected / slots;
    const salt = KIND_SALT[candidate.kind] * 17;
    for (let s = 0; s < slots; s++) {
      if (hash2(cellX, cellY, salt + s * 3) >= p) continue;
      out.push({
        kind: candidate.kind,
        gx: cellX + 0.1 + 0.8 * hash2(cellX, cellY, salt + s * 3 + 1),
        gy: cellY + 0.1 + 0.8 * hash2(cellX, cellY, salt + s * 3 + 2),
        yaw: hash2(cellX, cellY, salt + s * 3 + 900) * Math.PI * 2,
        genes: plantGenesFor(cellX + s * 7919, cellY, candidate.kind, vegetation, climate),
        cellX,
        cellY,
        terrain,
        vegetation,
        temperature,
      });
    }
  }
  return out;
}

const offsetOrderCache = new Map<number, Int16Array>();

/** Scostamenti (dx, dy) in un quadrato di raggio r, ordinati dal più vicino al centro. Messi in cache. */
function nearestFirstOffsets(r: number): Int16Array {
  let cached = offsetOrderCache.get(r);
  if (cached) return cached;
  const list: { dx: number; dy: number; d: number }[] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) list.push({ dx, dy, d: dx * dx + dy * dy });
  list.sort((a, b) => a.d - b.d);
  cached = new Int16Array(list.length * 2);
  list.forEach((o, i) => {
    cached![i * 2] = o.dx;
    cached![i * 2 + 1] = o.dy;
  });
  offsetOrderCache.set(r, cached);
  return cached;
}

const familyOf = (kind: PlantKind): "trees" | "bushes" | "grass" =>
  kind === "grass" ? "grass" : kind === "bush" ? "bushes" : "trees";

/**
 * Le piante da disegnare intorno a (focusX, focusY): parte dalle celle più
 * vicine e si ferma quando ogni famiglia (alberi, cespugli, erba) ha raggiunto
 * il suo tetto. Così il budget (che sul telefono è piccolo) si spende vicino a
 * chi guarda, e l'erba non toglie spazio agli alberi.
 */
export function planFlora(ground: LocalGround, focusX: number, focusY: number, budget: FloraBudget): PlantPlacement[] {
  const total = budget.trees + budget.bushes + budget.grass;
  if (total <= 0) return [];
  const radius = Math.ceil(Math.max(ground.cellsWidth, ground.cellsHeight) / 2) + 1;
  const offsets = nearestFirstOffsets(Math.min(radius, 96));
  const fx = Math.floor(focusX);
  const fy = Math.floor(focusY);
  const left: Record<"trees" | "bushes" | "grass", number> = { trees: budget.trees, bushes: budget.bushes, grass: budget.grass };
  const plan: PlantPlacement[] = [];
  for (let i = 0; i < offsets.length; i += 2) {
    const cx = fx + offsets[i];
    const cy = fy + offsets[i + 1];
    if (!groundContains(ground, cx + 0.5, cy + 0.5, 0.5)) continue;
    for (const plant of plantsInCell(ground, cx, cy)) {
      const family = familyOf(plant.kind);
      if (left[family] <= 0) continue;
      left[family]--;
      plan.push(plant);
    }
    if (left.trees <= 0 && left.bushes <= 0 && left.grass <= 0) break;
  }
  return plan;
}

/** Dimensioni di una pianta in unità del mondo 3D (una creatura di taglia 1 è alta circa 0,12 * 1,6). */
export interface PlantShape {
  /** Altezza totale. */
  height: number;
  trunkHeight: number;
  trunkRadius: number;
  /** Raggio della chioma o della sagoma. */
  crownRadius: number;
}

/**
 * v1.9.0 — altezze tipiche in metri (con i geni medi), convertite nelle unità del mondo 3D da UNITS_PER_METER:
 * una creatura di taglia 1 è circa 1 m, quindi un latifoglia (14 m) è circa 14 volte un animale medio.
 */
const BASE_HEIGHT_M: Record<PlantKind, number> = { grass: 0.55, bush: 1.4, broadleaf: 14, palm: 16, acacia: 8, conifer: 20, cactus: 4 };
const BASE_HEIGHT: Record<PlantKind, number> = Object.fromEntries(
  (Object.keys(BASE_HEIGHT_M) as PlantKind[]).map((k) => [k, BASE_HEIGHT_M[k] * UNITS_PER_METER]),
) as Record<PlantKind, number>;

export function plantShape(kind: PlantKind, genes: PlantGenes): PlantShape {
  const h = BASE_HEIGHT[kind] * (0.7 + 0.6 * genes.height) * (0.7 + 0.5 * genes.vigor);
  const w = 0.85 + 0.35 * genes.crown;
  switch (kind) {
    case "broadleaf":
      return { height: h, trunkHeight: h * 0.45, trunkRadius: h * 0.032, crownRadius: h * 0.3 * w };
    case "palm":
      return { height: h, trunkHeight: h * 0.8, trunkRadius: h * 0.016, crownRadius: h * 0.25 * w };
    case "acacia":
      return { height: h, trunkHeight: h * 0.6, trunkRadius: h * 0.03, crownRadius: h * 0.42 * w };
    case "conifer":
      return { height: h, trunkHeight: h * 0.18, trunkRadius: h * 0.022, crownRadius: h * 0.17 * w };
    case "cactus":
      return { height: h, trunkHeight: h, trunkRadius: h * 0.07 * w, crownRadius: h * 0.07 * w };
    case "bush":
      return { height: h, trunkHeight: 0, trunkRadius: 0, crownRadius: h * 0.55 * w };
    default:
      return { height: h, trunkHeight: 0, trunkRadius: 0, crownRadius: h * 0.8 * w };
  }
}

const BASE_FOLIAGE: Record<PlantKind, [number, number, number]> = {
  grass: [104, 156, 60],
  bush: [76, 114, 52],
  broadleaf: [52, 122, 52],
  palm: [60, 142, 62],
  acacia: [134, 142, 62],
  conifer: [26, 86, 56],
  cactus: [78, 134, 80],
};

/**
 * Colore del fogliame: parte dal tipo, si sposta con la tonalità e il vigore
 * del genoma, scurisce o si secca col clima, e poi riceve autunno e neve dalla
 * stessa funzione che colora il terreno (così pianta e suolo concordano).
 */
export function foliageColor(plant: PlantPlacement, seasonPhase: number): [number, number, number] {
  const base = BASE_FOLIAGE[plant.kind];
  const { hue, vigor } = plant.genes;
  const dry = plant.terrain === 6 || plant.terrain === 2 ? 0.12 : 0;
  const lush = 0.85 + 0.3 * vigor;
  const c: [number, number, number] = [
    Math.min(255, Math.max(0, (base[0] + hue * 22 + dry * 70) * lush)),
    Math.min(255, Math.max(0, (base[1] + hue * 10 - dry * 20) * lush)),
    Math.min(255, Math.max(0, (base[2] - hue * 16) * lush)),
  ];
  // conifere, cactus e palme non perdono le foglie in autunno: si passa un codice di terreno senza autunno
  const evergreen = plant.kind === "conifer" || plant.kind === "cactus" || plant.kind === "palm";
  const tintTerrain = evergreen ? 3 : plant.terrain === 4 || plant.terrain === 6 ? plant.terrain : 1;
  return applySeasonalTintRGB(c, tintTerrain, plant.vegetation, plant.temperature, seasonPhase);
}

/** Altezza del suolo sotto una pianta, per posarla. */
export function plantGroundRadius(ground: LocalGround, plant: PlantPlacement, planetRadius: number): number {
  return groundRadius(ground, plant.gx, plant.gy, planetRadius);
}
