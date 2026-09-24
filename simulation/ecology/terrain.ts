import type { Vector2 } from "../../types";
import type { Planet } from "../planet/planet";

/**
 * v1.2.5 — Movement on Real Terrain.
 *
 * Result of evaluating a single movement candidate against the planet's
 * topography. Kept deliberately separate from organism decision-making
 * (movement.ts): this module only answers "what does the terrain think of
 * this destination", never "should the organism go there" — that remains
 * entirely the brain's call (see movement.ts).
 */
export interface TerrainMovementResult {
  /** False only for genuinely extreme slopes — see EXTREME_SLOPE_THRESHOLD. */
  traversable: boolean;
  /** Local slope estimate at the destination, >= 0. See computeLocalSlope. */
  slope: number;
  /** targetElevation - currentElevation. Positive = uphill, negative = downhill. */
  elevationDelta: number;
  /**
   * Multiplier applied to the organism's intended step distance this tick.
   * 1.0 on flat ground; > 1.0 the harder the terrain is to cross. Never
   * < 1.0 — v1.2.5 does not make downhill travel faster than flat, only
   * cheaper than the equivalent uphill (see §6 of the v1.2.5 brief).
   */
  movementCost: number;
}

/** Flat-ground movement cost — matches the pre-v1.2.5 implicit cost of 1 (uncosted movement). */
const BASE_MOVEMENT_COST = 1.0;

/**
 * How strongly an uphill slope inflates movement cost. Calibrated against
 * this engine's actual elevation field (see v1.2.5 IMPLEMENTATION REPORT
 * §3 for the sampling that produced these numbers): adjacent-cell deltas
 * average ~0.005 and rarely exceed ~0.03, while deltas over a full
 * multi-cell step (the distance actually crossed in one tick at typical
 * speed) average ~0.013 and only occasionally reach ~0.1-0.14 near ridges.
 * At UPHILL_SLOPE_COEFFICIENT = 8, a typical uphill step (slope ~0.013)
 * costs ~1.1x; a steep ridge-adjacent step (slope ~0.1) costs ~1.8x.
 */
const UPHILL_SLOPE_COEFFICIENT = 8;

/**
 * Downhill is cheaper than the equivalent uphill but never a bonus over
 * flat ground (§6: "NON rendere automaticamente la discesa sempre
 * vantaggiosa") — it still costs a little more than flat, reflecting that
 * descending rough terrain isn't free, just cheaper than climbing it.
 */
const DOWNHILL_SLOPE_COEFFICIENT = 2;

/**
 * Above this slope, terrain is considered a genuine wall rather than "very
 * costly" — movement is blocked outright. Set well above what a normal
 * multi-cell step across ordinary terrain produces (see the coefficient
 * comment above), so only real ridge-edge/cliff cases trigger it; the
 * planet must stay biologically explorable (§7 of the brief).
 */
const EXTREME_SLOPE_THRESHOLD = 0.22;

/**
 * Local elevation gradient at (x, y): the average absolute elevation
 * difference between the cell and its four immediate neighbors. A single
 * current->target delta can under-represent how rugged a destination
 * actually is (e.g. sitting right at the lip of a ridge); this gives a
 * cheap, still-O(1) local roughness estimate without any wider scan.
 * Uses Planet.getCell, so it is automatically toroidal-wrapped and
 * lazy-chunk-safe like every other terrain read in the engine.
 */
function computeLocalGradient(planet: Planet, x: number, y: number, centerElevation: number): number {
  const xi = Math.round(x);
  const yi = Math.round(y);
  const east = planet.getCell(xi + 1, yi).elevation;
  const west = planet.getCell(xi - 1, yi).elevation;
  const north = planet.getCell(xi, yi + 1).elevation;
  const south = planet.getCell(xi, yi - 1).elevation;
  return (
    (Math.abs(east - centerElevation) +
      Math.abs(west - centerElevation) +
      Math.abs(north - centerElevation) +
      Math.abs(south - centerElevation)) /
    4
  );
}

/**
 * Evaluates one movement candidate: the elevation change and local
 * roughness between `currentPosition` and `targetPosition`, and the
 * resulting movement cost/traversability. Pure function of planet state —
 * no randomness, no organism state — so it is deterministic and O(1) per
 * call (one target-cell read, four neighbor reads, all through the
 * planet's existing chunked/lazy getCell). Never does any pathfinding or
 * wider scan; see movement.ts for how this plugs into the single
 * brain-chosen candidate direction.
 */
export function evaluateTerrainMovement(
  currentPosition: Vector2,
  targetPosition: Vector2,
  planet: Planet,
): TerrainMovementResult {
  const currentElevation = planet.getCell(Math.round(currentPosition.x), Math.round(currentPosition.y)).elevation;
  const targetElevation = planet.getCell(Math.round(targetPosition.x), Math.round(targetPosition.y)).elevation;

  const elevationDelta = targetElevation - currentElevation;
  const localGradient = computeLocalGradient(planet, targetPosition.x, targetPosition.y, targetElevation);

  // Blend the directional delta (where the step actually goes) with the
  // local gradient (how rugged the destination itself is) — see the
  // doc comment on computeLocalGradient for why a single delta isn't
  // always enough.
  const slope = Math.abs(elevationDelta) * 0.7 + localGradient * 0.3;

  const slopeMultiplier = 1 + slope * (elevationDelta > 0 ? UPHILL_SLOPE_COEFFICIENT : DOWNHILL_SLOPE_COEFFICIENT);
  const movementCost = BASE_MOVEMENT_COST * slopeMultiplier;
  const traversable = slope <= EXTREME_SLOPE_THRESHOLD;

  return { traversable, slope, elevationDelta, movementCost };
}
