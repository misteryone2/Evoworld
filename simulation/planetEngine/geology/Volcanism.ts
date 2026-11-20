/**
 * SIMULATION_HEURISTIC
 *
 * Deterministic volcanic events. Probability is bounded by interior activity;
 * events inject CO2 and add local elevation without using Math.random.
 */

import type { PlanetPhysicalConfig, PlanetState } from "../contracts";
import { hashSeed, random3D } from "../deterministic";
import { clamp } from "../units";

export const VOLCANIC_TIME_BUCKET_S = 86400;

export interface VolcanicEvent {
  active: boolean;
  co2Kg: number;
  elevationDeltaM: number;
}

export function volcanicEventAt(
  config: PlanetPhysicalConfig,
  state: PlanetState,
  x: number,
  y: number,
  timeS: number,
  deltaS: number,
): VolcanicEvent {
  const bucket = Math.floor(timeS / VOLCANIC_TIME_BUCKET_S);
  const probability = clamp(
    state.interior.volcanicActivity * 0.02 * (deltaS / VOLCANIC_TIME_BUCKET_S),
    0,
    1,
  );
  const stream = hashSeed(config.seed, "volcanism/events");
  const roll = random3D(stream, x, y, bucket);
  if (roll >= probability) return { active: false, co2Kg: 0, elevationDeltaM: 0 };

  const magnitude = random3D(stream, x + 7919, y + 104729, bucket);
  return {
    active: true,
    co2Kg: (5e8 + magnitude * 4e9) * clamp(deltaS / VOLCANIC_TIME_BUCKET_S, 0, 1),
    elevationDeltaM: (5 + magnitude * 45) * clamp(deltaS / VOLCANIC_TIME_BUCKET_S, 0, 1),
  };
}
