/**
 * PHYSICAL_MODEL
 *
 * Stellar flux at a distance. The spectral-class table is an APPROXIMATION and
 * exists only for reporting; it does not feed back into the energy budget.
 */

const SPECTRAL_CLASSES = [
  { maxK: 3700, name: "M" },
  { maxK: 5200, name: "K" },
  { maxK: 6000, name: "G" },
  { maxK: 7500, name: "F" },
  { maxK: 10000, name: "A" },
  { maxK: 30000, name: "B" },
  { maxK: Infinity, name: "O" },
] as const;

/** L / (4π d²), W/m². */
export function stellarFluxWm2(luminosityW: number, distanceM: number): number {
  if (!(luminosityW > 0) || !(distanceM > 0)) {
    throw new RangeError("Stellar flux requires positive luminosity and distance");
  }
  return luminosityW / (4 * Math.PI * distanceM * distanceM);
}

/** APPROXIMATION: broad MIT classification by effective temperature. */
export function spectralClassFromTemperatureK(temperatureK: number): string {
  if (!Number.isFinite(temperatureK) || temperatureK <= 0) return "unknown";
  return SPECTRAL_CLASSES.find((entry) => temperatureK < entry.maxK)?.name ?? "O";
}
