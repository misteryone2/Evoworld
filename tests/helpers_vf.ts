import type { ViewportFrame } from "../types";

export interface VfOptions {
  originX?: number;
  originY?: number;
  cells?: number;
  terrain?: number | ((x: number, y: number) => number);
  vegetation?: number;
  elevation?: number | ((x: number, y: number) => number);
  temperature?: number;
  tick?: number;
  lake?: (x: number, y: number) => boolean;
}

/** Un ViewportFrame sintetico di `cells` x `cells` celle (una texel per cella). */
export function makeVf(o: VfOptions = {}): ViewportFrame {
  const n = o.cells ?? 64;
  const terrain = new Uint8Array(n * n);
  const vegetation = new Float32Array(n * n).fill(o.vegetation ?? 0.8);
  const elevation = new Float32Array(n * n);
  const lake = new Uint8Array(n * n);
  const temperature = new Float32Array(n * n).fill(o.temperature ?? 15);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      terrain[i] = typeof o.terrain === "function" ? o.terrain(x, y) : (o.terrain ?? 1);
      elevation[i] = typeof o.elevation === "function" ? o.elevation(x, y) : (o.elevation ?? 0.5);
      lake[i] = o.lake?.(x, y) ? 1 : 0;
    }
  }
  return {
    tick: o.tick ?? 0,
    originX: o.originX ?? 100,
    originY: o.originY ?? 200,
    cellsWidth: n,
    cellsHeight: n,
    texWidth: n,
    texHeight: n,
    vegetation,
    terrain,
    elevation,
    riverFlow: new Float32Array(n * n),
    lake,
    temperature,
    planetHeight: 512,
  } as ViewportFrame;
}
