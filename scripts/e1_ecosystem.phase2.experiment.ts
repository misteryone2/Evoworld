/**
 * E1.2 — fase multi-seed sugli scenari principali (S01, S06, S08, S09, S10)
 * più i controlli habitat a risorse scambiate (S13, S14).
 *
 * Esecuzione (12 seed × 7 scenari, 900 tick):
 *   E1_PHASE2_SEEDS=1,2,3,4,5,6,7,8,9,10,11,12 \
 *   E1_PHASE2_TICKS=900 E1_PHASE2_SAMPLE_EVERY=50 \
 *   E1_PHASE2_OUT=<path>.json \
 *   npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.phase2.experiment.ts
 *
 * L'output contiene: protocollo, risultati grezzi (senza tempi) e report
 * statistico con media/SD/min/max/IC95, distribuzioni, tassi e confronti.
 */
import { it } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPhase2Scenarios } from "../tools/e1/scenarios";
import { collectResults, resolveOutputPath, stripVariableData, writeExperimentOutput } from "../tools/e1/experiment";
import { buildPhase2Report, finalPopulation, groupByScenario } from "../tools/e1/statistics";

const DEFAULT_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const TICKS = Number(process.env.E1_PHASE2_TICKS ?? process.env.E1_TICKS ?? 900);
const SAMPLE_EVERY = Number(process.env.E1_PHASE2_SAMPLE_EVERY ?? process.env.E1_SAMPLE_EVERY ?? 50);
const SEEDS = (process.env.E1_PHASE2_SEEDS ?? DEFAULT_SEEDS.join(","))
  .split(",").map(Number).filter(Number.isFinite);
const OUT = resolveOutputPath(process.env.E1_PHASE2_OUT ?? process.env.E1_OUT ?? join(tmpdir(), "e1-phase2-results.json"));

it("E1.2 — fase multi-seed con statistiche e confronti", () => {
  const started = Date.now();
  const scenarios = buildPhase2Scenarios({ ticks: TICKS, sampleEvery: SAMPLE_EVERY, seeds: SEEDS });
  const results = collectResults(scenarios, (res) => {
    const last = res.samples[res.samples.length - 1];
    console.log(
      `${res.scenario} seed=${res.seed} ${res.completedTicks}/${res.ticks} ` +
      `finalPop ${last.population} extinctAt ${res.extinctAt} ` +
      `removed ${res.perturbationReport?.removed ?? 0} (${(res.elapsedMs / 1000).toFixed(1)}s)`,
    );
  });

  const report = buildPhase2Report(results, { ticks: TICKS, sampleEvery: SAMPLE_EVERY, seeds: SEEDS });
  const groups = groupByScenario(results);
  for (const [id, runs] of Object.entries(groups)) {
    const values = runs.map(finalPopulation);
    console.log(`${id}: n=${runs.length} finalPop ${Math.min(...values)}..${Math.max(...values)}`);
  }

  writeExperimentOutput(OUT, {
    phase: "E1.2",
    env: { TICKS, SAMPLE_EVERY, SEEDS },
    scientificReport: stripVariableData(report),
    results: stripVariableData(results),
    timing: { totalElapsedMs: Date.now() - started },
  });
  console.log(`E1_PHASE2_OUT=${OUT}`);
}, 3_000_000);
