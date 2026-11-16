/**
 * v1.11.0 — Advanced Fauna Genome: registro dei geni (specifica di Vibe, "Specifica architetturale" §2 e
 * "Catalogo dei geni"). 13 tratti storici (`legacy`, intervalli IDENTICI a TRAIT_RANGES) + 20 geni estesi.
 *
 * Il registro è DATI: intervalli, predefiniti, mutazione, pesi nella distanza. Gli effetti stanno in
 * geneExpression.ts (funzioni pure) e nei punti di aggancio indicati da `hook`.
 *
 * Modello: Genotipo → Espressione → Fenotipo → Ambiente/stato → Comportamento emergente (decide il cervello evoluto)
 * → Selezione. Nessun gene decide comportamenti; i geni percettivi modulano i canali sensoriali ESISTENTI (il cervello
 * ha dimensione fissa: BRAIN_SIZE 119, nessun nuovo ingresso).
 *
 * DEFAULT (scelta di questa implementazione, vedi docs/GENOMA-v1.11.0.md §Deviazioni): i valori predefiniti sono
 * scelti perché il fenotipo di un genoma tutto-predefinito equivalga al comportamento della v1.10 (raccomandazione
 * forte di Vibe, §7.1). Dove la formula del catalogo non è neutra al predefinito proposto (per esempio 1 + 0,6·r con
 * r = 0,40) si è spostato il PREDEFINITO (un dato), non la formula.
 */
import type { TraitName } from "../../types";
import { TRAIT_RANGES } from "./traitRanges";

export type GeneCategory = "morphology" | "locomotion" | "perception" | "physiology" | "adaptation" | "ecology" | "reproduction" | "cognition" | "legacy";

export interface GeneDefinition {
  /** Id stabile, es. "MOR-01" (i legacy: il nome del tratto). */
  id: string;
  /** Chiave del campo nel genoma serializzato (legacy: campo di primo livello; nuovi: `ext[key]`). */
  key: string;
  category: GeneCategory;
  description: string;
  min: number;
  max: number;
  defaultValue: number;
  /** Deviazione standard di una mutazione, come frazione dell'intervallo. */
  mutationStdFraction: number;
  /** Peso biologico nella distanza genetica (i legacy valgono 1). */
  distanceWeight: number;
  /** Documentazione: meccanismo e punto di applicazione. */
  hook: string;
}

export const GENOME_VERSION_CURRENT = 2;
export const DEFAULT_MUTATION_STD_FRACTION = 0.04;

const LEGACY_HOOKS: Record<TraitName, string> = {
  size: "tratto storico: upkeep, collisioni, caccia, alimentazione",
  speed: "tratto storico: passo (movement.ts), upkeep, caccia",
  metabolism: "tratto storico: moltiplica il mantenimento (organism.ts)",
  vision: "tratto storico: raggio di percezione (behavior.ts, feeding)",
  fertility: "tratto storico: probabilità di riproduzione (reproduction.ts)",
  lifespan: "tratto storico: durata della vita (organism.ts)",
  carnivory: "tratto storico: dieta, caccia, costo convesso (organism.ts)",
  preferredTemperature: "tratto storico: nicchia termica (environment.ts)",
  temperatureTolerance: "tratto storico: larghezza della nicchia termica (environment.ts)",
  preferredWater: "tratto storico: nicchia idrica (environment.ts)",
  waterTolerance: "tratto storico: larghezza della nicchia idrica (environment.ts)",
  evasion: "tratto storico: difesa dalla caccia (predation.ts), upkeep",
  huntingSkill: "tratto storico: forza del cacciatore (predation.ts), upkeep",
};

const LEGACY: GeneDefinition[] = (Object.keys(TRAIT_RANGES) as TraitName[]).map((key) => ({
  id: key,
  key,
  category: "legacy" as const,
  description: `Tratto storico ${key} (invariato dalla v1.10).`,
  min: TRAIT_RANGES[key].min,
  max: TRAIT_RANGES[key].max,
  defaultValue: (TRAIT_RANGES[key].min + TRAIT_RANGES[key].max) / 2,
  mutationStdFraction: DEFAULT_MUTATION_STD_FRACTION,
  distanceWeight: 1,
  hook: LEGACY_HOOKS[key],
}));

function g(
  id: string, key: string, category: GeneCategory, min: number, max: number, defaultValue: number, distanceWeight: number,
  description: string, hook: string,
): GeneDefinition {
  return { id, key, category, description, min, max, defaultValue, mutationStdFraction: DEFAULT_MUTATION_STD_FRACTION, distanceWeight, hook };
}

const EXTENDED: GeneDefinition[] = [
  // ---- Morfologia e struttura corporea ----
  g("MOR-01", "furDensity", "morphology", 0, 1, 0, 0.6,
    "Foltezza del pelo: isolamento dal freddo, a scapito del caldo. Costo di mantenimento.",
    "environment.ts: scala la deviazione termica z (lato freddo ×(1−0,30·pelo), lato caldo ×(1+0,20·pelo)); organism.ts: upkeep"),
  g("MOR-02", "dermalArmor", "morphology", 0, 0.6, 0, 0.7,
    "Corazza dermica: si somma alla difesa dalla caccia; rallenta e costa mantenimento.",
    "predation.ts: defensivePower (1,15 + evasion + corazza, con tetto totale); movement.ts: passo ×(1−0,15·corazza); organism.ts: upkeep"),
  g("MOR-03", "bodyStature", "morphology", 0, 1, 0.5, 0.5,
    "Corporatura da esile (0) a robusta (1): robusto = corpo più grande e più difeso ma più lento; esile viceversa. Compromesso interno, senza costo diretto.",
    "collision.ts: raggio ×(1+0,15·s); predation.ts: difesa ×(1+0,10·s); movement.ts: passo ×(1−0,10·s), con s = 2·(valore−0,5)"),
  // ---- Locomozione e movimento ----
  g("LOC-01", "endurance", "locomotion", 0, 1, 0, 0.6,
    "Resistenza: riduce il costo energetico del movimento (non quello del riposo).",
    "organism.ts upkeepCost: termine di velocità ×(1−0,40·resistenza); upkeep"),
  g("LOC-02", "burstPower", "locomotion", 0, 1, 0, 0.6,
    "Potenza di scatto: bonus momentaneo nei tentativi di caccia e fuga, pagato con energia a ogni tentativo.",
    "predation.ts: huntingPower e defensivePower ×(1+0,25·scatto); costo 6·scatto per tentativo (cacciatore e preda)"),
  // ---- Percezione sensoriale (modulazione dei canali esistenti) ----
  g("PER-01", "peripheralAcuity", "perception", 0, 1, 0, 0.5,
    "Acuità periferica: il segnale di pericolo è più forte e la minaccia è rilevata un po' più lontano. La decisione resta alla rete.",
    "behavior.ts: canale paura ×(1+0,5·a), raggio di rilevazione delle minacce ×(1+0,25·a); upkeep"),
  g("PER-02", "olfactorySensitivity", "perception", 0, 1, 0, 0.4,
    "Olfatto: il canale della memoria è più intenso.",
    "behavior.ts: canale memoria ×(1+0,6·o); upkeep"),
  g("PER-03", "socialTolerance", "perception", 0, 1, 0.5, 0.4,
    "Tolleranza alla vicinanza di altri: chi tollera poco sente più forte il segnale del gruppo. È fisiologia sensoriale, non una decisione.",
    "behavior.ts: canale del gruppo ×(1,4−0,8·t)"),
  // ---- Fisiologia e metabolismo ----
  g("FIS-01", "energyReserve", "physiology", 0, 1, 0, 0.6,
    "Riserve di grasso: tetto di energia più alto, mantenimento più alto.",
    "energy.ts/feeding.ts/predation.ts/behavior.ts: tetto = MAX_ENERGY×(1+0,6·r); organism.ts: upkeep"),
  g("FIS-02", "digestiveEfficiency", "physiology", 0, 1, 0.5, 0.7,
    "Efficienza digestiva: moltiplica l'energia ricavata da ogni fonte.",
    "feeding.ts e predation.ts: guadagno ×(0,75+0,5·d); organism.ts: upkeep"),
  g("FIS-03", "thermoregulation", "physiology", 0, 1, 0, 0.5,
    "Termoregolazione: rende meno svantaggiosa una tolleranza termica larga (recupera parte dell'altezza del picco).",
    "environment.ts: picco termico = maxPeak − tolFrac·(maxPeak−minPeak)·(1−0,4·t); organism.ts: upkeep"),
  g("FIS-04", "hydrationEfficiency", "physiology", 0, 1, 0, 0.4,
    "Idratazione efficiente: come FIS-03 sull'asse dell'acqua.",
    "environment.ts: picco idrico recuperato ×(0,4·h); organism.ts: upkeep"),
  // ---- Adattamento ambientale ----
  g("ADA-01", "seasonalRobustness", "adaptation", 0, 1, 0, 0.4,
    "Robustezza stagionale: ammortizza lo scostamento stagionale della temperatura.",
    "environment.ts: offset stagionale (cell.seasonalOffset) ×(1−0,35·s); organism.ts: upkeep"),
  g("ADA-02", "altitudeAdaptation", "adaptation", 0, 1, 0, 0.4,
    "Adattamento altitudinale: più idoneo in quota, a pagamento. PROVVISORIO (decisione aperta di Mattia sulla vegetazione di quota).",
    "environment.ts: fitness ×(1+0,3·a·quota/0,85), cioè la formula (0,85+0,3·a·quota) rinormalizzata a 1 per a=0; organism.ts: upkeep"),
  // ---- Capacità ecologiche e alimentari ----
  g("ECO-01", "grazingEfficiency", "ecology", 0, 1, 0, 0.6,
    "Pascolo efficiente: pesa meno nella domanda sul budget regionale a parità di guadagno. PROVVISORIO (decisione aperta di Mattia: quota o consumo).",
    "feeding.ts: peso di domanda (regione e cella) ×(1−0,3·g); guadagno invariato; organism.ts: upkeep"),
  g("ECO-02", "dietFlexibility", "ecology", 0, 1, 0, 0.5,
    "Flessibilità dietetica: attenua il costo convesso della carnivoria (non lo azzera).",
    "organism.ts: costo della carnivoria ×(1−0,40·f); upkeep"),
  // ---- Riproduzione e ciclo vitale ----
  g("REP-01", "parentalInvestment", "reproduction", 0, 1, 4 / 9, 0.6,
    "Investimento parentale: più energia al nato e più costo per il genitore.",
    "reproduction.ts: energia del nato = 50×(0,6+0,9·p); costo del genitore = 55 + 1,1·(energia del nato − 50)"),
  g("REP-02", "maturityRate", "reproduction", 0, 1, 0.6, 0.5,
    "Velocità di maturazione: abbassa o alza la soglia di età riproduttiva (6%–16% della vita).",
    "reproduction.ts: soglia = vita×0,1×(1,6−velocità)"),
  // ---- Capacità cognitive (solo meccanismi realmente presenti) ----
  g("COG-01", "memorySpan", "cognition", 0, 1, 1 / 3, 0.5,
    "Durata della memoria di cibo e pericolo (150–600 tick).",
    "behavior.ts: decadimento = 300×(0,5+1,5·s); organism.ts: upkeep"),
  g("COG-02", "neuralStability", "cognition", 0, 1, 0.5, 0.5,
    "Fedeltà neurale: quanto fedelmente si trasmettono i pesi del cervello (std di mutazione 0,18–0,42 secondo la formula del catalogo (il testo diceva 0,12–0,42: incoerente)).",
    "brain.ts: std di mutazione = 0,3×(1,4−0,8·s) nella nascita; organism.ts: upkeep"),
];

export const GENE_REGISTRY: readonly GeneDefinition[] = Object.freeze([...LEGACY, ...EXTENDED]);
export const GENE_BY_KEY: ReadonlyMap<string, GeneDefinition> = new Map(GENE_REGISTRY.map((d) => [d.key, d]));
export const GENE_BY_ID: ReadonlyMap<string, GeneDefinition> = new Map(GENE_REGISTRY.map((d) => [d.id, d]));
/** Solo i geni estesi (quelli che stanno in `genome.ext`). */
export const EXTENDED_GENES: readonly GeneDefinition[] = Object.freeze(EXTENDED);
export const LEGACY_KEYS: readonly string[] = Object.freeze(LEGACY.map((d) => d.key));

/** Guardia anti-gene-comportamentale (testata): nessuna chiave di gene estesa deve contenere queste radici. */
export const FORBIDDEN_GENE_KEY_PATTERN = /aggression|sociality|exploration|curiosity/i;

export function clampToGene(def: GeneDefinition, value: number): number {
  if (!Number.isFinite(value)) return def.defaultValue;
  return value < def.min ? def.min : value > def.max ? def.max : value;
}
