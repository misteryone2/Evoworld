import type { Cell, ViewportFrame, ViewportRequest } from "../../types";
import { World } from "./world";
import { TERRAIN_CODE } from "./renderFrame";

/**
 * v1.1 — World Scale. Builds a terrain/vegetation/elevation texture
 * payload for one requested viewport, on demand — never as part of the
 * per-tick RenderFrame (see renderFrame.ts's doc comment for why).
 * Resolution is capped by the request (request.maxWidth/maxHeight), never
 * by the planet's actual size: a 512x512 world and a 2048x2048 world
 * produce a ViewportFrame of exactly the same cost for the same request.
 *
 * Deliberately uses only Planet.peekCell (read-only, no chunk
 * materialization) and Planet.sampleBaseline (stateless, no chunk
 * materialization either) — never Planet.getCell. This keeps rendering
 * fully unable to grow simulation memory no matter how the camera moves
 * or zooms: only the simulation itself (organisms moving through
 * movement/feeding/predation) is allowed to materialize new chunks. Where
 * a chunk *is* already materialized (i.e. the simulation is actually
 * active there), the real live cell is used, so detail is naturally
 * sharper exactly where organisms are — everywhere else falls back to the
 * cheap stateless baseline. This is an intentional, honestly-documented
 * approximation: an unpopulated region's displayed vegetation reflects
 * its generation-time baseline, not real-time drift, since nothing is
 * dynamically simulating it.
 */
export function buildViewportFrame(world: World, request: ViewportRequest): ViewportFrame {
  const { planet } = world;

  const radiusX = Math.max(1, Math.min(request.radiusX, planet.width / 2));
  const radiusY = Math.max(1, Math.min(request.radiusY, planet.height / 2));
  const cellsWidth = Math.min(planet.width, Math.round(radiusX * 2));
  const cellsHeight = Math.min(planet.height, Math.round(radiusY * 2));

  const texWidth = Math.max(1, Math.min(request.maxWidth, cellsWidth));
  const texHeight = Math.max(1, Math.min(request.maxHeight, cellsHeight));

  const originX = request.centerX - radiusX;
  const originY = request.centerY - radiusY;

  const vegetation = new Float32Array(texWidth * texHeight);
  const terrain = new Uint8Array(texWidth * texHeight);
  // v1.2.2 — Real 3D Surface: elevation sampled in the exact same loop,
  // at the exact same bounded resolution, via the exact same read-only
  // accessors as every other channel here — see this function's own doc
  // comment above for why that matters (never materializes a chunk from
  // rendering, payload size tracks viewport resolution only).
  const elevation = new Float32Array(texWidth * texHeight);

  for (let ty = 0; ty < texHeight; ty++) {
    const wy = Math.floor(originY + ((ty + 0.5) / texHeight) * cellsHeight);
    for (let tx = 0; tx < texWidth; tx++) {
      const wx = Math.floor(originX + ((tx + 0.5) / texWidth) * cellsWidth);
      const cell: Cell = planet.peekCell(wx, wy) ?? planet.sampleBaseline(wx, wy);
      const i = ty * texWidth + tx;
      vegetation[i] = cell.vegetation;
      terrain[i] = TERRAIN_CODE[cell.terrain] ?? 1;
      elevation[i] = cell.elevation;
    }
  }

  return {
    tick: world.tick,
    originX,
    originY,
    cellsWidth,
    cellsHeight,
    texWidth,
    texHeight,
    vegetation,
    terrain,
    elevation,
  };
}
