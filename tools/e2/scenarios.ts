/**
 * E2 — selezione degli scenari.
 *
 * Non definiamo nuove regole biologiche: gli scenari E2.0/E2.1 riutilizzano
 * la tabella E1, che e' gia' deterministica e documentata. Le fasi successive
 * potranno aggiungere scenari E2 dedicati senza toccare E1.
 */
import { buildScenarios, type ScenarioBuildOptions } from "../e1/scenarios";
import type { ScenarioSpec } from "../e1/runner";

/** Scenari E1 riutilizzati nel pilota E2.1. */
export const E2_PILOT_SCENARIO_IDS = [
  "S01_stability_baseline",
  "S02_scarcity_dense",
  "S06_predator_prey_mixed",
  "S08_recovery_after_cull80",
] as const;

export interface E2PilotOptions {
  seeds: number[];
  ticks: number;
  sampleEvery: number;
}

export interface E2ScenarioRationale {
  e1Id: string;
  role: string;
  question: string;
  phase: "E2-A" | "E2-B" | "E2-E";
}

/** Perche' ogni scenario e' nel pilota. */
export const E2_PILOT_RATIONALE: E2ScenarioRationale[] = [
  {
    e1Id: "S01_stability_baseline",
    role: "controllo demografico",
    question: "La popolazione baseline raggiunge un equilibrio stabile e quanto varia tra seed?",
    phase: "E2-A",
  },
  {
    e1Id: "S02_scarcity_dense",
    role: "confronto confuso (geometria + densita')",
    question: "Il confronto grezzo S02−S01 e' descrittivo: quale effetto e' dovuto a geometria, densita' o risorse? Vedere E2.1 review.",
    phase: "E2-A",
  },
  {
    e1Id: "S06_predator_prey_mixed",
    role: "sistema preda-predatore",
    question: "Carnivori ed erbivori mostrano risposte demografiche sfalsate o cicli?",
    phase: "E2-B",
  },
  {
    e1Id: "S08_recovery_after_cull80",
    role: "perturbazione demografica",
    question: "Dopo un cull dell'80% la popolazione ritorna al livello pre-perturbazione?",
    phase: "E2-E",
  },
];

/** Costruisce il pilota E2.1 partendo dalla tabella E1, senza modificarla. */
export function buildE2PilotScenarios(options: E2PilotOptions): ScenarioSpec[] {
  const buildOptions: ScenarioBuildOptions = {
    seeds: options.seeds,
    ticks: options.ticks,
    sampleEvery: options.sampleEvery,
    habitatControls: false,
  };
  const allowed = new Set<string>(E2_PILOT_SCENARIO_IDS);
  return buildScenarios(buildOptions).filter((spec) => allowed.has(spec.id));
}

/** Scenari E1 riutilizzati in E2.2 (food web). */
export const E2_FOODWEB_SCENARIO_IDS = [
  "S04_herbivore_monoculture",
  "S05_carnivore_stress",
  "S06_predator_prey_mixed",
] as const;

/** Perché ogni scenario è in E2.2. */
export const E2_FOODWEB_RATIONALE: E2ScenarioRationale[] = [
  {
    e1Id: "S04_herbivore_monoculture",
    role: "controllo senza predazione attesa",
    question: "Con tutti i fondatori a carnivory=0.05, quante kills sono registrate (A04)?",
    phase: "E2-B",
  },
  {
    e1Id: "S05_carnivore_stress",
    role: "stress carnivoro senza prede idonee",
    question: "Con tutti i fondatori a carnivory=0.6, la predazione tra conspecifici è impossibile (A04): le kills restano nulle?",
    phase: "E2-B",
  },
  {
    e1Id: "S06_predator_prey_mixed",
    role: "sistema preda-predatore (geometria e densità diverse)",
    question: "Il tratto carnivoro segue il tratto erbivoro con un lag positivo e i due tratti coesistono?",
    phase: "E2-B",
  },
];

/** Costruisce il blocco E2.2 partendo dalla tabella E1 immutata. */
export function buildE2FoodWebScenarios(options: E2PilotOptions & { scenarioIds?: readonly string[] }): ScenarioSpec[] {
  const allowed = new Set<string>(options.scenarioIds ?? E2_FOODWEB_SCENARIO_IDS);
  return buildScenarios({
    seeds: options.seeds,
    ticks: options.ticks,
    sampleEvery: options.sampleEvery,
    habitatControls: false,
  }).filter((spec) => allowed.has(spec.id));
}

/** Matrice concettuale E2.1–E2.6, usata nel report e nei controlli di copertura. */
export const E2_MATRIX = {
  "E2-A": {
    title: "Stabilita' demografica",
    scenarios: ["S01", "S02", "S03", "S04", "S05", "S07", "S12"],
    status: "pilota parziale" as const,
  },
  "E2-B": {
    title: "Dinamiche preda-predatore",
    scenarios: ["S04", "S05", "S06"],
    status: "eseguito (E2.2)" as const,
  },
  "E2-C": {
    title: "Competizione e coesistenza",
    scenarios: ["S01", "S06", "S09", "S10", "S13", "S14"],
    status: "pianificato" as const,
  },
  "E2-D": {
    title: "Biodiversita' e complessita'",
    scenarios: ["S01", "S06", "S09", "S10", "S12"],
    status: "pianificato" as const,
  },
  "E2-E": {
    title: "Resilienza e perturbazioni",
    scenarios: ["S08"],
    status: "pilota parziale" as const,
  },
  "E2-F": {
    title: "Evoluzione e speciazione",
    scenarios: ["S01", "S11", "S12"],
    status: "pianificato" as const,
  },
} as const;
