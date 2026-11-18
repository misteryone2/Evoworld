import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { updateCreatureInstances, type SceneRefs } from "../components/simulation/Planet3DView";
import { descriptorFromLegacyTraits } from "../lib/anatomy";
import { QUALITY_PROFILES } from "../lib/qualityProfile";
import { buildCreatureVisualDescriptor } from "../lib/visual/creatureVisualDescriptor";
import { projectAnatomyToVisual } from "../lib/visual/anatomyVisualBridge";
import { TRAIT_RANGES } from "../simulation/biology/genome";
import type { RenderFrame } from "../types";

/**
 * G-consolidamento — benchmark CPU ripetibile (Node, nessuna GPU).
 *
 * Esegui: npx vitest run --config vitest.bench.config.ts scripts/graphicsConsolidation.benchmark.ts
 *
 * NON misura FPS, upload GPU, draw call o fill-rate. Misura solo il costo
 * main-thread delle funzioni pure/CPU, su questa macchina, con warmup e
 * campioni multipli. Nessun miglioramento prestazionale viene dichiarato
 * senza confrontare i numeri prodotti qui.
 */

const POPULATIONS = [100, 500, 1500, 3000];
const WARMUP = 20;
const SAMPLES = 80;
const MAX_SPIKES = 3;
const LEGS = 4;
const CAP = Math.max(...POPULATIONS);

function mesh(capacity: number): THREE.InstancedMesh {
  return new THREE.InstancedMesh(new THREE.SphereGeometry(1, 4, 3), new THREE.MeshBasicMaterial(), capacity);
}

function makeRefs(detail: 1 | 2 | 3 = 3): SceneRefs {
  return {
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
  } as unknown as SceneRefs;
}

const mid = (k: keyof typeof TRAIT_RANGES) => (TRAIT_RANGES[k].min + TRAIT_RANGES[k].max) / 2;

function makeFrame(n: number): RenderFrame {
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
  }
  return {
    planetWidth: 512,
    planetHeight: 512,
    organismsX: x, organismsY: y, organismsSpecies: species, organismsSize: size,
    organismsSpeed: speed, organismsCarnivory: carnivory, organismsVision: vision,
    organismsEvasion: evasion, organismsHuntingSkill: hunting, organismsId: ids,
  } as unknown as RenderFrame;
}

interface Sample { label: string; medianMs: number; p95Ms: number; meanMs: number }

function sample(label: string, fn: () => void, warmup: number, samples: number): Sample {
  for (let i = 0; i < warmup; i++) fn();
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return {
    label,
    medianMs: times[Math.floor(times.length / 2)],
    p95Ms: times[Math.min(times.length - 1, Math.floor(times.length * 0.95))],
    meanMs: times.reduce((a, b) => a + b, 0) / times.length,
  };
}

describe("G-consolidamento — benchmark CPU (senza GPU)", () => {
  it(
    "misura updateCreatureInstances, descriptor G1 e ponte G2→G1",
    () => {
      const rows: Sample[] = [];
      for (const n of POPULATIONS) {
        const refs = makeRefs();
        const frame = makeFrame(n);
        rows.push(sample(`updateCreatureInstances/${n}`, () => {
          updateCreatureInstances(refs, frame, null, null, 16);
        }, WARMUP, SAMPLES));
      }

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
        media_ms: r.meanMs.toFixed(3),
      })));

      for (const row of rows) {
        expect(Number.isFinite(row.medianMs)).toBe(true);
        expect(row.medianMs).toBeGreaterThan(0);
      }
    },
    400_000,
  );
});
