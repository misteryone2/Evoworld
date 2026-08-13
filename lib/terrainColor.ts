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

/** Same mapping as terrainColorRGB, formatted as a CSS rgb() string for canvas 2D fillStyle use. */
export function terrainColorCSS(terrainCode: number, vegetation: number): string {
  const [r, g, b] = terrainColorRGB(terrainCode, vegetation);
  return `rgb(${r}, ${g}, ${b})`;
}
