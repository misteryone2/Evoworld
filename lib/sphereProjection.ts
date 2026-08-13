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
