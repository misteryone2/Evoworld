/**
 * PHYSICAL_MODEL / CONTRACT
 *
 * Canonical atmosphere inventory. Molar fractions and total mass are the
 * state; partial pressures are derived. Water vapour mass is owned by
 * `state.hydrosphere.vaporMassKg` and mirrored into `composition.H2O` through
 * an explicit mole-conserving transfer. No climate code reads an unsynced H2O
 * fraction.
 */

import type { GasKey, PlanetState } from "../contracts";
import { PlanetInvariantError } from "../core/invariants";

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
    const value = input[key] ?? 0;
    if (!Number.isFinite(value) || value < 0) {
      throw new PlanetInvariantError(`atmosphere composition.${key} must be finite and non-negative`);
    }
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

/** Non-water molar fractions renormalized to 1; dry air mass stays constant. */
export function dryComposition(composition: Record<GasKey, number>): Record<GasKey, number> {
  const dry = { ...composition, H2O: 0 };
  let sum = 0;
  for (const key of GAS_KEYS) if (key !== "H2O") sum += dry[key];
  if (!(sum > 0)) return { ...dry, N2: 1 };
  for (const key of GAS_KEYS) if (key !== "H2O") dry[key] /= sum;
  return dry;
}

export function co2Ppm(composition: Record<GasKey, number>): number {
  return composition.CO2 * 1e6;
}

/** Water mass implied by the current molar fraction and total atmosphere mass. */
export function waterMassKgFromState(state: PlanetState): number {
  const mean = meanMolarMassKgPerMol(state.atmosphere.composition);
  const massFraction = state.atmosphere.composition.H2O * MOLAR_MASS_KG_PER_MOL.H2O / mean;
  return state.atmosphere.totalMassKg * massFraction;
}

export function dryAirMassKgFromState(state: PlanetState): number {
  return Math.max(0, state.atmosphere.totalMassKg - waterMassKgFromState(state));
}

function assertMassKg(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new PlanetInvariantError(`${label} must be finite and non-negative`);
  }
}

/**
 * Set the atmospheric water mass from the hydrosphere reservoir. Dry-air moles
 * are conserved; only total mass and molar fractions are recomputed.
 */
export function setAtmosphericWaterMassKg(state: PlanetState, vaporMassKg: number): void {
  assertMassKg(vaporMassKg, "vaporMassKg");
  const dryMassKg = dryAirMassKgFromState(state);
  const dry = dryComposition(state.atmosphere.composition);
  const dryMeanMolarMass = meanMolarMassKgPerMol({ ...dry, H2O: 1e-12 });
  const dryMoles = dryMassKg / dryMeanMolarMass;
  const waterMoles = vaporMassKg / MOLAR_MASS_KG_PER_MOL.H2O;
  const totalMoles = dryMoles + waterMoles;
  const next = Object.fromEntries(GAS_KEYS.map((key) => [key, 0])) as Record<GasKey, number>;

  if (totalMoles > 0) {
    for (const key of GAS_KEYS) {
      next[key] = key === "H2O"
        ? waterMoles / totalMoles
        : (dryMoles * dry[key]) / totalMoles;
    }
  } else {
    next.N2 = 1;
  }

  state.atmosphere.composition = next;
  state.atmosphere.totalMassKg = dryMassKg + vaporMassKg;
}

/** Add a gas mass while conserving every pre-existing species' mole count. */
export function injectGasMassKg(state: PlanetState, gas: GasKey, addedMassKg: number): void {
  assertMassKg(addedMassKg, "added gas mass");
  if (!(addedMassKg > 0)) return;

  const mean = meanMolarMassKgPerMol(state.atmosphere.composition);
  const totalMoles = state.atmosphere.totalMassKg / mean;
  const addedMoles = addedMassKg / MOLAR_MASS_KG_PER_MOL[gas];
  const nextTotalMoles = totalMoles + addedMoles;
  const composition = Object.fromEntries(GAS_KEYS.map((key) => [key, 0])) as Record<GasKey, number>;
  for (const key of GAS_KEYS) {
    const moles = state.atmosphere.composition[key] * totalMoles + (key === gas ? addedMoles : 0);
    composition[key] = moles / nextTotalMoles;
  }
  state.atmosphere.composition = composition;
  state.atmosphere.totalMassKg += addedMassKg;
}

/**
 * Backward-compatible pure helper. Prefer `injectGasMassKg` for state updates.
 */
export function addGasMassKg(
  composition: Record<GasKey, number>,
  totalMassKg: number,
  gas: GasKey,
  addedMassKg: number,
): { composition: Record<GasKey, number>; totalMassKg: number } {
  const snapshot: PlanetState = {
    tick: 0,
    timeS: 0,
    orbitalMeanAnomalyRad: 0,
    rotationPhaseRad: 0,
    obliquityRad: 0,
    interior: { heatJ: 0, volcanicActivity: 0, tectonicStress: 0 },
    atmosphere: { totalMassKg, composition: { ...composition }, opticalDepth: 0 },
    hydrosphere: { oceanMassKg: 0, iceMassKg: 0, vaporMassKg: 0, soilWaterKg: 0, seaLevelM: 0 },
    surface: { meanElevationM: 0, sedimentMassKg: 0 },
    climate: { globalMeanTemperatureK: 288, co2Ppm: 0, albedo: 0 },
    scheduler: {
      lastClimateTick: 0, lastHydrologyTick: 0, lastGeologyTick: 0,
      pendingClimateS: 0, pendingHydrologyS: 0, pendingGeologyS: 0,
    },
  };
  injectGasMassKg(snapshot, gas, addedMassKg);
  return { composition: snapshot.atmosphere.composition, totalMassKg: snapshot.atmosphere.totalMassKg };
}

export function compositionFromState(state: PlanetState): Record<GasKey, number> {
  return normalizeGasFractions(state.atmosphere.composition);
}
