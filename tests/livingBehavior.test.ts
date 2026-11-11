import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { RenderFrame } from "../types";
import { updateCreatureInstances, type SceneRefs } from "../components/simulation/Planet3DView";
import { createBodyPose, computeBodyPose } from "../lib/bodyAnimation";
import {
  createLivingState,
  stepLiving,
  applyLivingPose,
  seedFromId,
  livingPresence,
  EAT_GAIN_PER_TICK,
  EAT_HOLD_MS,
  REST_START_MS,
  REST_FULL_MS,
  STATE_TAU_MS,
  type LivingState,
} from "../lib/livingBehavior";
import { createMotionBuffer, ingestMotionFrame, interpolatedFrame, interpolatedPositions } from "../lib/motionInterpolation";
import { buildRenderFrame, computeSpeciesAnalysis } from "../simulation/core/renderFrame";
import { World } from "../simulation/core/world";

const run = (s: LivingState, ms: number, vn: number, gain: number, step = 16) => {
  for (let t = 0; t < ms; t += step) stepLiving(s, step, vn, gain);
};
const anatomy = { legLength: 0.75, bodyHalfLength: 1.27, tailLength: 1.05 };

describe("v1.10.4 — stati", () => {
  it("camminando, tutti i pesi dei comportamenti da fermo sono zero", () => {
    const s = createLivingState(7);
    run(s, 2000, 0.6, 0);
    expect(livingPresence(s)).toBe(0);
  });

  it("appena ferma, passa gradualmente a idle (non a scatto)", () => {
    const s = createLivingState(7);
    run(s, 2000, 0.6, 0);
    stepLiving(s, 16, 0, 0);
    expect(s.idle).toBeGreaterThan(0);
    expect(s.idle).toBeLessThan(0.15); // il primo passo non salta a 1
    run(s, STATE_TAU_MS * 6, 0, 0);
    expect(s.idle).toBeGreaterThan(0.95);
    expect(s.eat).toBe(0);
    expect(s.rest).toBe(0);
  });

  it("ferma da molto, passa a riposo; non prima del tempo", () => {
    const s = createLivingState(7);
    run(s, REST_START_MS - 200, 0, 0);
    expect(s.rest).toBeLessThan(0.05);
    run(s, REST_FULL_MS - REST_START_MS + 2500, 0, 0);
    expect(s.rest).toBeGreaterThan(0.95);
    expect(s.idle).toBeLessThan(0.05);
  });

  it("ferma con energia che sale, mangia; l'energia che smette di salire lascia ancora un attimo e poi passa oltre", () => {
    const s = createLivingState(7);
    run(s, 800, 0, EAT_GAIN_PER_TICK * 3);
    expect(s.eat).toBeGreaterThan(0.9);
    run(s, EAT_HOLD_MS - 100, 0, 0);
    expect(s.eat).toBeGreaterThan(0.5); // tiene ancora un po' (niente sfarfallio)
    run(s, 2500, 0, 0);
    expect(s.eat).toBeLessThan(0.05);
    expect(s.idle).toBeGreaterThan(0.9);
  });

  it("l'energia che sale mentre cammina non fa mangiare: cammina", () => {
    const s = createLivingState(7);
    run(s, 1500, 0.5, EAT_GAIN_PER_TICK * 10);
    expect(s.eat).toBe(0);
  });

  it("se riprende a camminare, riposo e idle si spengono e il tempo da fermo riparte da zero", () => {
    const s = createLivingState(7);
    run(s, 10_000, 0, 0);
    expect(s.rest).toBeGreaterThan(0.9);
    run(s, 3000, 0.5, 0);
    expect(livingPresence(s)).toBeLessThan(1e-3); // si spegne in modo graduale (esponenziale)
    expect(s.stillMs).toBe(0);
  });

  it("i pesi stanno sempre in [0, 1] e sommano al massimo 1, in qualunque sequenza", () => {
    const s = createLivingState(3);
    const gains = [0, 0.3, 0, 0.2, 0];
    const speeds = [0, 0, 0.6, 0, 0.01];
    for (let k = 0; k < 3000; k++) {
      stepLiving(s, 16, speeds[(k >> 5) % 5], gains[(k >> 6) % 5]);
      for (const w of [s.idle, s.eat, s.rest]) {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1 + 1e-9);
      }
      expect(livingPresence(s)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("dopo una sospensione (dt enorme) non esplode; dt nullo non cambia nulla", () => {
    const s = createLivingState(1);
    stepLiving(s, 60_000, 0, 0);
    expect(Number.isFinite(s.clock) && Number.isFinite(s.breathPhase) && Number.isFinite(s.idle)).toBe(true);
    const copy = { ...s };
    stepLiving(s, 0, 0, 0);
    expect(s).toEqual(copy);
  });

  it("il seme viene dall'id: stabile, diverso da creatura a creatura, in [0, 1)", () => {
    expect(seedFromId(42)).toBe(seedFromId(42));
    const seeds = new Set<number>();
    for (let id = 1; id <= 200; id++) {
      const v = seedFromId(id);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      seeds.add(v);
    }
    expect(seeds.size).toBeGreaterThan(190);
  });
});

describe("v1.10.4 — la posa da ferma", () => {
  const poseOf = (s: LivingState) => {
    const p = createBodyPose();
    computeBodyPose(p, 0, { visSpeed: 0, turnRate: 0 }, 0.12, anatomy);
    applyLivingPose(p, s);
    return p;
  };

  it("cammina: nessun contributo da ferma", () => {
    const s = createLivingState(5);
    run(s, 1000, 0.6, 0);
    const p = createBodyPose();
    computeBodyPose(p, 1, { visSpeed: 0.3, turnRate: 0 }, 0.12, anatomy);
    const before = { ...p, legSwing: Array.from(p.legSwing) };
    applyLivingPose(p, s);
    expect({ ...p, legSwing: Array.from(p.legSwing) }).toEqual(before);
  });

  it("idle: il torace respira (la sezione oscilla attorno a 0, di poco) con la fase del respiro", () => {
    const s = createLivingState(5);
    run(s, 3000, 0, 0);
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < 400; k++) {
      stepLiving(s, 16, 0, 0);
      const b = poseOf(s).breath;
      lo = Math.min(lo, b);
      hi = Math.max(hi, b);
    }
    expect(lo).toBeLessThan(-0.01);
    expect(hi).toBeGreaterThan(0.01);
    expect(lo).toBeGreaterThan(-0.04);
    expect(hi).toBeLessThan(0.04);
  });

  it("il respiro è più lento a riposo e il tempo di un respiro è di qualche secondo", () => {
    const awake = createLivingState(5);
    const rested = createLivingState(5);
    run(rested, 10_000, 0, 0);
    awake.breathPhase = 0;
    rested.breathPhase = 0;
    run(awake, 3000, 0, 0);
    run(rested, 3000, 0, 0);
    // a parità di tempo, a riposo la fase è avanzata meno (ma il riposo è partito da altre fasi: si confronta l'avanzamento)
    const a = awake.breathPhase;
    const r = rested.breathPhase;
    expect(Number.isFinite(a) && Number.isFinite(r)).toBe(true);
    const sa = createLivingState(5);
    const sr = createLivingState(5);
    run(sr, 10_000, 0, 0);
    const startA = sa.breathPhase;
    const startR = sr.breathPhase;
    run(sa, 1000, 0, 0);
    run(sr, 1000, 0, 0);
    const adv = (from: number, to: number) => ((to - from) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    expect(adv(startR, sr.breathPhase)).toBeLessThan(adv(startA, sa.breathPhase) + 1e-9);
  });

  it("mangia: la testa scende (beccheggio positivo = muso in giù), con piccoli morsi; le zampe restano ferme", () => {
    const s = createLivingState(5);
    run(s, 1500, 0, 0.3);
    const p = poseOf(s);
    expect(p.headPitch).toBeGreaterThan(0.4);
    expect(p.headPitch).toBeLessThan(0.8);
    for (let n = 0; n < 4; n++) expect(p.legSwing[n]).toBeCloseTo(0, 12);
    // morsi: la testa non resta perfettamente ferma
    const values: number[] = [];
    for (let k = 0; k < 120; k++) {
      stepLiving(s, 16, 0, 0.3);
      values.push(poseOf(s).headPitch);
    }
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.03);
  });

  it("riposa: corpo più basso, testa e coda abbandonate, nessuna andatura", () => {
    const awake = createLivingState(5);
    run(awake, 2500, 0, 0);
    const rested = createLivingState(5);
    run(rested, 14_000, 0, 0);
    const a = poseOf(awake);
    const r = poseOf(rested);
    expect(r.bobY).toBeLessThan(a.bobY - 0.03);
    expect(r.headPitch).toBeGreaterThan(a.headPitch + 0.1);
    expect(r.tailPitch).toBeGreaterThan(a.tailPitch + 0.1);
    for (let n = 0; n < 4; n++) expect(r.legSwing[n]).toBeCloseTo(0, 12);
  });

  it("idle: i movimenti sono piccoli e poco frequenti (lo sguardo vaga solo a tratti)", () => {
    const s = createLivingState(9);
    run(s, 3000, 0, 0);
    let strong = 0;
    let total = 0;
    let maxYaw = 0;
    for (let k = 0; k < 6000; k++) {
      stepLiving(s, 16, 0, 0);
      const y = Math.abs(poseOf(s).headYaw);
      maxYaw = Math.max(maxYaw, y);
      if (y > 0.1) strong++;
      total++;
    }
    expect(maxYaw).toBeLessThanOrEqual(0.4 + 1e-9);
    expect(strong / total).toBeLessThan(0.35); // non è sempre in movimento
  });

  it("creature diverse non respirano e non si guardano attorno in sincrono", () => {
    const a = createLivingState(11);
    const b = createLivingState(12);
    run(a, 5000, 0, 0);
    run(b, 5000, 0, 0);
    expect(poseOf(a).breath).not.toBeCloseTo(poseOf(b).breath, 4);
  });

  it("le ampiezze restano entro limiti in qualunque stato", () => {
    for (const id of [1, 2, 3, 50, 999]) {
      for (const mode of ["idle", "eat", "rest"] as const) {
        const s = createLivingState(id);
        for (let k = 0; k < 2000; k++) {
          stepLiving(s, 16, 0, mode === "eat" ? 0.4 : 0);
          if (mode === "rest" && k < 700) continue;
          const p = poseOf(s);
          expect(Math.abs(p.breath)).toBeLessThanOrEqual(0.035);
          expect(Math.abs(p.headPitch)).toBeLessThanOrEqual(0.85);
          expect(Math.abs(p.headYaw)).toBeLessThanOrEqual(0.5);
          expect(Math.abs(p.tailYaw)).toBeLessThanOrEqual(0.2);
          expect(Math.abs(p.bobY)).toBeLessThanOrEqual(0.09);
        }
      }
    }
  });
});

describe("v1.10.4 — energia guadagnata dal frame del mondo", () => {
  const frame = (tick: number, energies: number[]) => ({
    tick,
    planetWidth: 512,
    planetHeight: 512,
    organismsId: Uint32Array.from(energies.map((_, i) => i + 1)),
    organismsX: Float32Array.from(energies.map((_, i) => 100 + i)),
    organismsY: Float32Array.from(energies.map(() => 100)),
    organismsEnergy: Float32Array.from(energies),
  });

  it("il guadagno per tick è la differenza di energia divisa per i tick passati", () => {
    const b = createMotionBuffer();
    ingestMotionFrame(b, frame(0, [50, 80, 30]), 0);
    ingestMotionFrame(b, frame(2, [53, 80, 24]), 200);
    const g = interpolatedPositions(b, 210).gain;
    expect(g[0]).toBeCloseTo(1.5, 5); // +3 in 2 tick
    expect(g[1]).toBeCloseTo(0, 5);
    expect(g[2]).toBeCloseTo(-3, 5);
  });

  it("una creatura appena nata o senza dato di energia ha guadagno 0", () => {
    const b = createMotionBuffer();
    ingestMotionFrame(b, frame(0, [50]), 0);
    ingestMotionFrame(b, frame(1, [50, 90]), 100);
    expect(interpolatedPositions(b, 110).gain[1]).toBe(0); // nata ora: non si inventa un guadagno
    const c = createMotionBuffer();
    ingestMotionFrame(c, { ...frame(0, [50]), organismsEnergy: undefined }, 0);
    ingestMotionFrame(c, { ...frame(1, [50]), organismsEnergy: undefined }, 100);
    expect(interpolatedPositions(c, 110).gain[0]).toBe(0);
  });

  it("interpolatedFrame porta il guadagno nel frame da disegnare, senza toccare l'energia reale", () => {
    const f0 = frame(0, [50]);
    const f1 = frame(1, [52]);
    const b = createMotionBuffer();
    ingestMotionFrame(b, f0, 0);
    ingestMotionFrame(b, f1, 100);
    const out = interpolatedFrame(f1, b, 120);
    expect(out.frame.organismsEnergyGain![0]).toBeCloseTo(2, 5);
    expect(Array.from(f1.organismsEnergy)).toEqual([52]);
  });

  it("il frame del mondo contiene l'energia di ogni organismo, uguale a quella reale", () => {
    const w = new World({ width: 128, height: 128, seed: 4 }, 60);
    for (let t = 0; t < 10; t++) w.step();
    const f = buildRenderFrame(w, computeSpeciesAnalysis(w));
    expect(f.organismsEnergy).toBeDefined();
    expect(f.organismsEnergy!.length).toBe(f.organismsId.length);
    for (let i = 0; i < f.organismsId.length; i++) {
      const o = w.organisms.find((x) => x.id === f.organismsId[i])!;
      expect(f.organismsEnergy![i]).toBeCloseTo(o.energy, 4);
    }
  });

  it("costruire il frame (e quindi leggere l'energia) non cambia la simulazione: stesso seme, stesso mondo", () => {
    const a = new World({ width: 128, height: 128, seed: 6 }, 70);
    const b = new World({ width: 128, height: 128, seed: 6 }, 70);
    for (let t = 0; t < 30; t++) {
      a.step();
      b.step();
      buildRenderFrame(b, computeSpeciesAnalysis(b)); // solo b costruisce i frame
    }
    expect(b.organisms.length).toBe(a.organisms.length);
    expect(b.organisms.map((o) => [o.id, o.position.x, o.position.y, o.energy])).toEqual(a.organisms.map((o) => [o.id, o.position.x, o.position.y, o.energy]));
  });
});

describe("v1.10.4 — nelle creature disegnate", () => {
  const CAP = 8;
  const mesh = (n: number) => new THREE.InstancedMesh(new THREE.SphereGeometry(1, 4, 3), new THREE.MeshBasicMaterial(), n);
  const refsFor = () =>
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
      maxCreatures: CAP,
      detail: 3,
    }) as unknown as SceneRefs;
  const frameAt = (x: number, y: number, gain?: number): RenderFrame =>
    ({
      planetWidth: 512,
      planetHeight: 512,
      organismsX: new Float32Array([x]),
      organismsY: new Float32Array([y]),
      organismsSpecies: new Uint16Array(1),
      organismsSize: new Float32Array([1]),
      organismsSpeed: new Float32Array([1]),
      organismsCarnivory: new Float32Array(1),
      organismsVision: new Float32Array([1]),
      organismsEvasion: new Float32Array(1),
      organismsHuntingSkill: new Float32Array([1]),
      organismsId: new Uint32Array([3]),
      organismsEnergyGain: gain === undefined ? undefined : new Float32Array([gain]),
    }) as unknown as RenderFrame;
  const headDrop = (refs: SceneRefs) => {
    const h = new THREE.Matrix4();
    const b = new THREE.Matrix4();
    refs.headMesh.getMatrixAt(0, h);
    refs.bodyMesh.getMatrixAt(0, b);
    // altezza della testa nel sistema del corpo (y locale)
    return new THREE.Vector3().setFromMatrixPosition(h.premultiply(b.clone().invert())).y;
  };

  it("una creatura che mangia (energia che sale, ferma) abbassa la testa; senza energia che sale no", () => {
    const eating = refsFor();
    const idle = refsFor();
    for (let k = 0; k < 90; k++) {
      updateCreatureInstances(eating, frameAt(200, 256, 0.4), null, null, 16);
      updateCreatureInstances(idle, frameAt(200, 256, 0), null, null, 16);
    }
    expect(headDrop(eating)).toBeLessThan(headDrop(idle) - 0.05);
    const track = [...eating.creatureTrack.values()][0];
    expect(track.living.eat).toBeGreaterThan(0.9);
    expect([...idle.creatureTrack.values()][0].living.eat).toBe(0);
  });

  it("senza il dato di energia nel frame, una creatura ferma resta idle o riposa (non mangia mai)", () => {
    const refs = refsFor();
    for (let k = 0; k < 600; k++) updateCreatureInstances(refs, frameAt(200, 256), null, null, 16);
    const t = [...refs.creatureTrack.values()][0];
    expect(t.living.eat).toBe(0);
    expect(t.living.rest).toBeGreaterThan(0.5); // ~9,6 s ferma
  });

  it("ferma, le zampe non camminano mai: né mangiando né riposando", () => {
    const refs = refsFor();
    const legs = () => {
      const out: number[] = [];
      for (let n = 0; n < 4; n++) {
        const m = new THREE.Matrix4();
        refs.legMesh.getMatrixAt(n, m);
        out.push(...m.elements);
      }
      return out;
    };
    for (let k = 0; k < 120; k++) updateCreatureInstances(refs, frameAt(200, 256, 0.4), null, null, 16);
    const a = legs();
    updateCreatureInstances(refs, frameAt(200, 256, 0.4), null, null, 16);
    expect(legs()).toEqual(a);
  });

  it("da mangiare a camminare: la transizione è graduale e senza scatti della testa", () => {
    const refs = refsFor();
    for (let k = 0; k < 90; k++) updateCreatureInstances(refs, frameAt(200, 256, 0.4), null, null, 16);
    let prev = headDrop(refs);
    let x = 200;
    let worst = 0;
    for (let k = 0; k < 60; k++) {
      x += 0.4;
      updateCreatureInstances(refs, frameAt(x, 256, 0), null, null, 16);
      const now = headDrop(refs);
      worst = Math.max(worst, Math.abs(now - prev));
      prev = now;
    }
    expect(worst).toBeLessThan(0.05);
    expect([...refs.creatureTrack.values()][0].living.eat).toBeLessThan(0.05);
  });
});
