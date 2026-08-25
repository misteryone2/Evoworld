import type { Cell, RenderFrame } from "../../types";
import { World } from "./world";

export const TERRAIN_CODE: Record<string, number> = {
  ocean: 0,
  plains: 1,
  desert: 2,
  mountain: 3,
  forest: 4,
  tundra: 5,
  savanna: 6,
};

/**
 * v1.1 — resolution of the fixed sample grid used to compute average
 * vegetation for RenderFrame/history charts. Bounded and independent of
 * the planet's actual size: a 512x512 world and a 2048x2048 world cost
 * exactly the same here (SAMPLE_GRID^2 cell reads), by design — see
 * sampleAverageVegetation.
 */
const SAMPLE_GRID = 32;

/**
 * Cheap, world-size-independent estimate of average vegetation across the
 * whole planet, for the history chart (HistoryPoint.avgVegetation) — see
 * lib/historyAccumulation.ts. Pre-v1.1 this was computed client-side from
 * the full per-cell vegetation array shipped every frame; that array no
 * longer exists (see buildRenderFrame's doc comment), so the worker
 * computes this small scalar itself instead.
 *
 * Reads via peekCell where a chunk is already materialized (accurate,
 * reflects real simulated drift), falling back to sampleBaseline
 * elsewhere (a cheap, stateless approximation for unexplored regions —
 * consistent with how the viewport overview texture handles the same
 * situation, see viewportFrame.ts). Never materializes new chunks.
 */
function sampleAverageVegetation(world: World): number {
  const { planet } = world;
  let sum = 0;
  let count = 0;
  for (let sy = 0; sy < SAMPLE_GRID; sy++) {
    const y = Math.floor((sy / SAMPLE_GRID) * planet.height);
    for (let sx = 0; sx < SAMPLE_GRID; sx++) {
      const x = Math.floor((sx / SAMPLE_GRID) * planet.width);
      const cell: Cell = planet.peekCell(x, y) ?? planet.sampleBaseline(x, y);
      sum += cell.vegetation;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Converts the current World state into a compact, transferable payload
 * sent to the UI every rendered frame. We deliberately avoid sending
 * per-organism objects with named fields: typed arrays are cheap to
 * structured-clone/transfer across the worker boundary. The species
 * genealogy is small (one small object per species ever created), so it
 * is sent as a plain array rather than a typed array.
 *
 * v1.1 — World Scale: this frame no longer carries the full per-cell
 * vegetation/terrain grid. With worlds now potentially spanning millions
 * of cells, shipping that every tick (and every tick's worth of texture
 * repaint on the UI side) is exactly the cost this version exists to
 * remove. Terrain/vegetation for rendering is now requested separately
 * and on demand — see ViewportRequest/ViewportFrame and
 * simulation/core/viewportFrame.ts — decoupled from the organism frame's
 * per-tick cadence entirely.
 */
export function buildRenderFrame(world: World): RenderFrame {
  const { planet, organisms } = world;

  const n = organisms.length;
  const organismsX = new Float32Array(n);
  const organismsY = new Float32Array(n);
  const organismsSpecies = new Uint16Array(n);
  const organismsSize = new Float32Array(n);
  const organismsSpeed = new Float32Array(n);
  const organismsCarnivory = new Float32Array(n);
  const organismsVision = new Float32Array(n);
  const organismsEvasion = new Float32Array(n);
  const organismsHuntingSkill = new Float32Array(n);
  const organismsId = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const o = organisms[i];
    organismsX[i] = o.position.x;
    organismsY[i] = o.position.y;
    organismsSpecies[i] = o.speciesId % 65535;
    organismsSize[i] = o.genome.size;
    organismsSpeed[i] = o.genome.speed;
    organismsCarnivory[i] = o.genome.carnivory;
    organismsVision[i] = o.genome.vision;
    organismsEvasion[i] = o.genome.evasion;
    organismsHuntingSkill[i] = o.genome.huntingSkill;
    organismsId[i] = o.id;
  }

  const stats = world.getStats();

  return {
    tick: world.tick,
    year: stats.year,
    stats,
    planetWidth: planet.width,
    planetHeight: planet.height,
    organismsX,
    organismsY,
    organismsSpecies,
    organismsSize,
    organismsSpeed,
    organismsCarnivory,
    organismsVision,
    organismsEvasion,
    organismsHuntingSkill,
    organismsId,
    speciesTree: world.getSpeciesTree(),
    speciesGenomeStats: world.getSpeciesGenomeStats(),
    avgVegetation: sampleAverageVegetation(world),
  };
}
