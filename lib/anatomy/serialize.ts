import { computeExtents, withFingerprint } from "./assemble";
import { validateAnatomy } from "./validate";
import { ANATOMY_SCHEMA_VERSION, type AnatomyDescriptor, type Appendage, type Segment } from "./types";
import { canonicalJson, deepFreeze } from "./util";

/** Serializzazione canonica (chiavi ordinate): stessa stringa per lo stesso contenuto. Compatibile con il salvataggio JSON. */
export function serializeAnatomy(d: AnatomyDescriptor): string {
  return canonicalJson(d);
}

/**
 * Migrazione additiva da descrittori G2 scritti prima dell'hardening G2.1: le nuove misure geometriche
 * vengono ricalcolate dalla geometria presente e il fingerprint aggiornato. Nessun dato biologico viene inventato.
 */
function migrateLegacy(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const d = value as Record<string, unknown>;
  if (d.schemaVersion !== ANATOMY_SCHEMA_VERSION) return value;
  if (!Array.isArray(d.segments) || !Array.isArray(d.appendages) || !d.proportions || typeof d.proportions !== "object") return value;
  const p = d.proportions as Record<string, unknown>;
  if (p.bodyExtents !== undefined && p.anatomicalExtents !== undefined && d.declaredAnomalies !== undefined) return value;
  const scale = typeof p.sizeScale === "number" && Number.isFinite(p.sizeScale) ? p.sizeScale : 1;
  const derived = computeExtents(d.segments as Segment[], d.appendages as Appendage[], scale);
  const migrated = {
    ...d,
    declaredAnomalies: d.declaredAnomalies ?? [],
    proportions: { ...p, ...derived },
    locomotion: { ...(d.locomotion as Record<string, unknown>), groundClearance: derived.groundClearance },
  };
  return withFingerprint(migrated as Omit<AnatomyDescriptor, "fingerprint">);
}

export type DeserializeResult =
  | { readonly ok: true; readonly value: AnatomyDescriptor; readonly errors: readonly [] }
  | { readonly ok: false; readonly value: null; readonly errors: readonly string[] };

/** Legge e valida un descriptor salvato. Non lancia: versioni sconosciute, JSON corrotto e riferimenti incoerenti danno ok=false. */
export function deserializeAnatomy(text: string): DeserializeResult {
  if (typeof text !== "string") return { ok: false, value: null, errors: ["not-a-string"] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, value: null, errors: ["invalid-json"] };
  }
  const migrated = migrateLegacy(parsed);
  const check = validateAnatomy(migrated);
  if (!check.ok) return { ok: false, value: null, errors: check.errors };
  return { ok: true, value: deepFreeze(migrated as AnatomyDescriptor), errors: [] };
}

export { ANATOMY_SCHEMA_VERSION };
