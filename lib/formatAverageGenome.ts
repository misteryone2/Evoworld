import type { Genome, TraitName } from "../types";
import { EXTENDED_GENES } from "../simulation/biology/geneRegistry";
import { TRAIT_LABELS } from "./traitLabels";

/**
 * G3 QA — `averageGenome` contiene i 13 tratti storici come numeri e, dal
 * genoma v1.11, un campo `ext` che è un oggetto `Record<string, number>`.
 * `StatsPanel` lo passava a `toFixed()` come se fosse un numero: il pannello
 * si rompeva appena un mondo moderno aveva geni estesi (tipicamente dopo la
 * morte/selezione di organismi con `ext`). Questa funzione pure converte
 * entrambi i livelli in righe formattate, senza toccare la simulazione.
 */
export interface GenomeRow {
  key: string;
  label: string;
  value: string;
}

const EXTENDED_LABELS = new Map(EXTENDED_GENES.map((gene) => [gene.key, `${gene.id} · ${gene.key}`]));

export function formatAverageGenome(average: Genome | null | undefined): GenomeRow[] {
  if (!average) return [];
  const rows: GenomeRow[] = [];
  for (const [key, value] of Object.entries(average)) {
    if (key === "ext" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [extKey, extValue] of Object.entries(value as Record<string, unknown>)) {
        if (typeof extValue === "number" && Number.isFinite(extValue)) {
          rows.push({
            key: `ext.${extKey}`,
            label: EXTENDED_LABELS.get(extKey) ?? extKey,
            value: extValue.toFixed(2),
          });
        }
      }
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      rows.push({ key, label: TRAIT_LABELS[key as TraitName] ?? key, value: value.toFixed(2) });
    }
  }
  return rows;
}
