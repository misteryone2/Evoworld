/**
 * Maps a point on the flat, doubly-wrapping simulation grid (see
 * distanceWrapped in simulation/ecology/spatialIndex.ts — the world wraps
 * on both axes, topologically a torus) onto the surface of a sphere for
 * the v0.7 3D view.
 *
 * IMPORTANT LIMITATION, stated plainly rather than hidden: a torus and a
 * sphere are not the same shape (different genus), so this mapping cannot
 * be seamless. The top and bottom rows of the grid (gridY near 0 and near
 * gridHeight) get compressed toward the north/south poles of the sphere,
 * same as any equirectangular projection (the same distortion a flat map
 * of Earth has at the poles). This is a deliberate, acknowledged
 * simplification for this version — a "true" spherical world model would
 * mean regenerating the planet's biome/climate grid natively on a sphere,
 * which is out of scope for a rendering-only version.
 */
export interface SpherePoint {
  x: number;
  y: number;
  z: number;
  /** Outward unit normal at this point (== position / radius), used to orient creatures flush against the curved surface. */
  normalX: number;
  normalY: number;
  normalZ: number;
}

/**
 * v1.2.2 — Real 3D Surface. How far (in the same world units as
 * PLANET_RADIUS in Planet3DView.tsx) elevation can push the surface
 * outward at its highest, and how far ocean can recess it inward — kept
 * as clearly separate, easily-tunable constants rather than baked into a
 * formula, per the brief's request for an easily-adjustable height
 * parameter. Deliberately small relative to a typical PLANET_RADIUS of 5
 * (8% / 2.4%): visible relief without turning the planet into a
 * recognizably non-spherical shape — `radius = PLANET_RADIUS *
 * elevation` was explicitly avoided as it would destroy the planet's
 * silhouette entirely.
 */
export const PLANET_HEIGHT_SCALE = 0.4;
export const OCEAN_DEPTH_SCALE = 0.12;

/**
 * v1.2.2 — matches simulation/core/renderFrame.ts's TERRAIN_CODE.ocean.
 * Duplicated locally (not imported) on purpose, following this project's
 * existing convention (see components/simulation/PlanetCanvas.tsx's own
 * local terrain code/label maps) of keeping rendering-layer files
 * decoupled from the simulation's internal modules.
 */
const OCEAN_TERRAIN_CODE = 0;

/**
 * v1.2.2 — maps a cell's elevation (and whether it's ocean) to a radial
 * displacement from the planet's base radius. Land rises smoothly above
 * the base radius (eased, not linear, so low-lying plains stay close to
 * the base while only genuinely high elevation produces a pronounced
 * bump); ocean recesses gently below it. Both branches pass through (or
 * very near) zero displacement at low elevation, so the transition at a
 * coastline is a small, plausible step rather than a jarring cliff or a
 * discontinuity blowing up to infinity — bounded, continuous within each
 * branch, and clamped so a malformed/out-of-range elevation input can
 * never produce NaN or an unbounded value.
 */
export function elevationDisplacement(elevation: number, isOcean: boolean): number {
  const e = Number.isFinite(elevation) ? Math.max(0, Math.min(1, elevation)) : 0;
  if (isOcean) {
    return -OCEAN_DEPTH_SCALE * (1 - e);
  }
  const eased = e * e * (3 - 2 * e); // smoothstep-style ease, avoids a linear "tent" look
  return eased * PLANET_HEIGHT_SCALE;
}

/**
 * v1.2.2 — bilinear sample of a bounded-resolution viewport channel
 * (elevation, or any other single-value Float32Array channel) at a given
 * world coordinate, using the same origin/cellsWidth/cellsHeight mapping
 * viewportFrame.ts used to generate it. Wraps on both axes to match the
 * simulation's toroidal world. Used for the mesh vertex displacement,
 * where visual smoothness across the (comparatively coarse) viewport
 * texture matters.
 */
export function sampleViewportChannelBilinear(
  worldX: number,
  worldY: number,
  channel: Float32Array,
  originX: number,
  originY: number,
  cellsWidth: number,
  cellsHeight: number,
  texWidth: number,
  texHeight: number,
): number {
  const localX = ((((worldX - originX) / cellsWidth) * texWidth - 0.5) % texWidth + texWidth) % texWidth;
  const localY = ((((worldY - originY) / cellsHeight) * texHeight - 0.5) % texHeight + texHeight) % texHeight;
  const x0 = Math.floor(localX);
  const y0 = Math.floor(localY);
  const x1 = (x0 + 1) % texWidth;
  const y1 = (y0 + 1) % texHeight;
  const tx = localX - x0;
  const ty = localY - y0;
  const v00 = channel[y0 * texWidth + x0];
  const v10 = channel[y0 * texWidth + x1];
  const v01 = channel[y1 * texWidth + x0];
  const v11 = channel[y1 * texWidth + x1];
  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * ty;
}

/**
 * v1.2.2 — nearest-sample lookup into the viewport's terrain code
 * channel, used only to decide "is this an ocean cell" for displacement
 * purposes. Nearest (not bilinear — there's no meaningful way to
 * interpolate a discrete terrain code) and deliberately cheap: called
 * once per organism per frame for creature resting-height, so it must
 * stay O(1) and allocation-free.
 */
export function sampleViewportTerrainIsOcean(
  worldX: number,
  worldY: number,
  terrainChannel: Uint8Array,
  originX: number,
  originY: number,
  cellsWidth: number,
  cellsHeight: number,
  texWidth: number,
  texHeight: number,
): boolean {
  const localX = Math.floor((((worldX - originX) / cellsWidth) * texWidth % texWidth) + texWidth) % texWidth;
  const localY = Math.floor((((worldY - originY) / cellsHeight) * texHeight % texHeight) + texHeight) % texHeight;
  return terrainChannel[localY * texWidth + localX] === OCEAN_TERRAIN_CODE;
}

/**
 * v1.2.2 — nearest-sample lookup into the viewport's elevation channel,
 * for the same cheap/per-organism-per-frame use case as
 * sampleViewportTerrainIsOcean above (mesh vertex displacement uses the
 * bilinear variant instead, where smoothness matters more than raw
 * speed).
 */
export function sampleViewportElevationNearest(
  worldX: number,
  worldY: number,
  elevationChannel: Float32Array,
  originX: number,
  originY: number,
  cellsWidth: number,
  cellsHeight: number,
  texWidth: number,
  texHeight: number,
): number {
  const localX = Math.floor((((worldX - originX) / cellsWidth) * texWidth % texWidth) + texWidth) % texWidth;
  const localY = Math.floor((((worldY - originY) / cellsHeight) * texHeight % texHeight) + texHeight) % texHeight;
  return elevationChannel[localY * texWidth + localX];
}

/**
 * Projects grid coordinates (gridX in [0, gridWidth), gridY in [0,
 * gridHeight)) onto a sphere of the given radius, using the same
 * longitude/latitude formula THREE.SphereGeometry uses internally so that
 * creature positions computed here line up with the DataTexture painted
 * onto that geometry (see components/simulation/Planet3DView.tsx).
 */
export function projectToSphere(
  gridX: number,
  gridY: number,
  gridWidth: number,
  gridHeight: number,
  radius: number,
): SpherePoint {
  const u = (((gridX % gridWidth) + gridWidth) % gridWidth) / gridWidth;
  const v = (((gridY % gridHeight) + gridHeight) % gridHeight) / gridHeight;

  const theta = u * Math.PI * 2; // longitude, 0..2π
  const phi = v * Math.PI; // latitude, 0 (north pole) .. π (south pole)
  const sinPhi = Math.sin(phi);

  const normalX = -Math.cos(theta) * sinPhi;
  const normalY = Math.cos(phi);
  const normalZ = Math.sin(theta) * sinPhi;

  return {
    x: normalX * radius,
    y: normalY * radius,
    z: normalZ * radius,
    normalX,
    normalY,
    normalZ,
  };
}
