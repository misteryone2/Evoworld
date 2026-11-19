import type { QualityProfile } from "../../../lib/qualityProfile";
import { WORLD_RADIUS_UNITS } from "../../../simulation/core/scale";

const PLANET_RADIUS = WORLD_RADIUS_UNITS;

/**
 * v1.1 — World Scale. Terrain texture LOD tiers, keyed by camera distance
 * from the planet (in units of PLANET_RADIUS). Farther away requests a
 * coarser overview; closer requests sharper detail — but the *maximum*
 * resolution is fixed regardless of how large the simulated world
 * actually is (512x512 vs 2048x2048 request the exact same tiers), which
 * is what keeps render cost flat as the world scales up. See
 * ViewportRequest/ViewportFrame and simulation/core/viewportFrame.ts.
 *
 * v1.2.2 — each tier also now specifies a mesh tessellation
 * (segmentsWidth/segmentsHeight for the sphere's own widthSegments/
 * heightSegments): geometry only gets as detailed as the camera distance
 * actually warrants, same principle as the texture resolution, reusing
 * the exact same tier list rather than a second, independent LOD system.
 */
export const TERRAIN_LOD_TIERS: { minDistanceFactor: number; maxWidth: number; maxHeight: number; segmentsWidth: number; segmentsHeight: number }[] = [
  { minDistanceFactor: 4, maxWidth: 320, maxHeight: 160, segmentsWidth: 64, segmentsHeight: 48 },
  { minDistanceFactor: 2.2, maxWidth: 640, maxHeight: 320, segmentsWidth: 96, segmentsHeight: 64 },
  { minDistanceFactor: 0, maxWidth: 1024, maxHeight: 512, segmentsWidth: 160, segmentsHeight: 112 },
];
/** How often (ms) camera distance is polled to decide whether a new terrain LOD tier should be requested. */
export const TERRAIN_LOD_CHECK_INTERVAL_MS = 500;

export type TerrainTier = { minDistanceFactor: number; maxWidth: number; maxHeight: number; segmentsWidth: number; segmentsHeight: number };

/** v1.6.0 — the LOD tiers a profile may use: those whose texture is no wider than the profile allows (always at least the coarsest one). */
export function tiersForProfile(profile: QualityProfile): TerrainTier[] {
  const allowed = TERRAIN_LOD_TIERS.filter((t) => t.maxWidth <= profile.terrainMaxWidth);
  return allowed.length > 0 ? allowed : [TERRAIN_LOD_TIERS[0]];
}

export function pickTerrainLodTier(distance: number, tiers: TerrainTier[]): TerrainTier {
  const factor = distance / PLANET_RADIUS;
  for (const tier of tiers) {
    if (factor >= tier.minDistanceFactor) return tier;
  }
  return tiers[tiers.length - 1];
}
