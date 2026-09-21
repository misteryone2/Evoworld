/**
 * Terrain/vegetation -> RGB color mapping, shared by the 2D canvas
 * rendering (components/simulation/PlanetCanvas.tsx) and the v0.7 3D
 * planet texture (components/simulation/Planet3DView.tsx), so both views
 * of the same world always agree on what a cell looks like.
 *
 * Terrain codes must match simulation/core/renderFrame.ts TERRAIN_CODE:
 * 0 ocean, 1 plains, 2 desert, 3 mountain, 4 forest, 5 tundra, 6 savanna.
 */
export function terrainColorRGB(terrainCode: number, vegetation: number): [number, number, number] {
  // ocean, mountain, tundra: fixed color, not vegetation-blended.
  if (terrainCode === 0) return [18, 58, 82];
  if (terrainCode === 3) return [107, 101, 88];
  if (terrainCode === 5) return [199, 212, 214];

  if (terrainCode === 2) {
    // desert lightly greens with vegetation
    const g = Math.round(140 + vegetation * 40);
    return [Math.round(194 - vegetation * 60), g, 90];
  }
  if (terrainCode === 4) {
    // forest: darker and richer with more vegetation
    const g = Math.round(70 + vegetation * 70);
    return [Math.round(20 + (1 - vegetation) * 30), g, Math.round(40 + (1 - vegetation) * 20)];
  }
  if (terrainCode === 6) {
    // savanna: warm tan blended slightly with green
    const g = Math.round(120 + vegetation * 40);
    return [Math.round(168 - vegetation * 30), g, 60];
  }

  // plains (default): interpolate from dry tan to lush green based on vegetation
  const r = Math.round(120 - vegetation * 50);
  const g = Math.round(110 + vegetation * 70);
  const b = Math.round(70 - vegetation * 20);
  return [r, g, b];
}

/**
 * v1.2.3 — Rivers & Lakes rendering (see HANDOFF.md's brief §§10-13): a
 * simple, cheap color overlay rather than any new geometry/shader — a
 * river/lake cell's base terrain color is blended toward a water tone,
 * with intensity driven by riverFlow (rivers) or a fixed strong blend
 * (lakes, since HydrologyResult doesn't grade lake "depth"). Applied
 * per-texel in the same texture-paint loop that already runs for every
 * viewport pixel (see components/simulation/Planet3DView.tsx), so it adds
 * no extra draw calls and no per-cell 3D objects — exactly what §§10-12 of
 * the brief require.
 */
const RIVER_COLOR: [number, number, number] = [64, 132, 189];
const LAKE_COLOR: [number, number, number] = [40, 96, 158];

export function applyWaterOverlayRGB(
  base: [number, number, number],
  riverFlow: number,
  isLake: boolean,
): [number, number, number] {
  if (isLake) {
    return [
      Math.round(base[0] * 0.15 + LAKE_COLOR[0] * 0.85),
      Math.round(base[1] * 0.15 + LAKE_COLOR[1] * 0.85),
      Math.round(base[2] * 0.15 + LAKE_COLOR[2] * 0.85),
    ];
  }
  if (riverFlow > 0) {
    const t = Math.max(0, Math.min(1, riverFlow)) * 0.75 + 0.15; // even a faint river stays visible
    return [
      Math.round(base[0] * (1 - t) + RIVER_COLOR[0] * t),
      Math.round(base[1] * (1 - t) + RIVER_COLOR[1] * t),
      Math.round(base[2] * (1 - t) + RIVER_COLOR[2] * t),
    ];
  }
  return base;
}

/** Same mapping as terrainColorRGB, formatted as a CSS rgb() string for canvas 2D fillStyle use. */
export function terrainColorCSS(terrainCode: number, vegetation: number): string {
  const [r, g, b] = terrainColorRGB(terrainCode, vegetation);
  return `rgb(${r}, ${g}, ${b})`;
}
