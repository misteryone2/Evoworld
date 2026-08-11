/**
 * Shared species -> color mapping (v0.4). Both PlanetCanvas (organisms on
 * the map) and SpeciesTree (genealogy UI) must render the same speciesId
 * with the same color, otherwise a user cannot visually connect "this
 * branch of the tree" with "these dots on the planet". Keeping the hue
 * table in one place is the only way to guarantee that.
 */

const SPECIES_HUES = [16, 195, 300, 48, 130, 260, 0, 170];

export function speciesHue(speciesId: number): number {
  return SPECIES_HUES[speciesId % SPECIES_HUES.length];
}

export function speciesColor(speciesId: number, lightness = 62): string {
  return `hsl(${speciesHue(speciesId)} 85% ${lightness}%)`;
}
