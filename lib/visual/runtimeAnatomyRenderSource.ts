import { BODY_PLAN_CATALOG, speculativeBodyPlanId } from "../anatomy/bodyPlan";
import { generateAnatomyCached } from "../anatomy/generate";
import { derivePhenotype } from "../phenotype/derive";
import type { RenderFrame } from "../../types";
import {
  partsPlanFromAnatomyDescriptor,
  type AnatomyRenderPlan,
  type CreatureAnatomyRenderSource,
  type CreatureRenderPartKey,
} from "./anatomyRenderPlan";

/**
 * G3 — sorgente anatomica runtime, lato renderer e senza prop manuale.
 *
 * Il frame trasporta solo copie dei tre geni MOR registrati. Il body plan non è
 * codificato geneticamente: viene scelto in modo deterministico dal speciesId
 * (`seeded-speculative`) e dichiarato come undetermined nel descriptor. Il
 * seed dell'organismo guida soltanto la variazione estetica. Nessuna regola
 * biologica, evolutiva o di salvataggio entra in questo modulo.
 */

export const MORPH_PRESENCE_BODY_STATURE = 1;
export const MORPH_PRESENCE_FUR_DENSITY = 2;
export const MORPH_PRESENCE_DERMAL_ARMOR = 4;

type Slots = Record<CreatureRenderPartKey, number>;

interface CacheEntry {
  version: number;
  lastSeen: number;
  plan: AnatomyRenderPlan | null;
  /** Motivo conservato anche per le voci unsupported riutilizzate. */
  unsupportedReason: string | null;
}

export interface RuntimeAnatomySourceStats {
  generated: number;
  reused: number;
  pruned: number;
  unsupported: number;
  missing: number;
  invalid: number;
  entries: number;
}

export interface RuntimeAnatomyRenderSource extends CreatureAnatomyRenderSource {
  /** Aggiorna cache e massimi slot prima del loop di disegno. */
  syncFrame(frame: RenderFrame | null): void;
  /** Statistiche mutate in posto: utili per QA e per il benchmark. */
  stats(): RuntimeAnatomySourceStats;
}

const emptySlots = (): Slots => ({ segment: 0, appendage: 0, eye: 0 });

function mix(h: number, value: number): number {
  return Math.imul((h ^ (value | 0)) >>> 0, 16777619) >>> 0;
}

/**
 * G3 cache correctness — hash dei bit Float32, non di un quantizzamento arbitrario.
 * `generateAnatomyCached` quantizza internamente a 1e-3: usare 1/4096 qui poteva
 * far collidere valori che producono descriptor diversi (e viceversa generare
 * piani inutilmente). I bit esatti del Float32 sono la rappresentazione realmente
 * consumata dai buffer del frame.
 */
const floatScratch = new Float32Array(1);
const intScratch = new Uint32Array(floatScratch.buffer);

function floatBits(value: number): number {
  floatScratch[0] = value;
  return intScratch[0];
}

/** Identità del dato anatomico: ogni parametro che entra nel piano deve essere nella versione. */
function versionFor(frame: RenderFrame, i: number): number {
  let h = 2166136261;
  h = mix(h, frame.organismsId[i]);
  h = mix(h, frame.organismsSpecies ? frame.organismsSpecies[i] : 0);
  h = mix(h, floatBits(frame.organismsSize[i]));
  const presence = frame.organismsMorphologyPresence ? frame.organismsMorphologyPresence[i] : 0;
  h = mix(h, presence);
  if (presence & MORPH_PRESENCE_BODY_STATURE) h = mix(h, floatBits(frame.organismsBodyStature![i]));
  if (presence & MORPH_PRESENCE_FUR_DENSITY) h = mix(h, floatBits(frame.organismsFurDensity![i]));
  if (presence & MORPH_PRESENCE_DERMAL_ARMOR) h = mix(h, floatBits(frame.organismsDermalArmor![i]));
  // `aggression` entra in partsPlanFromAnatomyDescriptor e quindi in colori/materiali:
  // senza questo termine la carnivoria cambiata lasciava il piano vecchio (G3 P1).
  h = mix(h, floatBits(frame.organismsCarnivory ? frame.organismsCarnivory[i] : 0));
  return h >>> 0;
}

/**
 * Firma dei soli array che influenzano il piano G2. O(n) senza allocazioni:
 * rileva anche mutazioni in posto su buffer riutilizzati, che il controllo
 * per reference non poteva vedere. I tratti legacy (speed/vision/evasione/...)
 * NON sono inclusi: non entrano nel piano G2 e il percorso legacy li traccia già.
 */
function frameSignature(frame: RenderFrame): number {
  let h = 2166136261;
  const n = frame.organismsId.length;
  h = mix(h, n);
  const species = frame.organismsSpecies;
  const size = frame.organismsSize;
  const carnivory = frame.organismsCarnivory;
  const presence = frame.organismsMorphologyPresence;
  const stature = frame.organismsBodyStature;
  const fur = frame.organismsFurDensity;
  const armor = frame.organismsDermalArmor;
  for (let i = 0; i < n; i++) {
    h = mix(h, frame.organismsId[i]);
    h = mix(h, species ? species[i] : 0);
    h = mix(h, floatBits(size[i]));
    h = mix(h, carnivory ? floatBits(carnivory[i]) : 0);
    h = mix(h, presence ? presence[i] : 0);
    if (stature) h = mix(h, floatBits(stature[i]));
    if (fur) h = mix(h, floatBits(fur[i]));
    if (armor) h = mix(h, floatBits(armor[i]));
  }
  return h >>> 0;
}

function frameHasMorphology(frame: RenderFrame): boolean {
  return !!frame.organismsBodyStature && !!frame.organismsFurDensity
    && !!frame.organismsDermalArmor && !!frame.organismsMorphologyPresence;
}

export function createRuntimeAnatomyRenderSource(id = "g3-runtime-anatomy"): RuntimeAnatomyRenderSource {
  const entries = new Map<number, CacheEntry>();
  const stats: RuntimeAnatomySourceStats = { generated: 0, reused: 0, pruned: 0, unsupported: 0, missing: 0, invalid: 0, entries: 0 };
  const maxSlots = emptySlots();
  let generation = 0;
  let lastFrame: RenderFrame | null = null;
  let lastTick = -1;
  let lastLength = -1;
  let lastX: Float32Array | null = null;
  let lastIds: Uint32Array | null = null;
  let lastStature: Float32Array | null = null;
  let lastFur: Float32Array | null = null;
  let lastArmor: Float32Array | null = null;
  let lastPresence: Uint8Array | null = null;
  let lastSignature = 0;
  let slotsValid = false;
  let fallbackReason: string | null = "no-g2-morphology";

  const resetSlots = (): void => {
    maxSlots.segment = 0;
    maxSlots.appendage = 0;
    maxSlots.eye = 0;
    slotsValid = false;
  };

  const source: RuntimeAnatomyRenderSource = {
    id,

    planFor(organismId: number): AnatomyRenderPlan | null {
      const entry = entries.get(organismId);
      if (!entry || entry.lastSeen !== generation) return null;
      return entry.plan;
    },

    maxSlots(): Slots | null {
      return slotsValid ? maxSlots : null;
    },

    fallbackReason(): string | null {
      return fallbackReason;
    },

    stats(): RuntimeAnatomySourceStats {
      stats.entries = entries.size;
      return stats;
    },

    syncFrame(frame: RenderFrame | null): void {
      if (!frame) {
        // Reset completo dell'identità: senza questo, risincronizzare lo stesso
        // frame dopo un null rimaneva bloccati sul fallback (G3 P1).
        entries.clear();
        resetSlots();
        generation++;
        lastFrame = null;
        lastTick = -1;
        lastLength = -1;
        lastX = null;
        lastIds = null;
        lastStature = null;
        lastFur = null;
        lastArmor = null;
        lastPresence = null;
        lastSignature = 0;
        fallbackReason = "no-g2-morphology";
        stats.generated = 0;
        stats.reused = 0;
        stats.pruned = 0;
        stats.unsupported = 0;
        stats.missing = 0;
        stats.invalid = 0;
        stats.entries = 0;
        return;
      }
      // La firma viene calcolata su ogni chiamata: rileva mutazioni in posto e
      // frame parzialmente ricostruiti con lo stesso tick/reference. È O(n) ma
      // senza allocazioni: ~0,02 ms a 3000 organismi, molto sotto il costo del loop.
      const signature = frameSignature(frame);
      if (lastFrame && signature === lastSignature && lastLength === frame.organismsId.length
        && lastTick === frame.tick && lastX === frame.organismsX && lastIds === frame.organismsId
        && lastStature === (frame.organismsBodyStature ?? null)
        && lastFur === (frame.organismsFurDensity ?? null)
        && lastArmor === (frame.organismsDermalArmor ?? null)
        && lastPresence === (frame.organismsMorphologyPresence ?? null)) return;

      generation++;
      lastFrame = frame;
      lastTick = frame.tick;
      lastLength = frame.organismsId.length;
      lastX = frame.organismsX;
      lastIds = frame.organismsId;
      lastStature = frame.organismsBodyStature ?? null;
      lastFur = frame.organismsFurDensity ?? null;
      lastArmor = frame.organismsDermalArmor ?? null;
      lastPresence = frame.organismsMorphologyPresence ?? null;
      lastSignature = signature;
      resetSlots();
      stats.generated = 0;
      stats.reused = 0;
      stats.pruned = 0;
      stats.unsupported = 0;
      stats.missing = 0;
      stats.invalid = 0;
      fallbackReason = null;

      if (!frameHasMorphology(frame)) {
        entries.clear();
        fallbackReason = "no-g2-morphology";
        stats.entries = 0;
        return;
      }

      const n = frame.organismsId.length;
      const presence = frame.organismsMorphologyPresence ?? null;
      for (let i = 0; i < n; i++) {
        const id = frame.organismsId[i];
        const bits = presence![i];
        if (!Number.isFinite(frame.organismsSize[i])) {
          stats.invalid++;
          if (!fallbackReason) fallbackReason = "invalid-size-data";
          continue;
        }
        if (bits === 0) {
          stats.missing++;
          if (!fallbackReason) fallbackReason = "missing-morphology-genes";
          continue;
        }
        const stature = frame.organismsBodyStature![i];
        const fur = frame.organismsFurDensity![i];
        const armor = frame.organismsDermalArmor![i];
        const invalidValue = (bits & MORPH_PRESENCE_BODY_STATURE) !== 0 && !Number.isFinite(stature)
          || (bits & MORPH_PRESENCE_FUR_DENSITY) !== 0 && !Number.isFinite(fur)
          || (bits & MORPH_PRESENCE_DERMAL_ARMOR) !== 0 && !Number.isFinite(armor);
        if (invalidValue) {
          stats.invalid++;
          if (!fallbackReason) fallbackReason = "invalid-morphology-data";
          continue;
        }
        const version = versionFor(frame, i);
        let entry = entries.get(id);
        if (entry && entry.version === version) {
          entry.lastSeen = generation;
          stats.reused++;
        } else {
          const ext: Record<string, number> = {};
          if (bits & MORPH_PRESENCE_BODY_STATURE) ext.bodyStature = frame.organismsBodyStature![i];
          if (bits & MORPH_PRESENCE_FUR_DENSITY) ext.furDensity = frame.organismsFurDensity![i];
          if (bits & MORPH_PRESENCE_DERMAL_ARMOR) ext.dermalArmor = frame.organismsDermalArmor![i];
          const phenotype = derivePhenotype({ size: frame.organismsSize[i], ext });
          const speciesId = frame.organismsSpecies ? frame.organismsSpecies[i] : 0;
          // body plan non genetico: scelta speculativa dichiarata, mai dedotta da tratti
          const bodyPlan = BODY_PLAN_CATALOG[speculativeBodyPlanId(speciesId)];
          const descriptor = generateAnatomyCached({
            phenotype,
            bodyPlan,
            seed: id,
            origin: "seeded-speculative",
          });
          const plan = partsPlanFromAnatomyDescriptor(descriptor, frame.organismsCarnivory[i]);
          entry = {
            version,
            lastSeen: generation,
            plan: plan.support.supported ? plan : null,
            unsupportedReason: plan.support.supported ? null : (plan.fallbackReason ?? "unsupported-anatomy"),
          };
          entries.set(id, entry);
          stats.generated++;
        }

        const plan = entry.plan;
        if (!plan) {
          // Diagnostica stabile anche quando la voce unsupported viene riutilizzata:
          // altrimenti il renderer vedeva solo "no-render-plan".
          stats.unsupported++;
          if (!fallbackReason) fallbackReason = entry.unsupportedReason ?? "unsupported-anatomy";
          continue;
        }
        if (plan.requiredSlots.segment > maxSlots.segment) maxSlots.segment = plan.requiredSlots.segment;
        if (plan.requiredSlots.appendage > maxSlots.appendage) maxSlots.appendage = plan.requiredSlots.appendage;
        if (plan.requiredSlots.eye > maxSlots.eye) maxSlots.eye = plan.requiredSlots.eye;
        slotsValid = true;
      }

      // Chiamate da più organismi: i piani restano ma le voci non più nel frame
      // vengono rimosse, così la cache non cresce senza limite.
      for (const [id, entry] of entries) {
        if (entry.lastSeen !== generation) {
          entries.delete(id);
          stats.pruned++;
        }
      }
      stats.entries = entries.size;
      if (!fallbackReason && entries.size === 0) fallbackReason = "no-supported-g2-plan";
    },
  };

  return source;
}
