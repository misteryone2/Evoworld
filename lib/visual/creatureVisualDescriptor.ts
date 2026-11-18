import type { QualityProfile } from "../qualityProfile";
import type { RenderFrame } from "../../types";
import { TRAIT_RANGES } from "../../simulation/biology/genome";
import { speciesHue } from "../speciesColor";
import { normalizedSpeed } from "../bodyAnimation";
import { LOD_HIGH_FULL, LOD_HIGH_NONE, LOD_LOW_START, LOD_LOW_FULL } from "../animationLod";

/**
 * G1 — CreatureVisualDescriptor: boundary read-only tra dati di simulazione/render
 * e rappresentazione grafica. Nessuna logica biologica duplicata, nessuna mutazione.
 */

export type VisualGait = "idle" | "walk" | "trot" | "run";
export type VisualDietClass = "herbivore" | "omnivore" | "carnivore";
export type SurfaceMaterialClass = "skin" | "hide" | "fur" | "scales" | "carapace";

export interface CreatureMorphology {
  /** Scala complessiva (coerente con la scala creatura usata dal renderer). */
  scale: number;
  bodyLength: number;
  bodyHeight: number;
  bodyWidth: number;
  headScale: number;
  neckLength: number;
  limbLength: number;
  limbThickness: number;
  tailLength: number;
  tailThickness: number;
  ornamentation: number; // 0..1 (es. evasion/spine)
  bulk: number; // 0..1
}

export interface CreatureSurface {
  baseHue: number;
  /** Spostamento deterministico per individuo (gradi, ~±7) da sommare alla tinta base. */
  hueShift: number;
  baseSaturation: number;
  baseLightness: number;
  secondaryHue: number;
  secondaryLightness: number;
  pattern: "none" | "mottled" | "spots" | "stripes" | "countershade";
  materialClass: SurfaceMaterialClass;
  roughness: number;
  sheen: number;
}

export interface CreatureMotionState {
  speedNorm: number;
  turnRate: number;
  heading: number;
  gait: VisualGait;
}

export interface CreatureBehaviorCues {
  feeding: number; // 0..1, solo da segnali reali disponibili
  resting: number; // 0..1
  alert: number; // 0 finché non esiste segnale reale dedicato
  locomotion: number; // 0..1
}

export interface CreatureLodHints {
  geometryTier: 0 | 1 | 2 | 3;
  materialTier: 0 | 1 | 2;
  animationTier: 0 | 1 | 2;
  renderParts: { head: boolean; limbs: boolean; tail: boolean; eyes: boolean; ornaments: boolean; shadow: boolean };
}

export interface CreatureVisualDescriptor {
  organismId: number;
  speciesId: number;
  selected: boolean;
  gridPosition: { x: number; y: number };
  dietClass: VisualDietClass;
  morphology: CreatureMorphology;
  surface: CreatureSurface;
  motion: CreatureMotionState;
  cues: CreatureBehaviorCues;
  lod: CreatureLodHints;
  variationSeed: number;
}

type TraitKey = keyof typeof TRAIT_RANGES;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function normTrait(value: number, key: TraitKey): number {
  const r = TRAIT_RANGES[key];
  if (!r || r.max === r.min) return 0;
  return clamp01((value - r.min) / (r.max - r.min));
}

function hash01(id: number): number {
  // hash intero deterministico -> [0,1)
  let x = id | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x = x ^ (x >>> 16);
  return ((x >>> 0) % 1000003) / 1000003;
}

/**
 * Variazione stabile 0..1 per individuo (stesso id -> stesso valore, sempre).
 * Unica fonte per il "look" per-individuo: la usano sia il descriptor sia i
 * renderer, così 2D e 3D non divergono. Pura, zero allocazioni.
 */
export function stableVariation01(organismId: number): number {
  return hash01(organismId);
}

/** Converte la variazione stabile già calcolata nello spostamento di tinta (~±7°). */
export function hueShiftFromVariation(variation: number): number {
  return (variation - 0.5) * 14;
}

/** Spostamento di tinta per individuo, in gradi (~±7) intorno alla tinta di specie. */
export function organismHueShift(organismId: number): number {
  return hueShiftFromVariation(hash01(organismId));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function dietClassFromCarnivory(c: number): VisualDietClass {
  const cn = normTrait(c, "carnivory");
  if (cn < 0.2) return "herbivore";
  if (cn > 0.6) return "carnivore";
  return "omnivore";
}

export function gaitFromSpeedNorm(vn: number): VisualGait {
  if (vn < 0.03) return "idle";
  if (vn < 0.25) return "walk";
  if (vn < 0.9) return "trot";
  return "run";
}

export interface BuildVisualDescriptorInput {
  index: number;
  frame: RenderFrame;
  /** Stato visivo già calcolato dal renderer (interpolato/animato), se disponibile. */
  visual?: {
    x?: number;
    y?: number;
    visSpeed?: number; // unità mondo/s
    turnRate?: number; // rad/s
    heading?: number; // rad
    scale?: number; // scala render creatura
    energyGain?: number; // guadagno per tick (solo visuale)
    stillMs?: number; // ms ferma (render-only)
    cameraDistance?: number; // distanza camera in unità mondo
  };
  selected?: boolean;
  quality: QualityProfile;
}

/**
 * Costruisce un descriptor per l'organismo all'indice `index` del frame.
 * Funzione pura rispetto agli input forniti.
 */
export function buildCreatureVisualDescriptor(input: BuildVisualDescriptorInput): CreatureVisualDescriptor {
  const { index, frame, quality } = input;
  type VisualState = NonNullable<BuildVisualDescriptorInput["visual"]>;
  const visual: VisualState = input.visual ?? {};
  const organismId = frame.organismsId[index] ?? 0;
  const speciesId = frame.organismsSpecies[index] ?? 0;
  const size = frame.organismsSize[index] ?? 1;
  const speed = frame.organismsSpeed[index] ?? 0;
  const carnivory = frame.organismsCarnivory[index] ?? 0;
  const vision = frame.organismsVision[index] ?? 0;
  const evasion = frame.organismsEvasion[index] ?? 0;
  const hunting = frame.organismsHuntingSkill[index] ?? 0;

  const speedN = normTrait(speed, "speed");
  const carnN = normTrait(carnivory, "carnivory");
  const visionN = normTrait(vision, "vision");
  const evasionN = normTrait(evasion, "evasion");
  const huntingN = normTrait(huntingSkillSafe(hunting), "huntingSkill");
  const sizeN = normTrait(size, "size");

  const variationSeed = hash01(organismId);
  const hue = speciesHue(speciesId);
  const hueShift = organismHueShift(organismId);
  const dietClass = dietClassFromCarnivory(carnivory);

  const scale = visual.scale ?? (0.9 + sizeN * 0.6);
  const bodyLength = 1.0 + speedN * 0.55;
  const bodyWidth = 0.8 - speedN * 0.15 + sizeN * 0.12;
  const bodyHeight = 0.7 - speedN * 0.12 + sizeN * 0.1;
  const headScale = 0.42 + carnN * 0.06 + visionN * 0.04 + huntingN * 0.04;
  const limbLength = 0.55 + speedN * 0.4;
  const limbThickness = 0.13 - speedN * 0.03 + sizeN * 0.03;
  const tailLength = 0.5 + speedN * 1.1;
  const tailThickness = 0.28 + (1 - speedN) * 0.06;
  const ornamentation = evasionN;
  const bulk = clamp01(sizeN * 0.7 + (1 - speedN) * 0.3);

  const visSpeed = visual.visSpeed ?? 0;
  const speedNorm = normalizedSpeed(visSpeed, Math.max(1e-6, scale));
  const gait = gaitFromSpeedNorm(speedNorm);

  const energyGain = visual.energyGain ?? 0;
  const stillMs = visual.stillMs ?? 0;
  const feeding = visSpeed < 0.05 * Math.max(1, scale) && energyGain > 0.05 ? 1 : 0;
  const resting = feeding === 0 && speedNorm < 0.03 ? smoothstep(4000, 8000, stillMs) : 0;
  const locomotion = clamp01(speedNorm / 1.2);

  const dist = visual.cameraDistance ?? Number.POSITIVE_INFINITY;
  const distInScales = Number.isFinite(dist) ? dist / Math.max(1e-6, scale) : Number.POSITIVE_INFINITY;
  const lod = computeLodHints(distInScales, quality, dietClass, ornamentation, input.selected === true);

  // pattern/materiale: derivazione deterministica semplice (placeholder evolutivo, read-only)
  const patternRoll = variationSeed;
  const pattern: CreatureSurface["pattern"] =
    patternRoll < 0.55 ? "none" : patternRoll < 0.7 ? "mottled" : patternRoll < 0.82 ? "countershade" : patternRoll < 0.92 ? "spots" : "stripes";
  const materialClass: SurfaceMaterialClass =
    carnN > 0.65 ? "hide" : evasionN > 0.55 ? "carapace" : dietClass === "herbivore" ? "fur" : "skin";

  return {
    organismId,
    speciesId,
    selected: input.selected === true,
    gridPosition: { x: visual.x ?? frame.organismsX[index] ?? 0, y: visual.y ?? frame.organismsY[index] ?? 0 },
    dietClass,
    morphology: {
      scale,
      bodyLength,
      bodyHeight,
      bodyWidth,
      headScale,
      neckLength: 0.08 + speedN * 0.05,
      limbLength,
      limbThickness,
      tailLength,
      tailThickness,
      ornamentation,
      bulk,
    },
    surface: {
      baseHue: hue,
      hueShift,
      baseSaturation: 70 + (1 - carnN) * 15,
      baseLightness: 45 + sizeN * 10 + variationSeed * 6,
      secondaryHue: (hue + 18 + Math.floor(variationSeed * 20)) % 360,
      secondaryLightness: 30 + variationSeed * 20,
      pattern,
      materialClass,
      roughness: clamp01(0.45 + evasionN * 0.35 + (dietClass === "carnivore" ? 0.05 : 0)),
      sheen: clamp01(0.15 + (1 - evasionN) * 0.25),
    },
    motion: {
      speedNorm,
      turnRate: visual.turnRate ?? 0,
      heading: visual.heading ?? 0,
      gait,
    },
    cues: {
      feeding,
      resting,
      alert: 0,
      locomotion,
    },
    lod,
    variationSeed,
  };
}

function huntingSkillSafe(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

function computeLodHints(
  distInScales: number,
  quality: QualityProfile,
  dietClass: VisualDietClass,
  ornamentation: number,
  selected: boolean,
): CreatureLodHints {
  // Derivato dalle soglie di animazione LOD esistenti + qualità.
  const far = smoothstep(LOD_HIGH_FULL, LOD_LOW_FULL, distInScales);
  const mid = smoothstep(LOD_HIGH_NONE, LOD_LOW_START, distInScales);
  let geometryTier: 0 | 1 | 2 | 3 = far > 0.85 ? 0 : mid > 0.7 ? 1 : distInScales < LOD_HIGH_FULL ? 3 : 2;
  let animationTier: 0 | 1 | 2 = far > 0.85 ? 0 : mid > 0.5 ? 1 : 2;
  let materialTier: 0 | 1 | 2 = quality.level === "alto" ? 2 : quality.level === "medio" ? 1 : 0;
  if (quality.level === "basso" || quality.level === "2d") {
    geometryTier = Math.min(geometryTier, 1) as 0 | 1;
    animationTier = Math.min(animationTier, 1) as 0 | 1;
    materialTier = 0;
  }
  if (selected) {
    geometryTier = Math.max(geometryTier, 2) as 2 | 3;
    animationTier = Math.max(animationTier, 1) as 1 | 2;
  }

  const parts = quality.creatureParts;
  return {
    geometryTier,
    materialTier,
    animationTier,
    renderParts: {
      head: true,
      limbs: parts >= 2 && geometryTier >= 1,
      tail: parts >= 2 && geometryTier >= 1,
      eyes: parts >= 2 && geometryTier >= 1,
      ornaments: parts >= 3 && geometryTier >= 2 && (ornamentation > 0.2 || dietClass === "carnivore"),
      shadow: parts >= 2 && geometryTier >= 1,
    },
  };
}
