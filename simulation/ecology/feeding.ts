import type { Organism } from "../../types";
import { Planet } from "../planet/planet";

const MAX_ENERGY = 150;
const ENERGY_PER_VEGETATION = 40;

/**
 * Each organism attempts to feed on the vegetation of its current cell.
 * Vegetation is a shared, depleting resource: multiple organisms on the
 * same cell in the same tick compete for what is available.
 */
export function feedOrganisms(organisms: Organism[], planet: Planet): void {
  const byCell = new Map<number, Organism[]>();
  for (const o of organisms) {
    if (!o.alive) continue;
    const cx = Math.round(o.position.x) % planet.width;
    const cy = Math.round(o.position.y) % planet.height;
    const idx = planet.index(cx, cy);
    const list = byCell.get(idx);
    if (list) list.push(o);
    else byCell.set(idx, [o]);
  }

  for (const [idx, occupants] of byCell) {
    const cell = planet.cells[idx];
    if (cell.terrain === "ocean" || cell.vegetation <= 0) continue;

    const totalDemand = occupants.reduce((sum, o) => sum + o.genome.size, 0);
    const availableEnergy = cell.vegetation * ENERGY_PER_VEGETATION;

    for (const o of occupants) {
      const share = totalDemand > 0 ? o.genome.size / totalDemand : 0;
      const gained = Math.min(availableEnergy * share, ENERGY_PER_VEGETATION);
      o.energy = Math.min(MAX_ENERGY, o.energy + gained);
    }

    cell.vegetation = Math.max(0, cell.vegetation - Math.min(cell.vegetation, occupants.length * 0.05));
  }
}
