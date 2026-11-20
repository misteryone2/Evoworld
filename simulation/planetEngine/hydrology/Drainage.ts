/**
 * SIMULATION_HEURISTIC
 *
 * D8 steepest-descent flow accumulation on the physical elevation grid. It is
 * a deterministic drainage proxy, not a full hydraulic solver.
 */

import type { ElevationGrid } from "../contracts";
import { clamp } from "../units";

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

function wrapped(value: number, size: number): number {
  return ((value % size) + size) % size;
}

export function slopeAt(grid: ElevationGrid, x: number, y: number): number {
  const { width, height, elevationM } = grid;
  const left = elevationM[y * width + wrapped(x - 1, width)];
  const right = elevationM[y * width + wrapped(x + 1, width)];
  const above = elevationM[wrapped(y - 1, height) * width + x];
  const below = elevationM[wrapped(y + 1, height) * width + x];
  const dx = (right - left) / 2;
  const dy = (below - above) / 2;
  return Math.sqrt(dx * dx + dy * dy);
}

export function runoffFractionFromSlope(slopeMPerM: number): number {
  return clamp(0.15 + slopeMPerM * 0.08, 0.05, 0.85);
}

/** Deterministic flow accumulation; ocean cells act as sinks. */
export function computeRiverFlow(
  grid: ElevationGrid,
  precipitationMPerYear: Float32Array,
  oceanMask: Uint8Array,
): Float32Array {
  const { width, height, elevationM } = grid;
  const flow = new Float32Array(elevationM.length);
  const order: number[] = [];

  for (let i = 0; i < elevationM.length; i += 1) {
    if (oceanMask[i] === 0) {
      flow[i] = 1 + Math.max(0, precipitationMPerYear[i]);
      order.push(i);
    }
  }
  order.sort((a, b) => elevationM[b] - elevationM[a]);

  for (const index of order) {
    const x = index % width;
    const y = Math.floor(index / width);
    let receiver = -1;
    let lowestM = elevationM[index];

    for (const [dx, dy] of NEIGHBOURS) {
      const nx = wrapped(x + dx, width);
      const ny = wrapped(y + dy, height);
      const candidate = ny * width + nx;
      if (elevationM[candidate] < lowestM) {
        lowestM = elevationM[candidate];
        receiver = candidate;
      }
    }
    if (receiver >= 0) flow[receiver] += flow[index];
  }

  for (let i = 0; i < flow.length; i += 1) {
    if (oceanMask[i] === 1) flow[i] = 0;
  }
  return flow;
}
