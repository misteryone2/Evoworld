/**
 * SIMULATION_HEURISTIC with physical constraints
 *
 * Precipitation is tied to available atmospheric vapor (proxy: evaporation)
 * and uplift/humidity. It is not an independent random field.
 */

import { clamp } from "../units";

export interface PrecipitationInput {
  evaporationMPerYear: number;
  humidity: number;
  upliftFactor: number;
}

export function precipitationMPerYear(input: PrecipitationInput): number {
  const recycling = 0.4 + 2 * clamp(input.humidity, 0, 1);
  const uplift = clamp(input.upliftFactor, 0, 2);
  return clamp(Math.max(0, input.evaporationMPerYear) * recycling + uplift * 0.15, 0, 20);
}
