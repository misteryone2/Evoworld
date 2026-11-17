import type { SceneRefs } from "./types";
import { PLANET_RADIUS } from "./constants";
import { groundContains, groundRadius } from "../../../lib/localGround";
import { elevationDisplacement, sampleViewportElevationNearest, sampleViewportTerrainIsOcean } from "../../../lib/sphereProjection";

/**
 * v1.2.2 — Real 3D Surface: resting radius for a creature/marker at a
 * given world (x, y), sampled from the same on-demand viewport heightmap
 * already used to displace the terrain mesh (see the [viewportFrame]
 * effect above) — never a per-tick simulation query, so this adds zero
 * bytes to RenderFrame. `restOffset` is the small existing "hover above
 * the ground" gap (0.02 for bodies, 0.05 for the selection ring, both
 * pre-existing since v0.7/v1.0.4) preserved on top of the terrain height.
 * Falls back to flat PLANET_RADIUS + restOffset if no viewport data has
 * arrived yet (e.g. the very first frame), exactly matching pre-v1.2.2
 * behavior in that case.
 */
export function restingRadius(refs: Pick<SceneRefs, "heightmap"> & Partial<Pick<SceneRefs, "local">>, worldX: number, worldY: number, restOffset: number): number {
  // v1.8.0 — dentro il terreno locale si poggia sulla stessa superficie che è disegnata (stessa funzione dei vertici).
  const ground = refs.local?.ground;
  if (ground && groundContains(ground, worldX, worldY, 1)) return groundRadius(ground, worldX, worldY, PLANET_RADIUS) + restOffset;
  const hm = refs.heightmap;
  if (!hm) return PLANET_RADIUS + restOffset;
  const elevation = sampleViewportElevationNearest(worldX, worldY, hm.elevation, hm.originX, hm.originY, hm.cellsWidth, hm.cellsHeight, hm.texWidth, hm.texHeight);
  const isOcean = sampleViewportTerrainIsOcean(worldX, worldY, hm.terrain, hm.originX, hm.originY, hm.cellsWidth, hm.cellsHeight, hm.texWidth, hm.texHeight);
  return PLANET_RADIUS + elevationDisplacement(elevation, isOcean) + restOffset;
}
