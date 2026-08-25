import type { Cell, Organism } from "../../types";
import { Planet } from "../planet/planet";
import { environmentalFitness } from "../biology/environment";

const MAX_ENERGY = 150;
const ENERGY_PER_VEGETATION = 40;

/**
 * Each organism attempts to feed on the vegetation of its current cell.
 * Vegetation is a shared, depleting resource: multiple organisms on the
 * same cell in the same tick compete for what is available, so crowding a
 * good cell has a real cost. This is where "competition for food" emerges
 * from the system rather than being hand-scripted per trait.
 *
 * v0.3.2: how efficiently an organism converts its share into energy is
 * also scaled by its environmental fitness in that cell (temperature/water
 * niche match — see environment.ts). Two organisms competing for the same
 * patch can come away with very different amounts of energy depending on
 * how well their genome fits the local climate, which is what creates real
 * selective pressure toward niche specialization or, alternatively, toward
 * broad tolerance at the cost of never excelling anywhere.
 */
export function feedOrganisms(organisms: Organism[], planet: Planet): void {
  // Group living organisms by the cell they currently occupy. v1.1 — the
  // cell itself (not just an index) is captured alongside its occupants:
  // with terrain now lazily chunked (see simulation/planet/planet.ts),
  // there is no dense planet.cells array to index into afterward, so the
  // live Cell reference (via planet.getCell, which materializes/caches
  // the owning chunk) is looked up once here and reused for every
  // occupant of that cell.
  const byCell = new Map<number, { cell: Cell; occupants: Organism[] }>();
  for (const o of organisms) {
    if (!o.alive) continue;
    const cx = Math.round(o.position.x) % planet.width;
    const cy = Math.round(o.position.y) % planet.height;
    const idx = planet.index(cx, cy);
    const entry = byCell.get(idx);
    if (entry) entry.occupants.push(o);
    else byCell.set(idx, { cell: planet.getCell(cx, cy), occupants: [o] });
  }

  for (const { cell, occupants } of byCell.values()) {
    if (cell.terrain === "ocean" || cell.vegetation <= 0) continue;

    // Larger, more herbivorous organisms need (and take) proportionally
    // more from a shared patch. Weighting demand by (1 - carnivory) means a
    // pure carnivore standing on a cell doesn't compete for or deplete its
    // vegetation at all — consistent with getting no energy from it above.
    const totalDemand = occupants.reduce((sum, o) => sum + o.genome.size * (1 - o.genome.carnivory), 0);
    const availableEnergy = cell.vegetation * ENERGY_PER_VEGETATION;

    for (const o of occupants) {
      const demand = o.genome.size * (1 - o.genome.carnivory);
      const share = totalDemand > 0 ? demand / totalDemand : 0;
      const rawGained = Math.min(availableEnergy * share, ENERGY_PER_VEGETATION) * (1 - o.genome.carnivory);
      const gained = rawGained * environmentalFitness(o.genome, cell);
      o.energy = Math.min(MAX_ENERGY, o.energy + gained);
    }

    const herbivoreWeight = occupants.reduce((sum, o) => sum + (1 - o.genome.carnivory), 0);
    cell.vegetation = Math.max(0, cell.vegetation - Math.min(cell.vegetation, herbivoreWeight * 0.05));
  }
}
