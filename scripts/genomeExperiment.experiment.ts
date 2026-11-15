/**
 * v1.11.0 — Confronto evolutivo: baseline (v1.10, senza geni avanzati) contro v1.11.0 (geni avanzati attivi).
 * Stessi semi, stesso mondo, stessa popolazione iniziale. Si esegue a richiesta (non fa parte della suite veloce):
 *   GENOME_TICKS=4000 GENOME_SEEDS=11,12,13,14,15 npx vitest run --config vitest.experiment.config.ts
 * Scrive un riepilogo JSON in GENOME_OUT (predefinito /tmp/genome-experiment.json). Non cambia nulla della simulazione.
 */
import { it } from "vitest";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { World } from "../simulation/core/world";
import { geneticDistance, advancedGeneStats, TRAIT_RANGES } from "../simulation/biology/genome";
import { GENE_CATALOG } from "../simulation/biology/geneRegistry";
import { Random } from "../simulation/core/random";
import type { Genome } from "../types";

const TICKS = Number(process.env.GENOME_TICKS ?? 4000);
const SEEDS = (process.env.GENOME_SEEDS ?? "11,12,13,14,15").split(",").map(Number);
const SIZE = Number(process.env.GENOME_SIZE ?? 256);
const POP = Number(process.env.GENOME_POP ?? 150);
const EVERY = Number(process.env.GENOME_EVERY ?? 500);
/**
 * Modalità a blocchi (opzionale): con GENOME_STATE_DIR e GENOME_CHUNK ogni esecuzione avanza di al massimo GENOME_CHUNK
 * tick, salva lo snapshot del mondo e riprende da lì alla chiamata successiva (il salvataggio è deterministico).
 */
const STATE_DIR = process.env.GENOME_STATE_DIR;
const CHUNK = Number(process.env.GENOME_CHUNK ?? Infinity);
const OUT = process.env.GENOME_OUT ?? "/tmp/genome-experiment.json";
/** Condizioni da eseguire (predefinito entrambe): utile per spezzare le esecuzioni lunghe. */
const CONDITIONS = (process.env.GENOME_CONDITIONS ?? "baseline,advanced").split(",") as ("baseline" | "advanced")[];

function meanDistance(genomes: Genome[], rng: Random): number {
  if (genomes.length < 2) return 0;
  let total = 0;
  const pairs = Math.min(300, genomes.length * 3);
  for (let k = 0; k < pairs; k++) {
    const a = genomes[rng.intRange(0, genomes.length - 1)];
    const b = genomes[rng.intRange(0, genomes.length - 1)];
    total += geneticDistance(a, b);
  }
  return total / pairs;
}

function sample(w: World, label: "baseline" | "advanced") {
  const gs = w.organisms.map((o) => o.genome);
  const n = gs.length;
  const traitMean: Record<string, number> = {};
  for (const t of Object.keys(TRAIT_RANGES)) traitMean[t] = n ? gs.reduce((s, g) => s + (g as never)[t], 0) / n : 0;
  const stats = label === "advanced" && n ? advancedGeneStats(gs) : null;
  const geneSummary: Record<string, { mean: number; sd: number }> = {};
  if (stats) for (const d of GENE_CATALOG) geneSummary[d.id] = { mean: +stats[d.id].mean.toFixed(3), sd: +stats[d.id].stdDev.toFixed(3) };
  const s = w.getStats();
  return {
    tick: w.tick,
    population: n,
    speciesAlive: s.speciesAlive,
    speciesTotalEver: s.speciesTotalEver,
    carnivoreFraction: n ? +(gs.filter((g) => g.carnivory >= 0.35).length / n).toFixed(3) : 0,
    meanDistance: +meanDistance(gs, new Random(w.tick + 1)).toFixed(4),
    traitMean: Object.fromEntries(Object.entries(traitMean).map(([k, v]) => [k, +v.toFixed(3)])),
    genes: geneSummary,
  };
}

type Sample = ReturnType<typeof sample>;
interface RunState { snapshot: unknown; series: Sample[]; extinctAt: number | null; seconds: number; done: boolean }

function runOne(seed: number, label: "baseline" | "advanced") {
  const path = STATE_DIR ? `${STATE_DIR}/${label}_${seed}.json` : null;
  let state: RunState | null = path && existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as RunState) : null;
  if (state?.done) return state;
  const t0 = Date.now();
  const w = state
    ? World.fromSnapshot(state.snapshot as never)
    : new World({ width: SIZE, height: SIZE, seed }, POP, { enableAdvancedGenome: label === "advanced" });
  const series: Sample[] = state ? state.series : [sample(w, label)];
  let extinctAt = state ? state.extinctAt : null;
  const stopAt = Math.min(TICKS, w.tick + CHUNK);
  while (w.tick < stopAt) {
    w.step();
    if (extinctAt === null && w.organisms.length === 0) extinctAt = w.tick;
    if (w.tick % EVERY === 0) series.push(sample(w, label));
    if (w.organisms.length === 0) { series.push(sample(w, label)); break; }
  }
  const done = w.tick >= TICKS || w.organisms.length === 0;
  state = { snapshot: done ? null : w.toSnapshot(), series, extinctAt, seconds: (state?.seconds ?? 0) + (Date.now() - t0) / 1000, done };
  if (path) { mkdirSync(STATE_DIR!, { recursive: true }); writeFileSync(path, JSON.stringify(state)); }
  return state;
}

it("confronto baseline vs v1.11.0", () => {
  const result: Record<string, unknown[]> = {};
  for (const seed of SEEDS) {
    for (const label of CONDITIONS) {
      const st = runOne(seed, label);
      const last = st.series[st.series.length - 1];
      result[`${label}/seed${seed}`] = [{ extinctAt: st.extinctAt, seconds: +st.seconds.toFixed(1), final: last, series: st.series, done: st.done }];
      console.log(`${label} seed${seed} tick ${last.tick}/${TICKS}${st.done ? "" : " (in corso)"}: pop ${last.population} species ${last.speciesAlive}/${last.speciesTotalEver} extinct ${st.extinctAt} carn ${last.carnivoreFraction} dist ${last.meanDistance} (${st.seconds.toFixed(0)}s)`);
    }
  }
  writeFileSync(OUT, JSON.stringify({ ticks: TICKS, seeds: SEEDS, size: SIZE, population: POP, result }, null, 1));
}, 3_000_000);
