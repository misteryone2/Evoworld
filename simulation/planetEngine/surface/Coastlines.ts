/**
 * PHYSICAL_MODEL
 *
 * Coastlines are derived from the ocean mask with a wrapped 8-neighbourhood.
 * Because the operation is a pure scan, the result cannot depend on chunk
 * access order.
 */

import type { SurfaceField } from "../contracts";

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

export function isCoastlineCell(mask: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  const index = y * width + x;
  if (mask[index] !== 0) return false;
  for (const [dx, dy] of NEIGHBOURS) {
    const nx = ((x + dx) % width + width) % width;
    const ny = ((y + dy) % height + height) % height;
    if (mask[ny * width + nx] === 1) return true;
  }
  return false;
}

export function buildCoastlineMask(field: SurfaceField): Uint8Array {
  const mask = new Uint8Array(field.elevationM.length);
  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      mask[y * field.width + x] = isCoastlineCell(field.oceanMask, field.width, field.height, x, y) ? 1 : 0;
    }
  }
  return mask;
}
