/**
 * v1.11.0 — Advanced Fauna Genome: registro dei geni avanzati.
 *
 * Modello causale: Genotipo → Espressione (phenotype.ts) → Fenotipo → Ambiente e stato dell'organismo →
 * Comportamento emergente (cervello, invariato) → Selezione naturale.
 *
 * Regole di questo registro:
 *  - Ogni gene è una CAPACITÀ fisica o fisiologica (quanto grosso, quanto resistente, quanto digerisce…), mai una
 *    tendenza di comportamento (nessuna "aggressività 80%", "socialità", "esplorazione"): il comportamento resta
 *    quello deciso dal cervello evoluto (brain.ts), a partire da ciò che il corpo permette.
 *  - Ogni gene ha un effetto concreto nella simulazione (vedi `effect`) e un compromesso reale (vedi `tradeoff`):
 *    nessun valore è gratis e nessun estremo è sempre migliore.
 *  - Il valore predefinito è NEUTRO: un organismo con tutti i geni al predefinito (o senza geni, come nei salvataggi
 *    precedenti) si comporta esattamente come nella v1.10.
 *  - Estensibile: aggiungere un gene significa aggiungere una voce qui e il suo effetto in phenotype.ts. Nessun
 *    array a dimensione fissa, nessun numero massimo di geni; gli id sono stabili e non si riusano.
 */

export type GeneCategory = "morphology" | "locomotion" | "perception" | "physiology" | "adaptation" | "ecology" | "reproduction" | "cognition";

export interface GeneDefinition {
  /** Id stabile (non cambiare né riusare mai: è nei salvataggi). */
  id: string;
  category: GeneCategory;
  min: number;
  max: number;
  /** Valore neutro: non cambia nulla rispetto alla v1.10. */
  default: number;
  /** Deviazione standard di una mutazione, come frazione dell'intervallo. */
  mutationStd: number;
  /** Peso nella distanza genetica, dentro la propria categoria. */
  distanceWeight: number;
  /** Cosa fa nella simulazione. */
  effect: string;
  /** Il compromesso: cosa costa o cosa si perde dall'altra parte. */
  tradeoff: string;
  /** Con quali tratti/geni interagisce. */
  interactions: string;
}

export const GENE_CATALOG: readonly GeneDefinition[] = [
  // ---- Morfologia e struttura corporea ----
  {
    id: "bodyDensity", category: "morphology", min: 0.7, max: 1.4, default: 1, mutationStd: 0.04, distanceWeight: 1,
    effect: "Massa a parità di taglia: pesa di più nelle collisioni (spinge di più, è spinto di meno) e difende meglio dalla caccia (corazza, ossa pesanti).",
    tradeoff: "Mantenere tessuti densi costa energia: +25% di mantenimento per ogni +1 di densità.",
    interactions: "size (la massa base è taglia³), evasion e sprintBias (difesa dalla caccia).",
  },
  {
    id: "bodyFatReserve", category: "morphology", min: 0.7, max: 1.5, default: 1, mutationStd: 0.04, distanceWeight: 1,
    effect: "Capacità massima di riserva di energia (150 × il valore).",
    tradeoff: "Portare grasso costa: +20% di mantenimento per ogni +1.",
    interactions: "metabolism, torporCapacity (il torpore scatta in proporzione alla riserva), digestiveEfficiency.",
  },
  // ---- Locomozione e movimento ----
  {
    id: "limbLength", category: "locomotion", min: 0.7, max: 1.4, default: 1, mutationStd: 0.04, distanceWeight: 1,
    effect: "Su terreno ripido o accidentato il passo si accorcia meno (l'eccesso di costo del terreno si divide per il valore).",
    tradeoff: "Arti lunghi costano: +15% di mantenimento per ogni +1.",
    interactions: "speed (il passo base), terreno e pendenze del pianeta.",
  },
  {
    id: "sprintBias", category: "locomotion", min: 0.6, max: 1.6, default: 1, mutationStd: 0.04, distanceWeight: 1,
    effect: "Potenza di scatto: moltiplica sia la forza del cacciatore sia la difesa della preda negli inseguimenti (fibre rapide).",
    tradeoff: "Le fibre rapide costano: +20% di mantenimento per ogni +1. Il vantaggio dipende dal ruolo (cacciatore o preda) e dalla popolazione intorno.",
    interactions: "size, speed, huntingSkill, evasion, carnivory.",
  },
  // ---- Percezione sensoriale ----
  {
    id: "proximitySensing", category: "perception", min: 0.5, max: 2, default: 1, mutationStd: 0.04, distanceWeight: 1,
    effect: "Raggio con cui percepisce gli altri animali (rivali, minacce, prede, branco) rispetto alla vista di base; non cambia la ricerca del cibo.",
    tradeoff: "Organi di senso estesi costano: +8% di mantenimento per ogni +1.",
    interactions: "vision, evasion, huntingSkill (la forza dei segnali di paura e di caccia).",
  },
  // ---- Fisiologia e metabolismo ----
  {
    id: "torporCapacity", category: "physiology", min: 0, max: 0.6, default: 0, mutationStd: 0.04, distanceWeight: 1,
    effect: "Con l'energia sotto il 35% della propria riserva, il mantenimento cala della metà del valore.",
    tradeoff: "Nello stesso stato il passo si accorcia della metà del valore (si muove meno e meno lontano) e il gene costa +10% di mantenimento per ogni +1.",
    interactions: "bodyFatReserve, metabolism, memoryRetention.",
  },
  {
    id: "digestiveEfficiency", category: "physiology", min: 0.7, max: 1.4, default: 1, mutationStd: 0.04, distanceWeight: 1,
    effect: "Energia ricavata dalla vegetazione, in proporzione.",
    tradeoff: "Un intestino efficiente costa: +20% di mantenimento per ogni +1.",
    interactions: "carnivory (solo la quota vegetale), environmentalFitness, bodyFatReserve.",
  },
  // ---- Adattamento ambientale ----
  {
    id: "thermalBias", category: "adaptation", min: -1, max: 1, default: 0, mutationStd: 0.04, distanceWeight: 1,
    effect: "Asimmetria della tolleranza termica: valori positivi allargano la tolleranza verso il freddo (+35% per ogni +1) e la stringono verso il caldo; i negativi il contrario.",
    tradeoff: "Compromesso puro: quanto guadagna da una parte lo perde dall'altra.",
    interactions: "preferredTemperature, temperatureTolerance (larghezza e picco di idoneità).",
  },
  {
    id: "droughtBias", category: "adaptation", min: -1, max: 1, default: 0, mutationStd: 0.04, distanceWeight: 1,
    effect: "Asimmetria della tolleranza all'acqua: valori positivi allargano la tolleranza verso i luoghi più secchi del preferito (+35% per ogni +1) e la stringono verso i più umidi; i negativi il contrario.",
    tradeoff: "Compromesso puro: quanto guadagna da una parte lo perde dall'altra.",
    interactions: "preferredWater, waterTolerance.",
  },
  // ---- Capacità ecologiche e alimentari ----
  {
    id: "meatEfficiency", category: "ecology", min: 0.7, max: 1.4, default: 1, mutationStd: 0.04, distanceWeight: 1,
    effect: "Energia ricavata da una preda catturata, in proporzione.",
    tradeoff: "Un apparato digerente per la carne costa: +20% di mantenimento per ogni +1.",
    interactions: "carnivory, huntingSkill, sprintBias.",
  },
  // ---- Riproduzione e ciclo vitale ----
  {
    id: "gestationInvestment", category: "reproduction", min: 0.7, max: 1.5, default: 1, mutationStd: 0.04, distanceWeight: 1,
    effect: "Quanta energia mette in ogni figlio: il costo per il genitore e l'energia iniziale del nato crescono insieme (strategia K) o calano (strategia r).",
    tradeoff: "Figli più dotati sopravvivono meglio ma ne servono più risorse a ogni nascita.",
    interactions: "fertility, bodyFatReserve, metabolism.",
  },
  {
    id: "maturationRate", category: "reproduction", min: 0.6, max: 1.6, default: 1, mutationStd: 0.04, distanceWeight: 1,
    effect: "Velocità di maturazione: la fase giovanile (10% della vita) si accorcia o si allunga in proporzione inversa.",
    tradeoff: "Vita veloce, vita breve: la durata effettiva della vita cala del 20% per ogni +1.",
    interactions: "lifespan, fertility.",
  },
  // ---- Capacità cognitive (solo ciò che il sistema cerebrale usa davvero: la memoria di cibo e pericolo) ----
  {
    id: "memoryRetention", category: "cognition", min: 0.5, max: 2, default: 1, mutationStd: 0.04, distanceWeight: 1,
    effect: "Per quanto tempo si ricorda un luogo di cibo o di pericolo prima di dimenticarlo (300 tick × il valore). Il cervello decide cosa farne.",
    tradeoff: "Il tessuto nervoso costa: +10% di mantenimento per ogni +1.",
    interactions: "brain (canale di memoria), territorio e luoghi di caccia.",
  },
];

export const GENE_IDS: readonly string[] = GENE_CATALOG.map((g) => g.id);
export const GENE_BY_ID: ReadonlyMap<string, GeneDefinition> = new Map(GENE_CATALOG.map((g) => [g.id, g]));

export function geneDefault(id: string): number {
  return GENE_BY_ID.get(id)?.default ?? 0;
}

export function clampGene(def: GeneDefinition, value: number): number {
  if (!Number.isFinite(value)) return def.default;
  return value < def.min ? def.min : value > def.max ? def.max : value;
}

/** Valore di un gene in un insieme (anche assente, vecchio o parziale): un gene mancante o non valido vale il predefinito. */
export function geneValue(genes: Readonly<Record<string, number>> | undefined, id: string): number {
  const def = GENE_BY_ID.get(id);
  if (!def) return 0;
  const v = genes?.[id];
  return typeof v === "number" && Number.isFinite(v) ? clampGene(def, v) : def.default;
}

/** Pesi delle categorie nella distanza genetica (somma 1): fissi, così il numero di geni per categoria non cambia la scala. */
export const CATEGORY_WEIGHTS: Readonly<Record<GeneCategory, number>> = {
  morphology: 0.15,
  locomotion: 0.15,
  perception: 0.1,
  physiology: 0.15,
  adaptation: 0.15,
  ecology: 0.08,
  reproduction: 0.14,
  cognition: 0.08,
};

/** Peso complessivo dei geni avanzati nella distanza genetica rispetto ai 13 tratti di base (vedi geneticDistance). */
export const ADVANCED_DISTANCE_LAMBDA = 0.25;

/** Parole che non devono comparire in un id di gene: il comportamento emerge, non si imposta (verificato da un test). */
export const FORBIDDEN_BEHAVIOR_WORDS = ["aggress", "social", "explor", "curios", "bold", "shy", "territor", "flock", "fear", "courage"] as const;
