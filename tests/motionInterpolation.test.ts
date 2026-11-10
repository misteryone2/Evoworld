import { describe, it, expect } from "vitest";
import {
  createMotionBuffer,
  ingestMotionFrame,
  interpolatedPositions,
  interpolatedFrame,
  lerpWrapped,
  motionAlpha,
  resetMotion,
  DEFAULT_INTERVAL_MS,
  MAX_INTERPOLATED_TICKS,
  MAX_INTERVAL_MS,
  MIN_INTERVAL_MS,
  SUSPENSION_GAP_MS,
  type MotionFrameInput,
} from "../lib/motionInterpolation";

const W = 512;
const H = 512;
const frameOf = (tick: number, ids: number[], xs: number[], ys: number[], w = W, h = H): MotionFrameInput => ({
  tick,
  planetWidth: w,
  planetHeight: h,
  organismsId: Uint32Array.from(ids),
  organismsX: Float32Array.from(xs),
  organismsY: Float32Array.from(ys),
});

/** Registra due frame a 100 ms di distanza (un tick l'uno dall'altro) e restituisce il buffer. */
function twoFrames(x0: number, y0: number, x1: number, y1: number, w = W, h = H) {
  const b = createMotionBuffer();
  ingestMotionFrame(b, frameOf(0, [1], [x0], [y0], w, h), 0);
  ingestMotionFrame(b, frameOf(1, [1], [x1], [y1], w, h), 100);
  return b;
}
const at = (b: ReturnType<typeof createMotionBuffer>, t: number, i = 0) => {
  const p = interpolatedPositions(b, t);
  return { x: p.x[i], y: p.y[i], alpha: p.alpha };
};

describe("v1.10.1 — lerpWrapped", () => {
  it("interpola in modo lineare", () => {
    expect(lerpWrapped(10, 20, 0, W)).toBe(10);
    expect(lerpWrapped(10, 20, 0.5, W)).toBe(15);
    expect(lerpWrapped(10, 20, 1, W)).toBe(20);
  });
  it("prende la via più corta attraverso il bordo, in entrambi i versi", () => {
    expect(lerpWrapped(510, 2, 0.5, W)).toBeCloseTo(0, 6);
    expect(lerpWrapped(2, 510, 0.5, W)).toBeCloseTo(0, 6);
    expect(lerpWrapped(510, 2, 0.25, W)).toBeCloseTo(511, 6);
    expect(lerpWrapped(2, 510, 0.25, W)).toBeCloseTo(1, 6);
  });
  it("il risultato sta sempre in [0, size)", () => {
    for (const [a, b] of [[0, 511], [511, 0], [3, 509], [255.9, 0.1], [0, 0]]) {
      for (let t = 0; t <= 1; t += 0.05) {
        const v = lerpWrapped(a, b, t, W);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(W);
      }
    }
  });
});

describe("v1.10.1 — registrazione e interpolazione", () => {
  it("una creatura nuova compare nel suo punto, senza strada da fare", () => {
    const b = createMotionBuffer();
    ingestMotionFrame(b, frameOf(5, [7], [100], [200]), 0);
    for (const t of [0, 50, 100, 400]) {
      const p = at(b, t);
      expect(p.x).toBe(100);
      expect(p.y).toBe(200);
    }
  });

  it("a metà del tempo la creatura è a metà strada", () => {
    const b = twoFrames(10, 20, 13, 24);
    const mid = at(b, 150);
    expect(mid.alpha).toBeCloseTo(0.5, 6);
    expect(mid.x).toBeCloseTo(11.5, 5);
    expect(mid.y).toBeCloseTo(22, 5);
    expect(at(b, 100).x).toBeCloseTo(10, 5); // all'arrivo del frame è ancora dov'era
    expect(at(b, 200).x).toBeCloseTo(13, 5); // finita l'interpolazione è arrivata
  });

  it("non estrapola mai oltre l'arrivo", () => {
    const b = twoFrames(10, 20, 13, 24);
    for (const t of [200, 500, 10_000]) {
      const p = at(b, t);
      expect(p.alpha).toBe(1);
      expect(p.x).toBe(13);
      expect(p.y).toBe(24);
    }
  });

  it("attraversa il bordo dalla via più corta (x e y)", () => {
    const bx = twoFrames(511, 100, 1, 100);
    expect(at(bx, 150).x).toBeCloseTo(0, 5);
    // mai lontano dal bordo
    for (let t = 100; t <= 200; t += 10) {
      const x = at(bx, t).x;
      expect(Math.min(x, W - x)).toBeLessThan(2.01);
    }
    const by = twoFrames(100, 1, 100, 510);
    expect(at(by, 150).y).toBeCloseTo(511.5, 4); // da 1 a 510 passando per il bordo: 3 celle, a metà è a -0,5
  });

  it("indipendente dal frame rate: dipende dal tempo, non da quante volte si campiona", () => {
    const a = twoFrames(10, 20, 13, 24);
    const b = twoFrames(10, 20, 13, 24);
    for (let t = 100; t < 150; t += 1) at(a, t); // campionata spesso
    const sparse = at(b, 150); // campionata una volta sola
    const dense = at(a, 150);
    expect(dense.x).toBeCloseTo(sparse.x, 6);
    expect(dense.y).toBeCloseTo(sparse.y, 6);
  });

  it("l'ordine delle creature nel frame può cambiare: ognuna resta la sua", () => {
    const b = createMotionBuffer();
    ingestMotionFrame(b, frameOf(0, [1, 2], [10, 100], [10, 100]), 0);
    ingestMotionFrame(b, frameOf(1, [2, 1], [102, 12], [100, 10]), 100); // ordine invertito
    const mid = interpolatedPositions(b, 150);
    expect(mid.x[0]).toBeCloseTo(101, 5); // id 2: da 100 a 102
    expect(mid.x[1]).toBeCloseTo(11, 5); // id 1: da 10 a 12
  });

  it("chi muore esce dal buffer; chi nasce compare dov'è", () => {
    const b = createMotionBuffer();
    ingestMotionFrame(b, frameOf(0, [1, 2, 3], [10, 20, 30], [10, 20, 30]), 0);
    expect(b.states.size).toBe(3);
    ingestMotionFrame(b, frameOf(1, [1, 3, 9], [11, 31, 50], [10, 31, 50]), 100);
    expect(b.states.size).toBe(3);
    expect(b.states.has(2)).toBe(false);
    const p = interpolatedPositions(b, 100);
    expect(p.x[2]).toBe(50); // l'id 9, nato adesso
  });
});

describe("v1.10.1 — continuità", () => {
  it("se arriva un frame a metà interpolazione, il nuovo tratto parte da dove la creatura è disegnata", () => {
    const b = twoFrames(10, 20, 13, 24);
    const displayed = at(b, 150); // a metà strada: x = 11.5
    ingestMotionFrame(b, frameOf(2, [1], [15], [27]), 150);
    const justAfter = at(b, 150);
    expect(justAfter.x).toBeCloseTo(displayed.x, 5); // nessun salto
    expect(justAfter.y).toBeCloseTo(displayed.y, 5);
    // e poi arriva a 15, 27
    const end = at(b, 150 + 100);
    expect(end.x).toBeCloseTo(15, 4);
  });
});

describe("v1.10.1 — casi in cui non si interpola", () => {
  it("un riposizionamento (salto più grande di un passo) scatta", () => {
    const b = twoFrames(10, 10, 100, 10); // 90 celle in un tick
    expect(at(b, 150).x).toBe(100);
  });

  it("un salto che attraversa il bordo ma è piccolo, invece, si interpola", () => {
    const b = twoFrames(510, 10, 1, 10);
    expect(at(b, 150).x).not.toBe(1);
  });

  it("molti tick in un frame (velocità alte) scattano", () => {
    const b = createMotionBuffer();
    ingestMotionFrame(b, frameOf(0, [1], [10], [10]), 0);
    ingestMotionFrame(b, frameOf(MAX_INTERPOLATED_TICKS + 1, [1], [12], [10]), 33);
    expect(at(b, 40).x).toBe(12);
    const c = createMotionBuffer();
    ingestMotionFrame(c, frameOf(0, [1], [10], [10]), 0);
    ingestMotionFrame(c, frameOf(MAX_INTERPOLATED_TICKS, [1], [12], [10]), 33);
    expect(at(c, 40).x).not.toBe(12); // al limite si interpola ancora
  });

  it("dopo una sospensione della scheda (tanto tempo tra due frame) scatta, e non scivola", () => {
    const b = createMotionBuffer();
    ingestMotionFrame(b, frameOf(0, [1], [10], [10]), 0);
    ingestMotionFrame(b, frameOf(1, [1], [12], [10]), SUSPENSION_GAP_MS + 1);
    expect(at(b, SUSPENSION_GAP_MS + 1).x).toBe(12);
    expect(b.intervalMs).toBe(DEFAULT_INTERVAL_MS); // la sospensione non falsa la stima
  });

  it("un frame con lo stesso tick (ripetuto) non cambia nulla", () => {
    const b = twoFrames(10, 20, 13, 24);
    const version = b.version;
    expect(ingestMotionFrame(b, frameOf(1, [1], [13], [24]), 130)).toBe(false);
    expect(b.version).toBe(version);
    expect(b.arrivalMs).toBe(100);
  });

  it("un tick più basso (mondo reimpostato o caricato) riparte da zero", () => {
    const b = twoFrames(10, 20, 13, 24);
    ingestMotionFrame(b, frameOf(0, [1], [200], [200]), 200);
    const p = at(b, 210);
    expect(p.x).toBe(200);
    expect(p.y).toBe(200);
  });

  it("un pianeta di dimensioni diverse riparte da zero", () => {
    const b = twoFrames(10, 20, 13, 24);
    ingestMotionFrame(b, frameOf(2, [1], [30], [30], 256, 256), 200);
    expect(at(b, 210).x).toBe(30);
  });

  it("resetMotion dimentica tutto", () => {
    const b = twoFrames(10, 20, 13, 24);
    resetMotion(b);
    expect(b.states.size).toBe(0);
    expect(b.hasFrame).toBe(false);
    expect(motionAlpha(b, 1000)).toBe(1);
  });
});

describe("v1.10.1 — durata stimata", () => {
  it("segue il ritmo dei frame e resta nei limiti", () => {
    const fast = createMotionBuffer();
    for (let k = 0; k < 30; k++) ingestMotionFrame(fast, frameOf(k, [1], [10 + k * 0.1], [10]), k * 33);
    expect(fast.intervalMs).toBeGreaterThan(30);
    expect(fast.intervalMs).toBeLessThan(40);

    const slow = createMotionBuffer();
    for (let k = 0; k < 30; k++) ingestMotionFrame(slow, frameOf(k, [1], [10 + k * 0.1], [10]), k * 600);
    expect(slow.intervalMs).toBeLessThanOrEqual(MAX_INTERVAL_MS);
    expect(slow.intervalMs).toBeGreaterThan(MAX_INTERVAL_MS * 0.95);

    const tiny = createMotionBuffer();
    for (let k = 0; k < 40; k++) ingestMotionFrame(tiny, frameOf(k, [1], [10 + k * 0.01], [10]), k * 2);
    expect(tiny.intervalMs).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
  });
});

describe("v1.10.1 — la posizione reale non si tocca", () => {
  it("i dati del frame restano identici dopo registrazione e interpolazione", () => {
    const f1 = frameOf(0, [1, 2], [10, 20], [30, 40]);
    const f2 = frameOf(1, [1, 2], [12, 22], [31, 41]);
    const copy1 = { x: Array.from(f1.organismsX), y: Array.from(f1.organismsY), id: Array.from(f1.organismsId) };
    const copy2 = { x: Array.from(f2.organismsX), y: Array.from(f2.organismsY), id: Array.from(f2.organismsId) };
    const b = createMotionBuffer();
    ingestMotionFrame(b, f1, 0);
    ingestMotionFrame(b, f2, 100);
    for (let t = 100; t < 260; t += 7) interpolatedPositions(b, t);
    const out = interpolatedFrame(f2, b, 150);
    expect(Array.from(f1.organismsX)).toEqual(copy1.x);
    expect(Array.from(f1.organismsY)).toEqual(copy1.y);
    expect(Array.from(f2.organismsX)).toEqual(copy2.x);
    expect(Array.from(f2.organismsY)).toEqual(copy2.y);
    expect(Array.from(f2.organismsId)).toEqual(copy2.id);
    expect(out.frame.organismsX).not.toBe(f2.organismsX); // un altro array: quello reale non è stato sostituito
  });

  it("interpolatedFrame: stesso resto del frame, posizioni sostituite, stessa lunghezza", () => {
    const f1 = { ...frameOf(0, [1, 2, 3], [10, 20, 30], [10, 20, 30]), extra: "dato" };
    const f2 = { ...frameOf(1, [1, 2, 3], [12, 22, 32], [10, 20, 30]), extra: "dato" };
    const b = createMotionBuffer();
    ingestMotionFrame(b, f1, 0);
    ingestMotionFrame(b, f2, 100);
    const { frame, alpha } = interpolatedFrame(f2, b, 150);
    expect(alpha).toBeCloseTo(0.5, 6);
    expect(frame.extra).toBe("dato");
    expect(frame.tick).toBe(1);
    expect(frame.organismsId).toBe(f2.organismsId);
    expect(frame.organismsX.length).toBe(3);
    expect(Array.from(frame.organismsX).map((v) => Math.round(v * 10) / 10)).toEqual([11, 21, 31]);
  });

  it("interpolatedFrame: se il buffer non corrisponde al frame, restituisce il frame com'è", () => {
    const f = frameOf(4, [1], [10], [10]);
    const empty = createMotionBuffer();
    expect(interpolatedFrame(f, empty, 0).frame).toBe(f);
    const b = createMotionBuffer();
    ingestMotionFrame(b, frameOf(3, [1], [9], [10]), 0); // tick diverso
    expect(interpolatedFrame(f, b, 10).frame).toBe(f);
    const c = createMotionBuffer();
    ingestMotionFrame(c, frameOf(4, [1, 2], [9, 3], [10, 3]), 0); // numero diverso
    expect(interpolatedFrame(f, c, 10).frame).toBe(f);
  });
});

import { headingBlendForDt } from "../lib/creatureHeading";

describe("v1.10.1 — rotazione indipendente dal frame rate", () => {
  it("0,4 ogni 100 ms come prima, 0 se non passa tempo", () => {
    expect(headingBlendForDt(100)).toBeCloseTo(0.4, 12);
    expect(headingBlendForDt(0)).toBe(0);
    expect(headingBlendForDt(-5)).toBe(0);
  });
  it("più aggiornamenti piccoli equivalgono a uno grande", () => {
    const two = 1 - (1 - headingBlendForDt(50)) * (1 - headingBlendForDt(50));
    expect(two).toBeCloseTo(headingBlendForDt(100), 12);
    let keep = 1;
    for (let k = 0; k < 6; k++) keep *= 1 - headingBlendForDt(100 / 6);
    expect(1 - keep).toBeCloseTo(0.4, 12);
  });
  it("cresce con il tempo e resta in [0, 1)", () => {
    let prev = -1;
    for (const dt of [1, 8, 16, 33, 100, 250]) {
      const b = headingBlendForDt(dt);
      expect(b).toBeGreaterThan(prev);
      expect(b).toBeLessThan(1);
      prev = b;
    }
  });
});

describe("v1.10.1 — fluidità complessiva", () => {
  /** Una creatura che fa 1 cella per tick, un frame del mondo ogni 100 ms, campionata a `fps`. Restituisce il salto massimo tra campioni consecutivi. */
  function maxStep(fps: number, interpolate: boolean): number {
    const b = createMotionBuffer();
    let raw = 100;
    ingestMotionFrame(b, frameOf(0, [1], [raw], [50]), 0);
    let lastX = raw;
    let worst = 0;
    const stepMs = 1000 / fps;
    let nextFrameAt = 100;
    let tick = 0;
    for (let t = stepMs; t <= 1500; t += stepMs) {
      while (t >= nextFrameAt) {
        tick++;
        raw += 1;
        ingestMotionFrame(b, frameOf(tick, [1], [raw], [50]), nextFrameAt);
        nextFrameAt += 100;
      }
      const x = interpolate ? interpolatedPositions(b, t).x[0] : raw;
      if (t > 300) worst = Math.max(worst, Math.abs(x - lastX));
      lastX = x;
    }
    return worst;
  }

  it("senza interpolazione la creatura salta di una cella; con l'interpolazione i passi sono piccoli, a 30, 60 e 144 fps", () => {
    expect(maxStep(60, false)).toBeGreaterThanOrEqual(0.99);
    for (const fps of [30, 60, 144]) {
      const step = maxStep(fps, true);
      expect(step).toBeLessThan((1000 / fps / 100) * 1.35); // ~ 1 cella ogni 100 ms, con un po' di margine
      expect(step).toBeGreaterThan(0);
    }
  });
});
