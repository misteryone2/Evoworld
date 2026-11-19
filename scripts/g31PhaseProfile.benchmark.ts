import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { updateCreatureInstances, type SceneRefs } from "../components/simulation/Planet3DView";
import { computeCreatureAnatomy } from "../lib/creatureAnatomy";
import { createVisualMotion, stepVisualMotion } from "../lib/naturalMotion";
import { advancePhase, computeBodyPose, createBodyPose, normalizedSpeed } from "../lib/bodyAnimation";
import { applyLivingPose, createLivingState, stepLiving } from "../lib/livingBehavior";
import { createLodDetail, createLodWeights, lodDetail, lodWeights } from "../lib/animationLod";
import { collectNearbyOrganisms, ensureCandidateBuffer } from "../lib/followCull";
import { isUsableAnatomyRenderPlanCached, GENERIC_RENDER_SLOTS, type CreatureRenderPartKey } from "../lib/visual/anatomyRenderPlan";
import { createRuntimeAnatomyRenderSource } from "../lib/visual/runtimeAnatomyRenderSource";
import { creatureScale } from "../lib/worldScale";
import { createRenderFrame } from "./g31Fixtures";

/**
 * G3.1 — P0: profilazione per fase, senza ottimizzazioni.
 *
 * Esegui: npx vitest run --config vitest.bench.config.ts scripts/g31PhaseProfile.benchmark.ts
 *
 * Le misure sono CPU main-thread Node: NON sono FPS, NON sono upload GPU.
 * Ogni fase e' un microbenchmark sulle stesse popolazioni/frame del benchmark
 * principale; la riga `updateCreatureInstances/total` e' il loop integrato.
 * `heapDeltaKB` e' un indicatore grezzo (GC puo' avvenire durante la serie).
 */

const POPULATIONS = [100, 500, 1500, 3000, 5000, 10000] as const;
const WARMUP = 8;
const SAMPLES = 40;
const CAP = Math.max(...POPULATIONS);
const KEYS = Object.keys(GENERIC_RENDER_SLOTS) as CreatureRenderPartKey[];

function mesh(capacity: number, colored = false): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 4, 3), new THREE.MeshBasicMaterial(), capacity);
  if (colored) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  m.count = 0;
  return m;
}

function makeRefs(): SceneRefs {
  return {
    bodyMesh: mesh(CAP), headMesh: mesh(CAP), eyeMesh: mesh(CAP * 2), tailMesh: mesh(CAP),
    jawMesh: mesh(CAP), spikeMesh: mesh(CAP * 3), legMesh: mesh(CAP * 4), earMesh: mesh(CAP * 2),
    shadowMesh: mesh(CAP), creatureTrack: new Map(), instanceOrganismId: new Uint32Array(CAP),
    heightmap: null, capacity: CAP, maxCreatures: CAP, detail: 3,
    creatureRenderStats: { drawn: 0, mapped: 0, legacy: 0, fallback: 0, unsupported: 0, fallbackReasons: [] },
  } as unknown as SceneRefs;
}

interface Sample {
  label: string;
  medianMs: number;
  p95Ms: number;
  heapDeltaKB: number | null;
}

const proc = (globalThis as { process?: { memoryUsage?: () => { heapUsed: number } } }).process;

function sample(label: string, fn: () => void, warmup: number, samples: number): Sample {
  for (let i = 0; i < warmup; i++) fn();
  const before = proc?.memoryUsage?.().heapUsed ?? null;
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  const after = proc?.memoryUsage?.().heapUsed ?? null;
  times.sort((a, b) => a - b);
  return {
    label,
    medianMs: times[Math.floor(times.length / 2)],
    p95Ms: times[Math.min(times.length - 1, Math.floor(times.length * 0.95))],
    heapDeltaKB: before !== null && after !== null ? Number(((after - before) / 1024).toFixed(1)) : null,
  };
}

// Scratch condiviso: le fasi non devono allocare oggetti per creatura.
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const scl = new THREE.Vector3();
const mat = new THREE.Matrix4();
const col = new THREE.Color();
const pose = createBodyPose();
const weights = createLodWeights();
const detail = createLodDetail();
const motion = createVisualMotion();
const living = createLivingState(1);

describe("G3.1 — profilazione CPU per fase", () => {
  it(
    "misura le fasi del rendering sulle stesse popolazioni del benchmark principale",
    () => {
      const rows: Sample[] = [];
      for (const n of POPULATIONS) {
        const frame = createRenderFrame(n, true);
        const refs = makeRefs();
        const source = createRuntimeAnatomyRenderSource("g31-profile");
        source.syncFrame(frame);
        const ids = frame.organismsId;
        const plans = Array.from({ length: n }, (_, i) => source.planFor(ids[i], frame.tick));
        const usable = plans.map((p) => isUsableAnatomyRenderPlanCached(p));

        rows.push(sample(`syncFrame/warm/${n}`, () => { source.syncFrame({ ...frame }); }, 3, 12));
        rows.push(sample(`syncFrame/regenerate/${n}`, () => {
          const stature = new Float32Array(n);
          for (let i = 0; i < n; i++) stature[i] = frame.organismsBodyStature![i] + Math.random() * 0.001;
          source.syncFrame({ ...frame, tick: frame.tick + 1, organismsBodyStature: stature });
        }, 1, 4));

        // Lettura dati + scala (senza scrittura).
        rows.push(sample(`dataRead/${n}`, () => {
          let acc = 0;
          for (let i = 0; i < n; i++) {
            acc += frame.organismsX[i] + frame.organismsY[i] + frame.organismsSpecies[i]
              + creatureScale(frame.organismsSize[i]) + frame.organismsSpeed[i]
              + frame.organismsCarnivory[i] + frame.organismsVision[i]
              + frame.organismsEvasion[i] + frame.organismsHuntingSkill[i];
          }
          expect(Number.isFinite(acc)).toBe(true);
        }, WARMUP, SAMPLES));

        // Ricerca e validazione dei render plan.
        rows.push(sample(`planFor/${n}`, () => {
          let count = 0;
          for (let i = 0; i < n; i++) if (source.planFor(ids[i], frame.tick)) count++;
          expect(count).toBe(n);
        }, WARMUP, SAMPLES));
        rows.push(sample(`planValidate/${n}`, () => {
          let count = 0;
          for (let i = 0; i < n; i++) if (isUsableAnatomyRenderPlanCached(plans[i])) count++;
          expect(count).toBe(n);
        }, WARMUP, SAMPLES));

        // Anatomia legacy: per creatura, solo se i geni cambiano (qui sempre calda).
        const anatomies = Array.from({ length: n }, (_, i) => computeCreatureAnatomy({
          speed: frame.organismsSpeed[i], carnivory: frame.organismsCarnivory[i], vision: frame.organismsVision[i],
          evasion: frame.organismsEvasion[i], huntingSkill: frame.organismsHuntingSkill[i],
        }));
        rows.push(sample(`anatomyCacheHit/${n}`, () => {
          let h = 0;
          for (let i = 0; i < n; i++) h += anatomies[i].bodyHalfWidth;
          expect(Number.isFinite(h)).toBe(true);
        }, WARMUP, SAMPLES));
        rows.push(sample(`anatomyCold/${n}`, () => {
          let h = 0;
          for (let i = 0; i < n; i++) {
            h += computeCreatureAnatomy({
              speed: frame.organismsSpeed[i], carnivory: frame.organismsCarnivory[i], vision: frame.organismsVision[i],
              evasion: frame.organismsEvasion[i], huntingSkill: frame.organismsHuntingSkill[i],
            }).bodyHalfWidth;
          }
          expect(Number.isFinite(h)).toBe(true);
        }, 1, 3));

        // Animazione: traccia visiva + posa (LOD alto).
        rows.push(sample(`animationTrack/${n}`, () => {
          for (let i = 0; i < n; i++) {
            stepVisualMotion(motion, 0.01, 0.01, 0.02, 16, frame.organismsSize[i], creatureScale(frame.organismsSize[i]));
            advancePhase(0.5, motion.visSpeed, 16, creatureScale(frame.organismsSize[i]));
            stepLiving(living, 16, normalizedSpeed(motion.visSpeed, creatureScale(frame.organismsSize[i])), 0);
          }
        }, WARMUP, SAMPLES));
        rows.push(sample(`poseFull/${n}`, () => {
          for (let i = 0; i < n; i++) {
            lodWeights(5, weights);
            lodDetail(weights, detail);
            computeBodyPose(pose, 0.5, motion, 1, anatomies[i], detail);
            applyLivingPose(pose, living, detail);
          }
        }, WARMUP, SAMPLES));

        // Scrittura matrici: ~15 partial per creatura come nel loop reale.
        const target = mesh(CAP * 4);
        rows.push(sample(`matrixWrites/${n}`, () => {
          for (let i = 0; i < n; i++) {
            pos.set(i % 100, 0, (i / 100) | 0);
            scl.set(1, 1, 1);
            for (let p = 0; p < 15; p++) {
              mat.compose(pos, quat, scl);
              target.setMatrixAt(i * 15 + p, mat);
            }
          }
        }, WARMUP, SAMPLES));
        rows.push(sample(`colorWrites/${n}`, () => {
          for (let i = 0; i < n; i++) {
            col.setHSL((i % 360) / 360, 0.7, 0.6);
            for (let p = 0; p < 12; p++) target.setColorAt(i * 12 + p, col);
          }
        }, WARMUP, SAMPLES));

        // Parti generiche: una parte segmento + una appendice per creatura.
        const generic = mesh(CAP * KEYS.length);
        rows.push(sample(`genericPartsApprox/${n}`, () => {
          for (let i = 0; i < n; i++) {
            for (let p = 0; p < 2; p++) {
              const slot = i * 2 + p;
              scl.set(0.2, 0.4, 0.2);
              mat.compose(pos, quat, scl);
              generic.setMatrixAt(slot, mat);
              generic.setColorAt(slot, col);
            }
          }
        }, WARMUP, SAMPLES));

        // Marcatura degli upload: clearUpdateRanges + addUpdateRange su 12 mesh.
        const meshes = [target, generic];
        rows.push(sample(`bufferFlag/${n}`, () => {
          for (const m of meshes) {
            m.count = Math.min(CAP, n);
            m.instanceMatrix.clearUpdateRanges();
            m.instanceMatrix.addUpdateRange(0, m.count * 16);
            m.instanceMatrix.needsUpdate = true;
            if (m.instanceColor) {
              m.instanceColor.clearUpdateRanges();
              m.instanceColor.addUpdateRange(0, m.count * 3);
              m.instanceColor.needsUpdate = true;
            }
          }
        }, WARMUP, SAMPLES));

        // Culling locale (percorso follow): confronto con il caso senza cull.
        const candidates = ensureCandidateBuffer(n);
        rows.push(sample(`nearbyCull/${n}`, () => {
          const count = collectNearbyOrganisms(candidates, frame.organismsX, frame.organismsY, n,
            frame.organismsX[0], frame.organismsY[0], frame.planetWidth, frame.planetHeight, 6, 8);
          expect(count).toBeGreaterThanOrEqual(0);
        }, WARMUP, SAMPLES));

        // Loop integrato: misura di riferimento, non somma delle fasi.
        rows.push(sample(`updateCreatureInstances/total/${n}`, () => {
          updateCreatureInstances(refs, frame, null, null, 16, null, source);
        }, WARMUP, SAMPLES));
      }

      console.table(rows.map((r) => ({
        fase: r.label, mediana_ms: r.medianMs.toFixed(3), p95_ms: r.p95Ms.toFixed(3), heap_delta_kb: r.heapDeltaKB,
      })));
      console.log("G31_PROFILE_JSON=" + JSON.stringify({
        environment: {
          node: (proc as { version?: string } | undefined)?.version ?? null,
          platform: (proc as { platform?: string } | undefined)?.platform ?? null,
          gpu: null,
          note: "CPU main-thread Node; FPS/upload GPU non misurabili; heapDelta e' indicatore grezzo con GC.",
        },
        samples: rows.map((r) => ({
          label: r.label,
          medianMs: Number(r.medianMs.toFixed(3)),
          p95Ms: Number(r.p95Ms.toFixed(3)),
          heapDeltaKB: r.heapDeltaKB,
        })),
      }));
      for (const row of rows) {
        expect(Number.isFinite(row.medianMs)).toBe(true);
        expect(row.medianMs).toBeGreaterThanOrEqual(0);
      }
    },
    600_000,
  );
});
