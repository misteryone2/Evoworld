/**
 * E1.3 — stampa i confronti appaiati di un output della fase 2 già prodotto.
 *
 *   E1_PAIRED_INPUT=<results.json> E1_PAIRED_OUT=<report.json> \
 *   npx vitest run --config vitest.experiment.config.ts scripts/e1_paired_report.experiment.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { it } from "vitest";
import { buildPhase2Report } from "../tools/e1/statistics";
import type { RunResult } from "../tools/e1/runner";

it("E1.3 — report appaiato", () => {
  const input = process.env.E1_PAIRED_INPUT;
  if (!input) throw new Error("E1_PAIRED_INPUT mancante");
  const raw = JSON.parse(readFileSync(resolve(input), "utf8")) as {
    env: { TICKS: number; SAMPLE_EVERY: number; SEEDS: number[] };
    results: RunResult[];
  };
  const report = buildPhase2Report(raw.results, {
    ticks: raw.env.TICKS,
    sampleEvery: raw.env.SAMPLE_EVERY,
    seeds: raw.env.SEEDS,
  });
  const out = process.env.E1_PAIRED_OUT;
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report.pairedComparisons, null, 2) + "\n", "utf8");
  }
  for (const p of report.pairedComparisons) {
    console.log(`${p.label}: n=${p.validPairs} mean=${p.meanDifference} sd=${p.sd} ci95=${JSON.stringify(p.ci95)}`);
  }
  if (!out) console.log(JSON.stringify(report.pairedComparisons, null, 2));
}, 3_000_000);
