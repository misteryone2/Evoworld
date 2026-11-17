/**
 * E1 — esperimenti ecologici riproducibili (nessuna modifica al motore).
 *
 * Esecuzione:
 *   E1_TICKS=600 E1_SEEDS=11 E1_SAMPLE_EVERY=50 E1_LONG_TICKS=1800 \
 *   npx vitest run --config vitest.experiment.config.ts scripts/e1_ecosystem.experiment.ts
 *
 * Scrive un JSON con seme, condizioni iniziali, durata, campioni e tempi reali.
 */
import { it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildScenarios, SCENARIO_IDS } from "../tools/e1/scenarios";
import { runScenario, type RunResult } from "../tools/e1/runner";

const TICKS = Number(process.env.E1_TICKS ?? 600);
const LONG_TICKS = Number(process.env.E1_LONG_TICKS ?? TICKS * 3);
const SAMPLE_EVERY = Number(process.env.E1_SAMPLE_EVERY ?? 50);
const SEEDS = (process.env.E1_SEEDS ?? "11").split(",").map(Number).filter(Number.isFinite);
const ONLY = process.env.E1_SCENARIOS?.split(",").filter((s) => SCENARIO_IDS.includes(s as never));
const OUT = process.env.E1_OUT ?? "C:/Users/matti/AppData/Local/Temp/opencode/e1-results.json";

it("E1 — scenari ecologici con seed controllato", () => {
  const scenarios = buildScenarios({ ticks: TICKS, longTicks: LONG_TICKS, sampleEvery: SAMPLE_EVERY, seeds: SEEDS })
    .filter((s) => !ONLY || ONLY.includes(s.id));
  const results: RunResult[] = [];

  for (const spec of scenarios) {
    const res = runScenario(spec);
    results.push(res);
    const first = res.samples[0];
    const last = res.samples[res.samples.length - 1];
    console.log(
      `${res.scenario} seed=${res.seed} ${res.completedTicks}/${res.ticks} ` +
      `pop ${first.population}->${last.population} species ${last.speciesAlive}/${last.speciesTotalEver} ` +
      `H ${first.shannon}->${last.shannon} births ${last.cumulativeBirths} deaths ${last.cumulativeDeaths} ` +
      `kills ${last.cumulativePredationKills} extinctAt ${res.extinctAt} (${(res.elapsedMs / 1000).toFixed(1)}s)`,
    );
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ env: { TICKS, LONG_TICKS, SAMPLE_EVERY, SEEDS }, results }, null, 1), "utf8");
  console.log(`E1_OUT=${OUT}`);
}, 3_000_000);
