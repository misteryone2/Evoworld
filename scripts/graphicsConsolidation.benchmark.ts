import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { updateCreatureInstances, type SceneRefs } from "../components/simulation/Planet3DView";
import { descriptorFromLegacyTraits } from "../lib/anatomy";
import { QUALITY_PROFILES } from "../lib/qualityProfile";
import { buildCreatureVisualDescriptor } from "../lib/visual/creatureVisualDescriptor";
import { projectAnatomyToVisual } from "../lib/visual/anatomyVisualBridge";
import { GENERIC_RENDER_SLOTS, planFromAnatomyDescriptor, type CreatureAnatomyRenderSource, type CreatureRenderPartKey } from "../lib/visual/anatomyRenderPlan";
import { createRuntimeAnatomyRenderSource } from "../lib/visual/runtimeAnatomyRenderSource";
import { TRAIT_RANGES } from "../simulation/biology/genome";
import type { RenderFrame } from "../types";

/**
 * G3 — benchmark CPU ripetibile (Node, nessuna GPU).
 *
 * Esegui: npx vitest run --config vitest.bench.config.ts scripts/graphicsConsolidation.benchmark.ts
 *
 * Tre modalità confrontabili sulle stesse popolazioni:
 *  - `legacy`: percorso G1 senza sorgente G2 (baseline G_FINAL);
 *  - `g2-current`: piani G2 precalcolati con il mapping strict G-REV-02;
 *  - `g2-optimized`: sorgente runtime G3 con canale MOR, cache e pool dinamici.
 *
 * NON misura FPS reali, upload GPU, draw call GPU o fill-rate. `drawCalls`
 * è il conteggio delle mesh instanziate attive (proxy main-thread), `gpuBytes`
 * e `fps` sono null dove il contesto Node non può misurarli: il QA browser
 * li acquisisce da `renderer.info` tramite `window.__EVOWORLD_G3__.snapshot()`.
 */

const POPULATIONS = [100, 500, 1500, 3000, 5000, 10000];
const WARMUP = 20;
const SAMPLES = 80;
const MAX_SPIKES = 3;
const LEGS = 4;
const CAP = Math.max(...POPULATIONS);

function mesh(capacity: number, colored = false): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 4, 3), new THREE.MeshBasicMaterial(), capacity);
  if (colored) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  m.count = 0;
  return m;
}

function makeRefs(detail: 1 | 2 | 3 = 3, withGeneric = false, withCamera = false): SceneRefs {
  const refs = {
    bodyMesh: mesh(CAP),
    headMesh: mesh(CAP),
    eyeMesh: mesh(CAP * 2),
    tailMesh: mesh(CAP),
    jawMesh: mesh(CAP),
    spikeMesh: mesh(CAP * MAX_SPIKES),
    legMesh: mesh(CAP * LEGS),
    earMesh: mesh(CAP * 2),
    shadowMesh: mesh(CAP),
    creatureTrack: new Map(),
    instanceOrganismId: new Uint32Array(CAP),
    heightmap: null,
    capacity: CAP,
    maxCreatures: 100_000,
    detail,
    creatureRenderStats: { drawn: 0, mapped: 0, legacy: 0, fallback: 0, unsupported: 0, fallbackReasons: [] },
  } as unknown as SceneRefs;
  if (withGeneric) {
    refs.genericMeshes = {};
    refs.genericSlotsPerCreature = {};
    for (const key of Object.keys(GENERIC_RENDER_SLOTS) as CreatureRenderPartKey[]) {
      const slots = GENERIC_RENDER_SLOTS[key];
      refs.genericSlotsPerCreature[key] = slots;
      refs.genericMeshes[key] = mesh(CAP * slots, key !== "eye");
    }
  }
  if (withCamera) {
    refs.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    refs.camera.position.set(0, 0, 24);
    refs.camera.updateMatrixWorld(true);
  }
  return refs;
}

/** Camera che lascia tutte le creature oltre la soglia LOD: scenario severely-far. */
const FAR_CAMERA = new THREE.Vector3(1000, 0, 0);

function enableAdaptive(refs: SceneRefs, farStride: number): void {
  refs.adaptive = {
    enabled: true,
    nearDistanceScales: 30,
    farStride,
    cullBehindCamera: false,
  };
  refs.adaptiveState = null;
}

const mid = (k: keyof typeof TRAIT_RANGES) => (TRAIT_RANGES[k].min + TRAIT_RANGES[k].max) / 2;

function makeFrame(n: number, withMorphology = false): RenderFrame {
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const species = new Uint16Array(n);
  const size = new Float32Array(n);
  const speed = new Float32Array(n);
  const carnivory = new Float32Array(n);
  const vision = new Float32Array(n);
  const evasion = new Float32Array(n);
  const hunting = new Float32Array(n);
  const ids = new Uint32Array(n);
  const stature = withMorphology ? new Float32Array(n) : null;
  const fur = withMorphology ? new Float32Array(n) : null;
  const armor = withMorphology ? new Float32Array(n) : null;
  const presence = withMorphology ? new Uint8Array(n) : null;
  for (let i = 0; i < n; i++) {
    x[i] = 80 + (i % 128) * 2;
    y[i] = 80 + Math.floor(i / 128) * 2;
    species[i] = i % 17;
    size[i] = 0.8 + (i % 7) * 0.1;
    speed[i] = mid("speed");
    carnivory[i] = mid("carnivory");
    vision[i] = mid("vision");
    evasion[i] = mid("evasion");
    hunting[i] = mid("huntingSkill");
    ids[i] = i + 1;
    if (stature && fur && armor && presence) {
      stature[i] = 0.2 + (i % 7) * 0.1;
      fur[i] = 0.3 + (i % 5) * 0.1;
      armor[i] = 0.1 + (i % 9) * 0.05;
      presence[i] = 7;
    }
  }
  return {
    tick: 1,
    planetWidth: 512,
    planetHeight: 512,
    organismsX: x, organismsY: y, organismsSpecies: species, organismsSize: size,
    organismsSpeed: speed, organismsCarnivory: carnivory, organismsVision: vision,
    organismsEvasion: evasion, organismsHuntingSkill: hunting, organismsId: ids,
    ...(stature && fur && armor && presence ? {
      organismsBodyStature: stature,
      organismsFurDensity: fur,
      organismsDermalArmor: armor,
      organismsMorphologyPresence: presence,
    } : {}),
  } as unknown as RenderFrame;
}

/** Copia con nuovi array MOR: forza il percorso di rigenerazione della cache. */
function regenerateFrame(frame: RenderFrame, jitter: number): RenderFrame {
  const n = frame.organismsId.length;
  const stature = new Float32Array(n);
  for (let i = 0; i < n; i++) stature[i] = frame.organismsBodyStature![i] + jitter * 0.001;
  return {
    ...frame,
    tick: frame.tick + 1,
    organismsBodyStature: stature,
  } as RenderFrame;
}

/** Piani G2 precalcolati: il loop misurato non genera descriptor, consuma solo planFor. */
function makeG2Source(frame: RenderFrame): CreatureAnatomyRenderSource {
  const plans = new Map<number, ReturnType<typeof planFromAnatomyDescriptor>>();
  const n = frame.organismsId.length;
  for (let i = 0; i < n; i++) {
    const descriptor = descriptorFromLegacyTraits({
      speed: frame.organismsSpeed[i],
      carnivory: frame.organismsCarnivory[i],
      vision: frame.organismsVision[i],
      evasion: frame.organismsEvasion[i],
      huntingSkill: frame.organismsHuntingSkill[i],
    }, { seed: frame.organismsId[i] });
    plans.set(frame.organismsId[i], planFromAnatomyDescriptor(descriptor, frame.organismsCarnivory[i]));
  }
  return Object.freeze({ id: "bench-g2-source", planFor: (organismId: number) => plans.get(organismId) ?? null });
}

interface Sample {
  label: string;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  meanMs: number;
  heapDeltaKB: number | null;
}

interface PairedResult {
  population: number;
  baselineMedianMs: number;
  adaptiveMedianMs: number;
  deltaMs: number;
  ratio: number;
  baselineP95Ms: number;
  adaptiveP95Ms: number;
  updated: number | null;
  skipped: number | null;
  culled: number | null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function percentile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

/**
 * Confronto A/B nella STESSA istanza di processo: baseline G3 e adattivo
 * alternati a ogni iterazione, stesso frame, stessa sorgente, stessa camera.
 * Riduce la varianza di macchina presente tra esecuzioni separate.
 */
function pairedComparison(n: number, farStride: number): PairedResult {
  const baselineRefs = makeRefs(3, true, true);
  const adaptiveRefs = makeRefs(3, true, true);
  const frame = makeFrame(n, true);
  const baselineSource = createRuntimeAnatomyRenderSource(`paired-baseline-${n}`);
  baselineSource.syncFrame(frame);
  const adaptiveSource = createRuntimeAnatomyRenderSource(`paired-adaptive-${n}`);
  adaptiveSource.syncFrame(frame);
  enableAdaptive(adaptiveRefs, farStride);
  const runBaseline = () => updateCreatureInstances(baselineRefs, frame, null, null, 16, FAR_CAMERA, baselineSource);
  const runAdaptive = () => updateCreatureInstances(adaptiveRefs, frame, null, null, 16, FAR_CAMERA, adaptiveSource);
  for (let i = 0; i < WARMUP; i++) { runBaseline(); runAdaptive(); }
  const baselineTimes: number[] = [];
  const adaptiveTimes: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    if (i % 2 === 0) {
      let t = performance.now(); runBaseline(); baselineTimes.push(performance.now() - t);
      t = performance.now(); runAdaptive(); adaptiveTimes.push(performance.now() - t);
    } else {
      let t = performance.now(); runAdaptive(); adaptiveTimes.push(performance.now() - t);
      t = performance.now(); runBaseline(); baselineTimes.push(performance.now() - t);
    }
  }
  const baselineMedianMs = median(baselineTimes);
  const adaptiveMedianMs = median(adaptiveTimes);
  const stats = adaptiveRefs.creatureRenderStats;
  return {
    population: n,
    baselineMedianMs: Number(baselineMedianMs.toFixed(3)),
    adaptiveMedianMs: Number(adaptiveMedianMs.toFixed(3)),
    deltaMs: Number((baselineMedianMs - adaptiveMedianMs).toFixed(3)),
    ratio: Number((baselineMedianMs / Math.max(1e-6, adaptiveMedianMs)).toFixed(3)),
    baselineP95Ms: Number(percentile(baselineTimes, 0.95).toFixed(3)),
    adaptiveP95Ms: Number(percentile(adaptiveTimes, 0.95).toFixed(3)),
    updated: stats?.updated ?? null,
    skipped: stats?.skipped ?? null,
    culled: stats?.culled ?? null,
  };
}

const proc = (globalThis as { process?: { memoryUsage?: () => { heapUsed: number } } }).process;

function sample(label: string, fn: () => void, warmup: number, samples: number): Sample {
  for (let i = 0; i < warmup; i++) fn();
  const heapBefore = proc?.memoryUsage?.().heapUsed ?? null;
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  const heapAfter = proc?.memoryUsage?.().heapUsed ?? null;
  times.sort((a, b) => a - b);
  return {
    label,
    medianMs: times[Math.floor(times.length / 2)],
    p95Ms: times[Math.min(times.length - 1, Math.floor(times.length * 0.95))],
    p99Ms: times[Math.min(times.length - 1, Math.floor(times.length * 0.99))],
    meanMs: times.reduce((a, b) => a + b, 0) / times.length,
    // Delta heap grezzo sull'intera serie: include GC e va letto come indicatore, non come conteggio di allocazioni.
    heapDeltaKB: heapBefore !== null && heapAfter !== null ? Number(((heapAfter - heapBefore) / 1024).toFixed(1)) : null,
  };
}

/** Metriche statiche della scena dopo un aggiornamento: proxy main-thread dei costi GPU. */
function sceneMetrics(refs: SceneRefs, frame: RenderFrame): Record<string, number | string | null> {
  const meshes = [
    refs.bodyMesh, refs.headMesh, refs.eyeMesh, refs.tailMesh, refs.jawMesh,
    refs.spikeMesh, refs.legMesh, refs.earMesh, refs.shadowMesh,
    ...Object.values(refs.genericMeshes ?? {}),
  ].filter((m): m is THREE.InstancedMesh => !!m && m.count > 0);
  const geometries = new Set<string>();
  const materials = new Set<string>();
  let cpuBytes = 0;
  for (const m of meshes) {
    geometries.add(m.geometry.uuid);
    materials.add((Array.isArray(m.material) ? m.material[0] : m.material).uuid);
    cpuBytes += (m.instanceMatrix.array as Float32Array).byteLength;
    if (m.instanceColor) cpuBytes += (m.instanceColor.array as Float32Array).byteLength;
  }
  for (const key of ["organismsX", "organismsY", "organismsSpecies", "organismsSize", "organismsSpeed",
    "organismsCarnivory", "organismsVision", "organismsEvasion", "organismsHuntingSkill", "organismsId",
    "organismsBodyStature", "organismsFurDensity", "organismsDermalArmor", "organismsMorphologyPresence"] as const) {
    const array = frame[key];
    if (array) cpuBytes += (array as ArrayLike<number> & { byteLength?: number }).byteLength ?? 0;
  }
  const stats = refs.creatureRenderStats;
  return {
    drawCalls: meshes.length,
    geometries: geometries.size,
    materials: materials.size,
    instances: meshes.reduce((sum, m) => sum + m.count, 0),
    cpuKB: Number((cpuBytes / 1024).toFixed(1)),
    creaturesDrawn: stats?.drawn ?? null,
    creaturesMapped: stats?.mapped ?? null,
    creaturesLegacy: stats?.legacy ?? null,
    creaturesFallback: stats?.fallback ?? null,
    droppedParts: stats?.droppedParts ?? null,
    poolCapacity: stats?.poolCapacity ? JSON.stringify(stats.poolCapacity) : null,
    poolGrowth: stats?.poolGrowth?.length ?? 0,
    fallbackReasons: stats?.fallbackReasons?.join(";") || null,
    adaptive: stats?.adaptive ? 1 : 0,
    creaturesUpdated: stats?.updated ?? null,
    creaturesSkipped: stats?.skipped ?? null,
    creaturesCulled: stats?.culled ?? null,
    lodNear: stats?.lodNear ?? null,
    lodFar: stats?.lodFar ?? null,
    // Node non ha un WebGLRenderer: questi valori sono acquisiti nel QA browser.
    gpuBytes: null,
    fps: null,
    frameTimeMs: null,
  };
}

describe("G3 — benchmark CPU (senza GPU)", () => {
  it(
    "confronta legacy, G2 attuale e G2 ottimizzato su 100/500/1500/3000/5000/10000 organismi",
    () => {
      const rows: Sample[] = [];
      const metrics: Record<string, Record<string, number | string | null>> = {};
      for (const n of POPULATIONS) {
        // legacy — nessuna sorgente G2
        const legacyRefs = makeRefs();
        const legacyFrame = makeFrame(n);
        rows.push(sample(`updateCreatureInstances/legacy/${n}`, () => {
          updateCreatureInstances(legacyRefs, legacyFrame, null, null, 16);
        }, WARMUP, SAMPLES));
        metrics[`legacy/${n}`] = sceneMetrics(legacyRefs, legacyFrame);

        // G2 attuale — mapping strict G-REV-02, piani precalcolati
        const g2Refs = makeRefs(3, true);
        const g2Frame = makeFrame(n);
        const g2Source = makeG2Source(g2Frame);
        rows.push(sample(`updateCreatureInstances/g2-current/${n}`, () => {
          updateCreatureInstances(g2Refs, g2Frame, null, null, 16, null, g2Source);
        }, WARMUP, SAMPLES));
        metrics[`g2-current/${n}`] = sceneMetrics(g2Refs, g2Frame);

        // G2 ottimizzato — sorgente runtime G3, cache e pool dinamici
        const optRefs = makeRefs(3, true);
        const optFrame = makeFrame(n, true);
        const optSource = createRuntimeAnatomyRenderSource("bench-g3-source");
        optSource.syncFrame(optFrame);
        rows.push(sample(`updateCreatureInstances/g2-optimized/${n}`, () => {
          updateCreatureInstances(optRefs, optFrame, null, null, 16, null, optSource);
        }, WARMUP, SAMPLES));
        metrics[`g2-optimized/${n}`] = sceneMetrics(optRefs, optFrame);

        // G3.1 — percorso adattivo: stessa sorgente/frame, camera lontana, stride 4.
        const adaptiveRefs = makeRefs(3, true, true);
        const adaptiveFrame = makeFrame(n, true);
        const adaptiveSource = createRuntimeAnatomyRenderSource("bench-g3-adaptive");
        adaptiveSource.syncFrame(adaptiveFrame);
        enableAdaptive(adaptiveRefs, 4);
        rows.push(sample(`updateCreatureInstances/g3-adaptive/${n}`, () => {
          updateCreatureInstances(adaptiveRefs, adaptiveFrame, null, null, 16, FAR_CAMERA, adaptiveSource);
        }, WARMUP, SAMPLES));
        metrics[`g3-adaptive/${n}`] = sceneMetrics(adaptiveRefs, adaptiveFrame);

        // syncFrame separato: percorso caldo (stessi array) e rigenerazione (array MOR nuovi)
        rows.push(sample(`syncFrame/warm/${n}`, () => {
          optSource.syncFrame({ ...optFrame });
        }, 10, 30));
        let jitter = 0;
        rows.push(sample(`syncFrame/regenerate/${n}`, () => {
          optSource.syncFrame(regenerateFrame(optFrame, ++jitter));
        }, 2, 6));
      }

      // A/B accoppiato: la tabella precedente è sequenziale, questa è
      // interleaved nello stesso processo ed è il confronto da usare nel report.
      const paired = POPULATIONS.map((n) => pairedComparison(n, 4));
      console.table(paired.map((p) => ({
        popolazione: p.population,
        baseline_ms: p.baselineMedianMs,
        adattivo_ms: p.adaptiveMedianMs,
        delta_ms: p.deltaMs,
        ratio: p.ratio,
        baseline_p95: p.baselineP95Ms,
        adattivo_p95: p.adaptiveP95Ms,
        aggiornate: p.updated,
        saltate: p.skipped,
      })));

      const frame3000 = makeFrame(3000);
      rows.push(sample("buildCreatureVisualDescriptor/3000", () => {
        for (let i = 0; i < 3000; i++) {
          buildCreatureVisualDescriptor({ index: i, frame: frame3000, quality: QUALITY_PROFILES.alto });
        }
      }, 3, 8));

      rows.push(sample("descriptorFromLegacyTraits+project/3000", () => {
        for (let i = 0; i < 3000; i++) {
          const seed = frame3000.organismsId[i];
          projectAnatomyToVisual(descriptorFromLegacyTraits({
            speed: frame3000.organismsSpeed[i],
            carnivory: frame3000.organismsCarnivory[i],
            vision: frame3000.organismsVision[i],
            evasion: frame3000.organismsEvasion[i],
            huntingSkill: frame3000.organismsHuntingSkill[i],
          }, { seed }));
        }
      }, 1, 3));

      console.table(rows.map((r) => ({
        misura: r.label,
        mediana_ms: r.medianMs.toFixed(3),
        p95_ms: r.p95Ms.toFixed(3),
        p99_ms: r.p99Ms.toFixed(3),
        media_ms: r.meanMs.toFixed(3),
        heap_delta_kb: r.heapDeltaKB,
      })));
      console.table(Object.entries(metrics).map(([scenario, m]) => ({
        scenario, ...m,
      })));
      // Righe machine-readable per il report: console.table non sempre sopravvive ai reporter Vitest.
      console.log("G3_BENCHMARK_JSON=" + JSON.stringify({
        samples: rows.map((r) => ({
          label: r.label,
          medianMs: Number(r.medianMs.toFixed(3)),
          p95Ms: Number(r.p95Ms.toFixed(3)),
          p99Ms: Number(r.p99Ms.toFixed(3)),
          meanMs: Number(r.meanMs.toFixed(3)),
          heapDeltaKB: r.heapDeltaKB,
        })),
        metrics,
        paired,
        environment: {
          node: (proc as { version?: string } | undefined)?.version ?? null,
          platform: (proc as { platform?: string } | undefined)?.platform ?? null,
          gpu: null,
          note: "CPU main-thread Node; FPS/upload GPU non misurabili; paired e' interleaved nello stesso processo.",
        },
      }));

      for (const row of rows) {
        expect(Number.isFinite(row.medianMs)).toBe(true);
        expect(row.medianMs).toBeGreaterThan(0);
      }
    },
    600_000,
  );
});
