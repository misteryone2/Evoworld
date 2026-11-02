/**
 * v1.6.0 — Modalità leggera. Pure description of how much work the app asks
 * of a device: what the 3D view draws, how often the simulation reports back
 * to the screen, how big a new world is by default. No React, no DOM: the
 * browser-facing part (device probing, stored choice) lives in useQuality.ts.
 */

/** "2d" = flat map on a plain canvas (no WebGL at all); the rest are 3D at increasing detail. */
export type QualityLevel = "2d" | "basso" | "medio" | "alto";
export type QualityPreference = "auto" | QualityLevel;

export const QUALITY_LEVELS: QualityLevel[] = ["2d", "basso", "medio", "alto"];

export interface QualityProfile {
  level: QualityLevel;
  /** Short Italian name shown in the selector. */
  label: string;
  /** One line explaining what this level trades away. */
  description: string;
  renderer: "webgl" | "canvas2d";
  antialias: boolean;
  /** Upper bound on devicePixelRatio the canvas renders at (lower = far fewer pixels on dense screens). */
  pixelRatioCap: number;
  /** Most creatures drawn at once; above it a uniform sample is drawn (the simulation itself is never capped). */
  maxCreatures: number;
  /** 1 = torso + head, 2 = + eyes, tail and jaw, 3 = everything (adds the dorsal spikes). */
  creatureParts: 1 | 2 | 3;
  /** Segments (around, along) of the creature spheres; fewer = lighter geometry. */
  creatureSegments: [number, number];
  /** Widest terrain texture ever requested (the 3D view's LOD tiers above this are skipped). */
  terrainMaxWidth: number;
  /** How often (ms) the terrain texture is refreshed even if the camera did not move. */
  terrainRefreshMs: number;
  /** Minimum ms between two frames the simulation worker sends to the screen. */
  workerFrameIntervalMs: number;
  /** How often (ms) the per-species analysis (genetics, habitat, tree) is recomputed; in between the last one is reused. */
  speciesStatsIntervalMs: number;
  /** Whether the species panel may open a second WebGL view (the rotating 3D portrait). */
  portrait3D: boolean;
  /** Side (in cells) of the world created by "Genera pianeta casuale". */
  defaultWorldSize: number;
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  "2d": {
    level: "2d",
    label: "Mappa 2D",
    description: "Mappa piatta senza 3D: la più leggera, funziona anche senza WebGL.",
    renderer: "canvas2d",
    antialias: false,
    pixelRatioCap: 1,
    maxCreatures: 600,
    creatureParts: 1,
    creatureSegments: [6, 4],
    terrainMaxWidth: 320,
    terrainRefreshMs: 8000,
    workerFrameIntervalMs: 200,
    speciesStatsIntervalMs: 2000,
    portrait3D: false,
    defaultWorldSize: 256,
  },
  basso: {
    level: "basso",
    label: "Leggera",
    description: "3D essenziale: creature semplici, pianeta a bassa risoluzione.",
    renderer: "webgl",
    antialias: false,
    pixelRatioCap: 1,
    maxCreatures: 600,
    creatureParts: 1,
    creatureSegments: [6, 4],
    terrainMaxWidth: 320,
    terrainRefreshMs: 8000,
    workerFrameIntervalMs: 100,
    speciesStatsIntervalMs: 1500,
    portrait3D: false,
    defaultWorldSize: 256,
  },
  medio: {
    level: "medio",
    label: "Bilanciata",
    description: "Creature con occhi e coda, terreno a media risoluzione.",
    renderer: "webgl",
    antialias: false,
    pixelRatioCap: 1.5,
    maxCreatures: 1500,
    creatureParts: 2,
    creatureSegments: [8, 6],
    terrainMaxWidth: 640,
    terrainRefreshMs: 5000,
    workerFrameIntervalMs: 50,
    speciesStatsIntervalMs: 800,
    portrait3D: true,
    defaultWorldSize: 512,
  },
  alto: {
    level: "alto",
    label: "Completa",
    description: "Tutti i dettagli: creature complete, bordi lisci, terreno ad alta risoluzione.",
    renderer: "webgl",
    antialias: true,
    pixelRatioCap: 2,
    maxCreatures: 2500,
    creatureParts: 3,
    creatureSegments: [10, 8],
    terrainMaxWidth: 1024,
    terrainRefreshMs: 4000,
    workerFrameIntervalMs: 33,
    speciesStatsIntervalMs: 400,
    portrait3D: true,
    defaultWorldSize: 1024,
  },
};

/** What the browser tells us about the device. Every field except the first three can be unknown. */
export interface DeviceInfo {
  hasWebGL2: boolean;
  isTouch: boolean;
  screenWidth: number;
  /** navigator.deviceMemory (GB, capped at 8 by browsers); undefined where the API does not exist (Safari, Firefox). */
  deviceMemoryGB?: number;
  /** navigator.hardwareConcurrency */
  cores?: number;
  /** Unmasked GPU renderer string, when the browser exposes it. */
  gpuRenderer?: string;
}

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;

/**
 * Picks the starting level for a device. Deliberately conservative: when a
 * number is unknown (several browsers hide memory), assume less, not more —
 * the person can always raise it by hand, but a device that stutters from
 * the first second leaves a worse impression than a plainer picture.
 */
export function classifyDevice(info: DeviceInfo): QualityLevel {
  if (!info.hasWebGL2) return "2d";
  if (info.gpuRenderer && SOFTWARE_RENDERER.test(info.gpuRenderer)) return "2d";

  const { deviceMemoryGB: mem, cores } = info;
  if ((mem !== undefined && mem <= 2) || (cores !== undefined && cores <= 2)) return "basso";

  const phoneOrSmallTablet = info.isTouch && info.screenWidth <= 900;
  if (phoneOrSmallTablet) {
    return mem !== undefined && mem >= 6 && cores !== undefined && cores >= 6 ? "medio" : "basso";
  }

  if (mem !== undefined && mem >= 8 && cores !== undefined && cores >= 8) return "alto";
  return "medio";
}

/** The level actually used: the person's explicit choice, or the detected one; never 3D without WebGL2. */
export function resolveLevel(preference: QualityPreference, detected: QualityLevel, hasWebGL2: boolean): QualityLevel {
  const wanted = preference === "auto" ? detected : preference;
  if (!hasWebGL2) return "2d";
  return wanted;
}

/** One step lighter. "basso" and "2d" are the floor for automatic downgrades (leaving 3D is the person's call). */
export function stepDown(level: QualityLevel): QualityLevel {
  if (level === "alto") return "medio";
  if (level === "medio") return "basso";
  return level;
}

export interface SlowCheckOptions {
  /** Frames needed before judging. */
  minSamples?: number;
  /** Median frame time (ms) above which the device is considered too slow. */
  thresholdMs?: number;
}

/**
 * True when the typical (median) frame took longer than the threshold — the
 * median, so a single hitch (tab switch, garbage collection) cannot trigger
 * a downgrade, while a device that genuinely cannot keep up does.
 */
export function shouldDowngrade(frameTimesMs: number[], options: SlowCheckOptions = {}): boolean {
  const { minSamples = 60, thresholdMs = 40 } = options;
  if (frameTimesMs.length < minSamples) return false;
  const sorted = [...frameTimesMs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return median > thresholdMs;
}

export const QUALITY_STORAGE_KEY = "evoworld.quality";

/** Reads a stored preference, tolerating a missing, corrupt or outdated value. */
export function parsePreference(raw: string | null | undefined): QualityPreference {
  if (raw === "auto" || raw === "2d" || raw === "basso" || raw === "medio" || raw === "alto") return raw;
  return "auto";
}
