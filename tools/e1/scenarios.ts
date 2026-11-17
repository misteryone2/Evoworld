/** E1 — tabella dichiarativa degli esperimenti. Nessuna regola biologica viene modificata. */
import type { ScenarioSpec } from "./runner";

export interface ScenarioBuildOptions {
  ticks: number;
  sampleEvery: number;
  seeds: number[];
  longTicks?: number;
  /**
   * Aggiunge S13/S14 (controlli a risorse scambiate). Disattivato per impostazione
   * predefinita: le corse E1.0/E1.1 restano così riproducibili con 12 scenari.
   */
  habitatControls?: boolean;
}

export const SCENARIO_IDS = [
  "S01_stability_baseline",
  "S02_scarcity_dense",
  "S03_resource_rich_low_density",
  "S04_herbivore_monoculture",
  "S05_carnivore_stress",
  "S06_predator_prey_mixed",
  "S07_extinction_old_weak",
  "S08_recovery_after_cull80",
  "S09_poor_habitat",
  "S10_rich_habitat",
  "S11_neutral_gene_effects",
  "S12_long_horizon",
  "S13_poor_position_rich_resources",
  "S14_rich_position_poor_resources",
] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];

/** Costruisce tutte le combinazioni scenario × seed con durate esplicite. */
export function buildScenarios(o: ScenarioBuildOptions): ScenarioSpec[] {
  const out: ScenarioSpec[] = [];
  for (const seed of o.seeds) {
    const long = o.longTicks ?? o.ticks * 3;
    const add = (s: Omit<ScenarioSpec, "seed" | "sampleEvery" | "ticks"> & Partial<Pick<ScenarioSpec, "ticks">>) =>
      out.push({ ...s, seed, sampleEvery: o.sampleEvery, ticks: s.ticks ?? o.ticks });

    add({ id: "S01_stability_baseline", description: "Baseline: mondo 128x128, 150 fondatori, nessuna perturbazione", width: 128, height: 128, population: 150, setup: "baseline" });
    add({ id: "S02_scarcity_dense", description: "Scarsità: mondo piccolo 64x64 con 220 fondatori", width: 64, height: 64, population: 220, setup: "baseline" });
    add({ id: "S03_resource_rich_low_density", description: "Mondo grande 192x192 con 40 fondatori", width: 192, height: 192, population: 40, setup: "baseline" });
    add({ id: "S04_herbivore_monoculture", description: "Tutti i fondatori erbivori (carnivory=0.05)", width: 128, height: 128, population: 150, setup: "herbivore" });
    add({ id: "S05_carnivore_stress", description: "Tutti i fondatori carnivori (carnivory=0.6)", width: 128, height: 128, population: 150, setup: "carnivore" });
    add({ id: "S06_predator_prey_mixed", description: "Due gruppi iniziali: erbivori e carnivori (speciesId 1/2)", width: 160, height: 160, population: 180, setup: "mixed" });
    add({ id: "S07_extinction_old_weak", description: "Fondatori vecchi e quasi senza energia: verifica mortalita' e estinzione", width: 96, height: 96, population: 100, setup: "oldWeak", ticks: Math.min(o.ticks, 300) });
    add({ id: "S08_recovery_after_cull80", description: "Perturbazione: cull stratificato deterministico dell'80% a meta' corsa, poi recupero", width: 128, height: 128, population: 150, setup: "baseline", perturbation: { atTick: Math.floor(o.ticks / 2), kind: "cull80" } });
    add({ id: "S09_poor_habitat", description: "Fondatori nelle 24 celle meno vegetate della griglia campionata (non estremi globali)", width: 128, height: 128, population: 150, setup: "poorHabitat" });
    add({ id: "S10_rich_habitat", description: "Fondatori nelle 24 celle piu' vegetate della griglia campionata (non estremi globali)", width: 128, height: 128, population: 150, setup: "richHabitat" });
    add({ id: "S11_neutral_gene_effects", description: "Controllo: geni avanzati presenti ma senza effetto fenotipico", width: 128, height: 128, population: 150, setup: "baseline", options: { enableGeneEffects: false } });
    add({ id: "S12_long_horizon", description: "Orizzonte lungo per speciazione/deriva/genetica", width: 192, height: 192, population: 200, setup: "baseline", ticks: long });

    if (o.habitatControls) {
      add({ id: "S13_poor_position_rich_resources", description: "Controllo habitat: posizioni povere (come S09) ma vegetazione iniziale ricca (come S10)", width: 128, height: 128, population: 150, setup: "poorPositionRichResources" });
      add({ id: "S14_rich_position_poor_resources", description: "Controllo habitat: posizioni ricche (come S10) ma vegetazione iniziale povera (come S09)", width: 128, height: 128, population: 150, setup: "richPositionPoorResources" });
    }
  }
  return out;
}

/** Id della fase E1.2: scenari principali più i due controlli habitat scambiati. */
export const PHASE2_SCENARIO_IDS = [
  "S01_stability_baseline",
  "S06_predator_prey_mixed",
  "S08_recovery_after_cull80",
  "S09_poor_habitat",
  "S10_rich_habitat",
  "S13_poor_position_rich_resources",
  "S14_rich_position_poor_resources",
] as const;

/** Fase E1.2: >=10 seed sugli scenari principali, con controlli habitat. */
export function buildPhase2Scenarios(o: ScenarioBuildOptions): ScenarioSpec[] {
  return buildScenarios({ ...o, habitatControls: true }).filter((s) =>
    (PHASE2_SCENARIO_IDS as readonly string[]).includes(s.id),
  );
}
