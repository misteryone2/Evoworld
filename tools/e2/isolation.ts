/**
 * E2 — isolamento delle variabili sperimentali di S02.
 *
 * S02 cambia insieme geometria (64x64 vs 128x128) e fondatori (220 vs 150).
 * Questo modulo costruisce bracci additivi in cui una sola variabile alla volta
 * viene modificata rispetto al controllo. Le risorse non hanno uno scalar
 * pubblico: vengono isolate con i controlli habitat di E1 (S09/S10/S13/S14),
 * che mantengono fissi geometria e popolazione.
 */
import { buildScenarios } from "../e1/scenarios";
import type { RunResult, ScenarioSpec } from "../e1/runner";
import type { PairedComparison } from "../e1/statistics";
import { analyzeRun } from "./metrics";
import { pairedMetric } from "./statistics";

export const ISOLATION_CONTROL_ID = "I0_control_128x128_150";
export const ISOLATION_GEOMETRY_ID = "IG_geometry_only_64x64_38";
export const ISOLATION_DENSITY_ID = "ID_density_only_128x128_220";
export const ISOLATION_COMBINED_ID = "IGD_combined_64x64_220";

export const ISOLATION_RESOURCE_IDS = [
  "S09_poor_habitat",
  "S10_rich_habitat",
  "S13_poor_position_rich_resources",
  "S14_rich_position_poor_resources",
] as const;

export const E2_ISOLATION_ARM_IDS = [
  ISOLATION_CONTROL_ID,
  ISOLATION_GEOMETRY_ID,
  ISOLATION_DENSITY_ID,
  ISOLATION_COMBINED_ID,
  ...ISOLATION_RESOURCE_IDS,
] as const;

export interface IsolationOptions {
  seeds: number[];
  ticks: number;
  sampleEvery: number;
}

export type IsolationMetric = "finalPopulation" | "survivalFraction";

export interface IsolationContrast {
  id: string;
  variable: "geometry" | "density" | "combined" | "resource" | "position";
  a: string;
  b: string;
  description: string;
  metric: IsolationMetric;
  causal: false;
}

/** Popolazione finale / popolazione iniziale: confrontabile tra bracci con fondatori diversi. */
export function survivalFractionOf(result: RunResult): number {
  return result.initialPopulation > 0
    ? analyzeRun(result).finalPopulation / result.initialPopulation
    : Number.NaN;
}

/** Confronti in cui A−B differisce solo per la variabile dichiarata. */
export const ISOLATION_CONTRASTS: IsolationContrast[] = [
  {
    id: "geometry_only_minus_control_final_population",
    variable: "geometry",
    a: ISOLATION_GEOMETRY_ID,
    b: ISOLATION_CONTROL_ID,
    description: "Geometria 64x64 con densita' di fondatori quasi invariata (38 vs 150); non causale.",
    metric: "finalPopulation",
    causal: false,
  },
  {
    id: "density_only_minus_control_final_population",
    variable: "density",
    a: ISOLATION_DENSITY_ID,
    b: ISOLATION_CONTROL_ID,
    description: "Fondatori 220 vs 150 a geometria 128x128 invariata; non causale.",
    metric: "finalPopulation",
    causal: false,
  },
  {
    id: "combined_minus_control_final_population",
    variable: "combined",
    a: ISOLATION_COMBINED_ID,
    b: ISOLATION_CONTROL_ID,
    description: "S02 ricostruito: geometria e densita' cambiano insieme; confronte solo di riferimento.",
    metric: "finalPopulation",
    causal: false,
  },
  {
    id: "geometry_only_minus_control_survival_fraction",
    variable: "geometry",
    a: ISOLATION_GEOMETRY_ID,
    b: ISOLATION_CONTROL_ID,
    description: "Metrica primaria: sopravvivenza relativa ai fondatori, confrontabile tra bracci con popolazioni iniziali diverse.",
    metric: "survivalFraction",
    causal: false,
  },
  {
    id: "density_only_minus_control_survival_fraction",
    variable: "density",
    a: ISOLATION_DENSITY_ID,
    b: ISOLATION_CONTROL_ID,
    description: "Metrica primaria: sopravvivenza relativa a 220 vs 150 fondatori a geometria invariata.",
    metric: "survivalFraction",
    causal: false,
  },
  {
    id: "combined_minus_control_survival_fraction",
    variable: "combined",
    a: ISOLATION_COMBINED_ID,
    b: ISOLATION_CONTROL_ID,
    description: "Metrica primaria: sopravvivenza relativa nel braccio S02 ricostruito.",
    metric: "survivalFraction",
    causal: false,
  },
  {
    id: "resource_minus_poor_position_final_population",
    variable: "resource",
    a: "S13_poor_position_rich_resources",
    b: "S09_poor_habitat",
    description: "Risorse ricche vs povere con posizioni povere invariate; non causale.",
    metric: "finalPopulation",
    causal: false,
  },
  {
    id: "resource_minus_poor_resources_final_population",
    variable: "resource",
    a: "S10_rich_habitat",
    b: "S14_rich_position_poor_resources",
    description: "Risorse ricche vs povere con posizioni ricche invariate; non causale.",
    metric: "finalPopulation",
    causal: false,
  },
  {
    id: "position_minus_poor_resources_final_population",
    variable: "position",
    a: "S14_rich_position_poor_resources",
    b: "S09_poor_habitat",
    description: "Posizioni ricche vs povere con risorse povere invariate; non causale.",
    metric: "finalPopulation",
    causal: false,
  },
  {
    id: "position_minus_rich_resources_final_population",
    variable: "position",
    a: "S10_rich_habitat",
    b: "S13_poor_position_rich_resources",
    description: "Posizioni ricche vs povere con risorse ricche invariate; non causale.",
    metric: "finalPopulation",
    causal: false,
  },
];

export interface IsolationRationale {
  id: string;
  variable: string;
  changed: string;
  heldConstant: string;
  note: string;
}

export const ISOLATION_RATIONALE: IsolationRationale[] = [
  {
    id: ISOLATION_GEOMETRY_ID,
    variable: "geometria",
    changed: "area 16384 → 4096 celle (64x64)",
    heldConstant: "setup baseline, popolazione ~150/4 = 38 per mantenere la densita' di fondatori",
    note: "38 e' l'arrotondamento intero di 37.5: la densita' differisce dell'1.3%.",
  },
  {
    id: ISOLATION_DENSITY_ID,
    variable: "densita' iniziale",
    changed: "fondatori 150 → 220",
    heldConstant: "geometria 128x128, setup baseline",
    note: "La disponibilita' per fondatore cambia come conseguenza della densita'.",
  },
  {
    id: ISOLATION_COMBINED_ID,
    variable: "geometria + densita'",
    changed: "area 16384 → 4096 celle e fondatori 150 → 220",
    heldConstant: "setup baseline",
    note: "Equivalente a S02: confronte confuso, usato solo come riferimento.",
  },
  {
    id: "S09_poor_habitat",
    variable: "posizione + risorse locali",
    changed: "fondatori e risorse locali povere",
    heldConstant: "geometria 128x128, popolazione 150",
    note: "Controllo di base per il disaccoppiamento habitat di E1.",
  },
  {
    id: "S13_poor_position_rich_resources",
    variable: "risorse locali",
    changed: "risorse locali ricche con posizioni povere",
    heldConstant: "geometria 128x128, popolazione 150, posizioni come S09",
    note: "S13−S09 isola le risorse; nessuno scalar globale e' disponibile.",
  },
  {
    id: "S14_rich_position_poor_resources",
    variable: "posizione",
    changed: "posizioni ricche con risorse locali povere",
    heldConstant: "geometria 128x128, popolazione 150, risorse come S09",
    note: "S14−S09 isola la posizione.",
  },
  {
    id: "S10_rich_habitat",
    variable: "posizione + risorse locali",
    changed: "fondatori e risorse locali ricche",
    heldConstant: "geometria 128x128, popolazione 150",
    note: "S10−S14 conferma l'effetto risorse; S10−S13 conferma l'effetto posizione.",
  },
];

export const foundersPerCell = (width: number, height: number, population: number): number =>
  population / (width * height);

/** Costruisce i bracci di isolamento senza modificare la tabella E1. */
export function buildVariableIsolationScenarios(options: IsolationOptions): ScenarioSpec[] {
  const common = {
    seeds: options.seeds,
    ticks: options.ticks,
    sampleEvery: options.sampleEvery,
  };
  const custom = (id: string, description: string, width: number, height: number, population: number): ScenarioSpec[] =>
    options.seeds.map((seed) => ({
      id,
      description,
      seed,
      width,
      height,
      population,
      ticks: options.ticks,
      sampleEvery: options.sampleEvery,
      setup: "baseline",
    }));

  const habitat = buildScenarios({ ...common, habitatControls: true })
    .filter((spec) => (ISOLATION_RESOURCE_IDS as readonly string[]).includes(spec.id));

  return [
    ...custom(ISOLATION_CONTROL_ID, "Controllo isolamento: 128x128, 150 fondatori, baseline", 128, 128, 150),
    ...custom(ISOLATION_GEOMETRY_ID, "Solo geometria: 64x64, 38 fondatori per densita' ~baseline", 64, 64, 38),
    ...custom(ISOLATION_DENSITY_ID, "Solo densita': 128x128, 220 fondatori", 128, 128, 220),
    ...custom(ISOLATION_COMBINED_ID, "S02 ricostruito: 64x64, 220 fondatori", 64, 64, 220),
    ...habitat,
  ];
}

/** Confronti appaiati per seed del disegno di isolamento. */
export function buildIsolationComparisons(groups: Record<string, RunResult[]>): PairedComparison[] {
  const comparisons: PairedComparison[] = [];
  for (const contrast of ISOLATION_CONTRASTS) {
    const a = groups[contrast.a];
    const b = groups[contrast.b];
    if (!a || !b) continue;
    const extract = contrast.metric === "survivalFraction"
      ? survivalFractionOf
      : (result: RunResult) => analyzeRun(result).finalPopulation;
    comparisons.push(
      pairedMetric(a, b, extract, {
        label: contrast.id,
        description: contrast.description,
        scenarioA: contrast.a,
        scenarioB: contrast.b,
        metric: contrast.metric,
      }),
    );
  }
  return comparisons;
}
