import { computeExtents, withFingerprint } from "./assemble";
import { checkAnatomyEnvelope, validateAnatomy } from "./validate";
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
  // G-REV-01: nessun calcolo geometrico prima del gate strutturale. Il gate "envelope"
  // ammette proporzioni incomplete (legacy), ma rifiuta vettori/array corrotti.
  const envelope = checkAnatomyEnvelope(value, false);
  if (!envelope.ok) return value;
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
  try {
    // Prima di ANY migrazione: struttura geometrica finita e collezioni utilizzabili.
    const envelope = checkAnatomyEnvelope(parsed, false);
    if (!envelope.ok) return { ok: false, value: null, errors: envelope.errors };
    const migrated = migrateLegacy(parsed);
    const check = validateAnatomy(migrated);
    if (!check.ok) return { ok: false, value: null, errors: check.errors };
    return { ok: true, value: deepFreeze(migrated as AnatomyDescriptor), errors: [] };
  } catch (error) {
    return { ok: false, value: null, errors: [`deserialization-error:${String(error)}`] };
  }
}

export { ANATOMY_SCHEMA_VERSION };
