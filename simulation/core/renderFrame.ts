import type { RenderFrame } from "../../types";
import { World } from "./world";

const TERRAIN_CODE: Record<string, number> = {
  ocean: 0,
  plains: 1,
  desert: 2,
  mountain: 3,
  forest: 4,
  tundra: 5,
  savanna: 6,
};

/**
 * Converts the full World state into a compact, transferable payload. We
 * deliberately avoid sending per-organism objects with named fields: typed
 * arrays are cheap to structured-clone/transfer across the worker boundary
 * and keep the UI thread from having to manage React state per organism.
 * The species genealogy is small (one small object per species ever
 * created), so it is sent as a plain array rather than a typed array.
 */
export function buildRenderFrame(world: World): RenderFrame {
  const { planet, organisms } = world;
  const cellCount = planet.width * planet.height;

  const vegetation = new Float32Array(cellCount);
  const terrain = new Uint8Array(cellCount);
  for (let i = 0; i < cellCount; i++) {
    vegetation[i] = planet.cells[i].vegetation;
    terrain[i] = TERRAIN_CODE[planet.cells[i].terrain] ?? 1;
  }

  const n = organisms.length;
  const organismsX = new Float32Array(n);
  const organismsY = new Float32Array(n);
  const organismsSpecies = new Uint16Array(n);
  const organismsSize = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = organisms[i];
    organismsX[i] = o.position.x;
    organismsY[i] = o.position.y;
    organismsSpecies[i] = o.speciesId % 65535;
    organismsSize[i] = o.genome.size;
  }

  const stats = world.getStats();

  return {
    tick: world.tick,
    year: stats.year,
    stats,
    planetWidth: planet.width,
    planetHeight: planet.height,
    vegetation,
    terrain,
    organismsX,
    organismsY,
    organismsSpecies,
    organismsSize,
    speciesTree: world.getSpeciesTree(),
  };
}
