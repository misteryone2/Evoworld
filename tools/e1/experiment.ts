/**
 * E1 — supporto agli script esperimentali: destinazione output portabile,
 * creazione delle directory e proiezione scientifica riproducibile.
 *
 * Nessuna regola biologica viene toccata: queste funzioni gestiscono solo
 * logger, file system e serializzazione dei risultati dell'harness.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ScenarioSpec } from "./runner";
import { runScenario, type RunResult } from "./runner";

/** Destinazione predefinita portabile: temp di sistema, mai un percorso assoluto utente. */
export function resolveOutputPath(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : join(tmpdir(), "e1-results.json");
}

/** Scrive il JSON creando le directory genitrici mancanti. */
export function writeExperimentOutput(path: string, payload: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(payload, null, 1), "utf8");
}

/** Esegue una lista di scenari in ordine e restituisce i risultati. */
export function collectResults(scenarios: ScenarioSpec[], onResult?: (result: RunResult) => void): RunResult[] {
  const results: RunResult[] = [];
  for (const spec of scenarios) {
    const result = runScenario(spec);
    results.push(result);
    onResult?.(result);
  }
  return results;
}

const VARIABLE_KEYS = new Set(["elapsedMs", "durationMs", "wallTimeMs", "timestamp", "generatedAt"]);

/**
 * Rimuove i campi non scientifici (tempi di esecuzione, timestamp) per poter
 * confrontare due output ottenuti in condizioni identiche. Tutti gli altri
 * campi — inclusi seed, parametri, campioni e statistiche — sono preservati.
 */
export function stripVariableData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVariableData);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (VARIABLE_KEYS.has(key)) continue;
      out[key] = stripVariableData(item);
    }
    return out;
  }
  return value;
}
