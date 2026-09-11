import type { Cell, Organism } from "../../types";
import { Planet } from "../planet/planet";
import { environmentalFitness } from "../biology/environment";
import type { RegionEstablishment } from "./regionEcology";

const MAX_ENERGY = 150;
const ENERGY_PER_VEGETATION = 40;

/**
 * v1.2 — size (in cells) of the region used for the sustainable-yield
 * carrying capacity below. Deliberately coarser than a single cell: an
 * organism's real "home range" over the course of its life spans many
 * cells, not just the one it happens to be standing on this exact tick.
 */
export const FEEDING_REGION_SIZE = 8;

/**
 * v1.2 — fraction of the theoretical maximum regrowth that can be
 * harvested indefinitely without depleting a region over time (a
 * standard ecological principle: sustainable-yield harvesting is always
 * some fraction below the raw maximum growth rate, since the resource
 * also needs slack to recover from natural fluctuation — not an
 * arbitrary population-limiting knob).
 */
const SUSTAINABLE_HARVEST_FRACTION = 0.2;
const SUSTAINABLE_YIELD_PER_CELL = 0.005 * 0.975 * ENERGY_PER_VEGETATION * SUSTAINABLE_HARVEST_FRACTION;

/**
 * v1.2 — EXPERIMENTAL, under evaluation (see HANDOFF for the three-way
 * comparison this was built to run). A freshly colonized region only
 * provides this fraction of full feeding efficiency, regardless of how
 * abundant its standing vegetation is — modeling the real lag between
 * "a population reaches a place" and "a population is actually thriving
 * there" (see simulation/ecology/regionEcology.ts's doc comment for the
 * full rationale). Efficiency ramps linearly from this floor up to 1.0 as
 * the region's RegionEstablishment level grows.
 */
const SETTLEMENT_EFFICIENCY_FLOOR = 0.25;

export function regionKey(x: number, y: number): string {
  return `${Math.floor(x / FEEDING_REGION_SIZE)},${Math.floor(y / FEEDING_REGION_SIZE)}`;
}

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
 *
 * v1.2 — regional carrying capacity: on a large world, an organism whose
 * exact cell happens to be crowded can simply move one cell over to a
 * still-untouched patch and keep feeding at full efficiency indefinitely —
 * with world size no longer a practical constraint (v1.1), this let
 * population growth outrun any real resource limit, since genuine local
 * scarcity never had time to develop before organisms had already moved
 * on. To close that gap without introducing an artificial population cap,
 * feeding is throttled by a *regional* sustainable-yield ceiling: within
 * each FEEDING_REGION_SIZE neighborhood, no organism can draw more energy
 * per tick, in total, than its fair share of what that neighborhood's
 * land can actually go on regenerating indefinitely (see
 * SUSTAINABLE_YIELD_PER_CELL) — not what happens to be standing on it
 * right now. Fleeing to a fresh cell a few steps away no longer helps if
 * the surrounding neighborhood as a whole is already over-subscribed —
 * real migration to a genuinely different, less crowded region still
 * works exactly as intended, since that region has its own, initially
 * unconstrained, sustainable budget.
 *
 * v1.2.1 — SUSTAINABLE_YIELD_PER_CELL is now the actual per-tick gain
 * ceiling (an organism's proportional share of it), not a secondary
 * multiplier applied on top of a much larger standing-stock-derived
 * number. Standing vegetation stock can be up to ~1000x larger than the
 * sustainable regrowth rate, so measuring it as an additional supply
 * ceiling (the earlier v1.2 approach) rarely bound anything in practice.
 * Vegetation itself is unchanged as a physical resource: still consumed
 * per depletion below, still regrows via simulation/planet/planet.ts's
 * formula — only the ENERGY EXTRACTION ceiling per tick is now tied to
 * the sustainable rate instead of the instantaneous stock.
 */
export function feedOrganisms(organisms: Organism[], planet: Planet, regionEstablishment?: RegionEstablishment): void {
  // Group living organisms by the cell they currently occupy. v1.1 — the
  // cell itself (not just an index) is captured alongside its occupants:
  // with terrain now lazily chunked (see simulation/planet/planet.ts),
  // there is no dense planet.cells array to index into afterward, so the
  // live Cell reference (via planet.getCell, which materializes/caches
  // the owning chunk) is looked up once here and reused for every
  // occupant of that cell.
  const byCell = new Map<number, { cell: Cell; x: number; y: number; occupants: Organism[] }>();
  for (const o of organisms) {
    if (!o.alive) continue;
    const cx = Math.round(o.position.x) % planet.width;
    const cy = Math.round(o.position.y) % planet.height;
    const idx = planet.index(cx, cy);
    const entry = byCell.get(idx);
    if (entry) entry.occupants.push(o);
    else byCell.set(idx, { cell: planet.getCell(cx, cy), x: cx, y: cy, occupants: [o] });
  }

  // v1.2 — regional supply/demand. Demand is the combined herbivorous
  // appetite of every organism drawing on a neighborhood (from the cells
  // they're already standing on — no extra cost). Supply, however, must
  // reflect what the *whole* region can actually produce, not just the
  // handful of cells currently occupied — occupied-cells-only supply
  // would grow right alongside demand as organisms spread onto fresh
  // cells to avoid competition, defeating the whole point. Each distinct
  // occupied region is scanned once (bounded by how many regions the
  // population actually touches, not by world size — same reasoning as
  // v1.1's chunk activation) to sum its cells' live vegetation, which is
  // what makes this a real, resource-based, self-correcting throttle:
  // as a region gets grazed down over time, its measured supply drops
  // right along with it, and recovers as vegetation regrows.
  const regionDemand = new Map<string, number>();
  for (const { cell, x, y, occupants } of byCell.values()) {
    if (cell.terrain === "ocean") continue;
    const key = regionKey(x, y);
    const demand = occupants.reduce((sum, o) => sum + o.genome.size * (1 - o.genome.carnivory), 0);
    regionDemand.set(key, (regionDemand.get(key) ?? 0) + demand);
  }

  const regionLandCells = new Map<string, { x: number; y: number }[]>();
  for (const key of regionDemand.keys()) {
    const [rx, ry] = key.split(",").map(Number);
    const x0 = rx * FEEDING_REGION_SIZE;
    const y0 = ry * FEEDING_REGION_SIZE;
    const land: { x: number; y: number }[] = [];
    for (let dy = 0; dy < FEEDING_REGION_SIZE; dy++) {
      for (let dx = 0; dx < FEEDING_REGION_SIZE; dx++) {
        const cx = (x0 + dx) % planet.width;
        const cy = (y0 + dy) % planet.height;
        const regionCell = planet.getCell(cx, cy);
        if (regionCell.terrain !== "ocean") land.push({ x: cx, y: cy });
      }
    }
    regionLandCells.set(key, land);
  }

  for (const { cell, x, y, occupants } of byCell.values()) {
    if (cell.terrain === "ocean" || cell.vegetation <= 0) continue;

    const key = regionKey(x, y);
    const demand = regionDemand.get(key) ?? 0;
    const landCellCount = regionLandCells.get(key)?.length ?? 0;
    // v1.2.1 — SUSTAINABLE_YIELD_PER_CELL is now the actual ceiling on
    // sustainable extraction, not a secondary multiplier layered on top
    // of the (much larger) standing-stock number. A region's total
    // "sustainable budget" is its land-cell count times that per-cell
    // rate — a hard, resource-derived limit on how much energy the whole
    // region can indefinitely provide per tick, independent of how much
    // vegetation happens to be currently standing.
    const regionSustainableBudget = landCellCount * SUSTAINABLE_YIELD_PER_CELL;

    // v1.2 — settlement efficiency: independent of resource scarcity, a
    // young region simply isn't yet as productive to live in as a mature
    // one (see SETTLEMENT_EFFICIENCY_FLOOR's doc comment). 1.0 (no
    // penalty) when this mechanism is disabled or the region is already
    // fully established.
    const establishment = regionEstablishment?.get(key) ?? 1;
    const settlementEfficiency = SETTLEMENT_EFFICIENCY_FLOOR + (1 - SETTLEMENT_EFFICIENCY_FLOOR) * establishment;

    // Larger, more herbivorous organisms need (and take) proportionally
    // more from a shared patch. Weighting demand by (1 - carnivory) means a
    // pure carnivore standing on a cell doesn't compete for or deplete its
    // vegetation at all — consistent with getting no energy from it above.
    const totalDemand = occupants.reduce((sum, o) => sum + o.genome.size * (1 - o.genome.carnivory), 0);
    const availableEnergy = cell.vegetation * ENERGY_PER_VEGETATION;

    for (const o of occupants) {
      const demandShare = o.genome.size * (1 - o.genome.carnivory);

      // What this organism's own cell could physically provide it this
      // tick, given the vegetation actually standing there right now
      // (still a real, depleting, regrowing physical stock).
      const cellShare = totalDemand > 0 ? demandShare / totalDemand : 0;
      const rawCellGain = Math.min(availableEnergy * cellShare, ENERGY_PER_VEGETATION) * (1 - o.genome.carnivory);

      // v1.2.1 — this organism's fair proportional share of what the
      // *whole region* can sustainably regenerate per tick. Taking the
      // smaller of the two is what makes the sustainable rate the true
      // limiting factor: an organism can never draw more, over time,
      // than its share of what the land can actually keep producing —
      // regardless of how much standing vegetation happens to be
      // available on its exact cell at this exact moment.
      const regionShare = demand > 0 ? demandShare / demand : 0;
      const sustainableShare = regionSustainableBudget * regionShare;

      const rawGained = Math.min(rawCellGain, sustainableShare);
      const gained = rawGained * environmentalFitness(o.genome, cell) * settlementEfficiency;
      o.energy = Math.min(MAX_ENERGY, o.energy + gained);
    }
  }

  // v1.2 — grazing pressure is spread across the whole region's land
  // cells rather than only the exact cell each organism happened to
  // stand on this tick. A real animal's foraging wears down its whole
  // home range over time, not one isolated tile — and mechanically, this
  // is what makes moving to a technically-untouched neighboring cell not
  // a free escape from the consequences of local population density: the
  // region's *collective* vegetation genuinely declines in proportion to
  // how much total demand it is sustaining, which feeds into the depleted
  // standing stock available to each cell's occupants on subsequent ticks.
  for (const [key, demand] of regionDemand) {
    if (demand <= 0) continue;
    const land = regionLandCells.get(key);
    if (!land || land.length === 0) continue;
    const depletionPerCell = (demand * 0.05) / land.length;
    for (const { x: lx, y: ly } of land) {
      const landCell = planet.getCell(lx, ly);
      landCell.vegetation = Math.max(0, landCell.vegetation - Math.min(landCell.vegetation, depletionPerCell));
    }
  }

  // v1.2 — advance settlement: every region with any demand this tick
  // counts as "occupied" for establishment purposes; everything else
  // (previously tracked but empty now) decays — see RegionEstablishment.
  regionEstablishment?.update(regionDemand.keys());
}
