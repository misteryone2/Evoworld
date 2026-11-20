/**
 * APPROXIMATION / CONTRACT
 *
 * Gas inventory helpers. Molar fractions are the canonical representation;
 * pressure and mass are derived from the inventory instead of stored twice.
 */

import type { GasKey, PlanetState } from "../contracts";

export const GAS_KEYS: readonly GasKey[] = ["N2", "O2", "CO2", "H2O", "CH4", "Ar", "other"];

/** kg/mol; `other` is an inert N2-like filler. */
export const MOLAR_MASS_KG_PER_MOL: Record<GasKey, number> = {
  N2: 0.0280134,
  O2: 0.0319988,
  CO2: 0.0440095,
  H2O: 0.0180153,
  CH4: 0.0160425,
  Ar: 0.039948,
  other: 0.0280134,
};

export function normalizeGasFractions(input: Partial<Record<GasKey, number>>): Record<GasKey, number> {
  const result = Object.fromEntries(GAS_KEYS.map((key) => [key, 0])) as Record<GasKey, number>;
  let sum = 0;
  for (const key of GAS_KEYS) {
    const value = Math.max(0, input[key] ?? 0);
    result[key] = value;
    sum += value;
  }
  if (sum <= 0) return result;
  for (const key of GAS_KEYS) result[key] /= sum;
  return result;
}

export function meanMolarMassKgPerMol(composition: Record<GasKey, number>): number {
  let sum = 0;
  for (const key of GAS_KEYS) sum += composition[key] * MOLAR_MASS_KG_PER_MOL[key];
  return sum > 0 ? sum : MOLAR_MASS_KG_PER_MOL.other;
}

export function co2Ppm(composition: Record<GasKey, number>): number {
  return composition.CO2 * 1e6;
}

/** Transfer mass from the reservoir into one gas while conserving total mass. */
export function addGasMassKg(
  composition: Record<GasKey, number>,
  totalMassKg: number,
  gas: GasKey,
  addedMassKg: number,
): { composition: Record<GasKey, number>; totalMassKg: number } {
  if (!(addedMassKg > 0) || !(totalMassKg > 0)) return { composition: { ...composition }, totalMassKg };
  const newMass = totalMassKg + addedMassKg;
  const scale = totalMassKg / newMass;
  const next = { ...composition };
  for (const key of GAS_KEYS) next[key] *= scale;
  next[gas] += addedMassKg / newMass;
  return { composition: normalizeGasFractions(next), totalMassKg: newMass };
}

export function compositionFromState(state: PlanetState): Record<GasKey, number> {
  return normalizeGasFractions(state.atmosphere.composition);
}
