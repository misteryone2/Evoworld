/**
 * v1.11.0 — Espressione genetica: dal genoma al fenotipo (specifica di Vibe §4). Funzioni pure e deterministiche; il
 * fenotipo si calcola UNA volta per genoma (memoizzato sull'oggetto `ext`, che non cambia dopo la nascita).
 *
 * Un genoma senza `ext` esprime DEFAULT_PHENOTYPE, uguale al comportamento della v1.10. I valori predefiniti dei geni
 * (geneRegistry.ts) sono scelti perché anche un genoma con `ext` tutto-predefinito dia lo stesso fenotipo.
 *
 * COEFFICIENTI: quelli del catalogo di Vibe. Dove il catalogo lascia aperto (cap della corazza, ampiezza dei compromessi
 * del pelo, gruppo di decisioni di Mattia) i valori sono costanti nominate qui sotto, marcate PROVVISORIE.
 */
import type { Genome } from "../../types";
import { getGene } from "./genomeExt";
import { GENE_BY_KEY } from "./geneRegistry";

// ---- Costanti del catalogo (Vibe) ----
export const BURST_POWER_BONUS = 0.25; // LOC-02
export const BURST_ENERGY_COST = 6; // LOC-02, per tentativo
export const ARMOR_SPEED_PENALTY = 0.15; // MOR-02
export const STATURE_RADIUS = 0.15; // MOR-03 (ampiezza del raggio: scelta di questa implementazione)
export const STATURE_DEFENSE = 0.1; // MOR-03
export const STATURE_SPEED = 0.1; // MOR-03
export const ENDURANCE_MOVE_SAVING = 0.4; // LOC-01 (ampiezza: scelta di questa implementazione)
export const ACUITY_FEAR = 0.5; // PER-01
export const ACUITY_RADIUS = 0.25; // PER-01
export const OLFACTION_MEMORY = 0.6; // PER-02
export const FLOCK_BASE = 1.4; // PER-03: 1,4 − 0,8·t
export const FLOCK_SLOPE = 0.8;
export const RESERVE_CAP = 0.6; // FIS-01
export const DIGESTION_BASE = 0.75; // FIS-02: 0,75 + 0,5·d
export const DIGESTION_SLOPE = 0.5;
export const PEAK_RECOVERY = 0.4; // FIS-03, FIS-04
export const SEASONAL_DAMPING = 0.35; // ADA-01
export const ALTITUDE_GAIN = 0.3; // ADA-02
export const ALTITUDE_BASE = 0.85; // ADA-02: formula (0,85 + 0,3·a·quota) rinormalizzata a 1 per a = 0 (PROVVISORIA)
export const GRAZING_DEMAND_SAVING = 0.3; // ECO-01 (PROVVISORIA: quota o consumo)
export const DIET_COST_SAVING = 0.4; // ECO-02
export const OFFSPRING_BASE = 0.6; // REP-01: 0,6 + 0,9·p
export const OFFSPRING_SLOPE = 0.9;
export const MATURITY_BASE = 0.1; // REP-02: 0,1 × (1,6 − velocità)
export const MATURITY_OFFSET = 1.6;
export const MEMORY_BASE_TICKS = 300; // COG-01: 300 × (0,5 + 1,5·s)
export const BRAIN_STD_BASE = 0.3; // COG-02: 0,3 × (1,4 − 0,8·s)
// PROVVISORIE (non fissate dal catalogo):
export const FUR_COLD_Z = 0.3; // MOR-01: z ×(1 − 0,30·pelo) dal lato freddo
export const FUR_HEAT_Z = 0.2; // MOR-01: z ×(1 + 0,20·pelo) dal lato caldo
/** MOR-02: il catalogo dice "additivo puro ma cap totale" senza definire il cap. Tetto della parentesi (1,15 + evasion + corazza). */
export const DEFENSE_BRACKET_CAP = 2.2;

/** Costo di mantenimento per unità di scostamento dal predefinito, per gene (coefficienti del catalogo). Aggiunto al mantenimento come energia per tick. */
export const UPKEEP_COEFFICIENTS: Readonly<Record<string, number>> = {
  furDensity: 0.03, dermalArmor: 0.05, endurance: 0.02, peripheralAcuity: 0.015, olfactorySensitivity: 0.015,
  energyReserve: 0.04, digestiveEfficiency: 0.03, thermoregulation: 0.025, hydrationEfficiency: 0.02,
  seasonalRobustness: 0.02, altitudeAdaptation: 0.015, grazingEfficiency: 0.02, dietFlexibility: 0.02,
  memorySpan: 0.02, neuralStability: 0.01,
};

export interface Phenotype {
  /** Energia per tick aggiunta al mantenimento: Σ coefficiente × (valore − predefinito). Neutro = 0. */
  upkeepExtra: number;
  coldInsulation: number; // MOR-01 → environment.ts
  heatPenalty: number; // MOR-01 (lato caldo)
  defenseBonus: number; // MOR-02 → predation.ts (somma alla parentesi della difesa)
  defenseFactor: number; // MOR-03 → predation.ts (moltiplicatore)
  speedPenalty: number; // MOR-02/MOR-03 → movement.ts: passo ×(1 − speedPenalty)
  bodyRadiusFactor: number; // MOR-03 → collision.ts
  movementCostFactor: number; // LOC-01 → organism.ts (termine di velocità del mantenimento)
  burstPower: number; // LOC-02 → predation.ts
  fearGain: number; // PER-01
  threatRadiusFactor: number; // PER-01
  memoryGain: number; // PER-02
  flockGain: number; // PER-03
  energyCapFactor: number; // FIS-01
  digestionFactor: number; // FIS-02 → feeding.ts, predation.ts
  tempPeakRecovery: number; // FIS-03 → environment.ts
  waterPeakRecovery: number; // FIS-04 → environment.ts
  seasonalDamping: number; // ADA-01 → environment.ts
  altitudeFactor: number; // ADA-02 → environment.ts (pendenza per unità di quota)
  grazingDemandFactor: number; // ECO-01 → feeding.ts
  carnivoryCostFactor: number; // ECO-02 → organism.ts
  offspringEnergyFactor: number; // REP-01 → reproduction.ts
  maturityFraction: number; // REP-02 → reproduction.ts
  memoryDecayTicks: number; // COG-01 → behavior.ts
  brainMutationStd: number; // COG-02 → brain.ts
}

export const DEFAULT_PHENOTYPE: Readonly<Phenotype> = Object.freeze({
  upkeepExtra: 0,
  coldInsulation: 0,
  heatPenalty: 0,
  defenseBonus: 0,
  defenseFactor: 1,
  speedPenalty: 0,
  bodyRadiusFactor: 1,
  movementCostFactor: 1,
  burstPower: 0,
  fearGain: 1,
  threatRadiusFactor: 1,
  memoryGain: 1,
  flockGain: 1,
  energyCapFactor: 1,
  digestionFactor: 1,
  tempPeakRecovery: 0,
  waterPeakRecovery: 0,
  seasonalDamping: 0,
  altitudeFactor: 0,
  grazingDemandFactor: 1,
  carnivoryCostFactor: 1,
  offspringEnergyFactor: 1,
  maturityFraction: 0.1,
  memoryDecayTicks: MEMORY_BASE_TICKS,
  brainMutationStd: BRAIN_STD_BASE,
});

export function expressGenome(g: Genome): Phenotype {
  const v = (key: string) => getGene(g, key);
  const stature = 2 * (v("bodyStature") - 0.5); // −1 (esile) … +1 (robusto), 0 al predefinito
  const armor = v("dermalArmor");
  let upkeepExtra = 0;
  for (const [key, coef] of Object.entries(UPKEEP_COEFFICIENTS)) upkeepExtra += coef * (v(key) - GENE_BY_KEY.get(key)!.defaultValue);
  return {
    upkeepExtra,
    coldInsulation: v("furDensity"),
    heatPenalty: v("furDensity"),
    defenseBonus: armor,
    defenseFactor: 1 + STATURE_DEFENSE * stature,
    speedPenalty: 1 - (1 - ARMOR_SPEED_PENALTY * armor) * (1 - STATURE_SPEED * stature),
    bodyRadiusFactor: 1 + STATURE_RADIUS * stature,
    movementCostFactor: 1 - ENDURANCE_MOVE_SAVING * v("endurance"),
    burstPower: v("burstPower"),
    fearGain: 1 + ACUITY_FEAR * v("peripheralAcuity"),
    threatRadiusFactor: 1 + ACUITY_RADIUS * v("peripheralAcuity"),
    memoryGain: 1 + OLFACTION_MEMORY * v("olfactorySensitivity"),
    flockGain: FLOCK_BASE - FLOCK_SLOPE * v("socialTolerance"),
    energyCapFactor: 1 + RESERVE_CAP * v("energyReserve"),
    digestionFactor: DIGESTION_BASE + DIGESTION_SLOPE * v("digestiveEfficiency"),
    tempPeakRecovery: PEAK_RECOVERY * v("thermoregulation"),
    waterPeakRecovery: PEAK_RECOVERY * v("hydrationEfficiency"),
    seasonalDamping: SEASONAL_DAMPING * v("seasonalRobustness"),
    altitudeFactor: (ALTITUDE_GAIN * v("altitudeAdaptation")) / ALTITUDE_BASE,
    grazingDemandFactor: 1 - GRAZING_DEMAND_SAVING * v("grazingEfficiency"),
    carnivoryCostFactor: 1 - DIET_COST_SAVING * v("dietFlexibility"),
    offspringEnergyFactor: OFFSPRING_BASE + OFFSPRING_SLOPE * v("parentalInvestment"),
    maturityFraction: MATURITY_BASE * (MATURITY_OFFSET - v("maturityRate")),
    memoryDecayTicks: MEMORY_BASE_TICKS * (0.5 + 1.5 * v("memorySpan")),
    brainMutationStd: BRAIN_STD_BASE * (1.4 - 0.8 * v("neuralStability")),
  };
}

const cache = new WeakMap<object, Readonly<Phenotype>>();
const inertExt = new WeakSet<object>();

/**
 * Solo per esperimenti di controllo: i geni di questo `ext` esistono, ereditano e mutano ma NON hanno effetto (fenotipo
 * predefinito). Serve a separare la selezione dalla semplice deriva nelle analisi evolutive (criterio 4 di Vibe).
 */
export function markExtInert(ext: object | undefined): void {
  if (ext) inertExt.add(ext);
}

/** Fenotipo di un genoma, in cache sull'oggetto `ext` (immutabile dopo la nascita). Senza `ext`: DEFAULT_PHENOTYPE. */
export function phenotypeOf(g: Genome): Readonly<Phenotype> {
  const ext = g.ext;
  if (!ext || inertExt.has(ext)) return DEFAULT_PHENOTYPE;
  let p = cache.get(ext);
  if (!p) {
    p = Object.freeze(expressGenome(g));
    cache.set(ext, p);
  }
  return p;
}
