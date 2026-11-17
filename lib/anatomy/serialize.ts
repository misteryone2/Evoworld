import { validateAnatomy } from "./validate";
import { ANATOMY_SCHEMA_VERSION, type AnatomyDescriptor } from "./types";
import { canonicalJson, deepFreeze } from "./util";

/** Serializzazione canonica (chiavi ordinate): stessa stringa per lo stesso contenuto. Compatibile con il salvataggio JSON. */
export function serializeAnatomy(d: AnatomyDescriptor): string {
  return canonicalJson(d);
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
  const check = validateAnatomy(parsed);
  if (!check.ok) return { ok: false, value: null, errors: check.errors };
  return { ok: true, value: deepFreeze(parsed as AnatomyDescriptor), errors: [] };
}

export { ANATOMY_SCHEMA_VERSION };
