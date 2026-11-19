// IV1-B — analisi post-run del dataset grezzo.
// Legge docs/research/iv1b/dataset.raw.json e produce analysis.json + TABLES.md.
// Solo tramutazione dei dati misurati: nessuna stima nascosta, nessun dato inventato.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const outDir = process.env.IV1B_OUT_DIR ?? join(root, "docs", "research", "iv1b");
const input = process.env.IV1B_DATASET ?? join(outDir, "dataset.raw.json");
const dataset = JSON.parse(readFileSync(input, "utf8"));

const { populations, configs, seeds } = dataset.protocol;
const aggs = dataset.aggregates;
const get = (pop, cfg) => aggs.find((a) => a.population === pop && a.config === cfg);
// R1: la finestra misurata e' esplicita nel dataset v2; per compatibilita' con
// il v1 si accetta il fallback a measuredWallMs dei singoli run.
const measuredWall = (pop, cfg) => {
  const agg = get(pop, cfg);
  if (agg?.measuredWall?.mean != null) return agg.measuredWall.mean;
  const xs = dataset.runs.filter((r) => r.population === pop && r.config === cfg).map((r) => r.measuredWallMs ?? r.wallMs);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};
const f = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : Number(v).toFixed(d));
const ratio = (a, b) => (a === null || b === null || b === 0 ? null : a / b);
const meanOf = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// --- confronto per popolazione -------------------------------------------------
const comparisons = populations.map((pop) => {
  const B = get(pop, "baseline");
  const R = get(pop, "rendering");
  const O = get(pop, "observability");
  const I = get(pop, "integrated");
  if (!B || !R || !O || !I) return null;
  const tick = (a) => a.tick?.mean ?? null;
  const wall = (a) => measuredWall(pop, a.config);
  const render = (a) => a.render?.mean ?? null;
  const b = tick(B), r = tick(R), o = tick(O), i = tick(I);
  const wb = wall(B), wr = wall(R), wo = wall(O), wi = wall(I);
  const rb = render(B), rr = render(R), ri = render(I);
  const additiveExpected = r + o - b;
  const multiplicativeExpected = b === 0 ? null : (r * o) / b;
  return {
    population: pop,
    tickMs: { baseline: b, rendering: r, observability: o, integrated: i },
    wallMs: { baseline: wb, rendering: wr, observability: wo, integrated: wi },
    renderMs: { baseline: rb, rendering: rr, integrated: ri },
    overhead: {
      renderingVsBaseline: ratio(r, b),
      observabilityVsBaseline: ratio(o, b),
      integratedVsBaseline: ratio(i, b),
      integratedWallVsBaseline: ratio(wi, wb),
    },
    adaptiveRenderSpeedup: ratio(rb, rr),
    adaptiveRenderDeltaMs: rb === null || rr === null ? null : rb - rr,
    interaction: {
      additiveExcessMs: i === null || !Number.isFinite(additiveExpected) ? null : i - additiveExpected,
      additiveExpectedMs: Number.isFinite(additiveExpected) ? additiveExpected : null,
      multiplicativeRatio: ratio(i, multiplicativeExpected),
      multiplicativeExpectedMs: multiplicativeExpected,
    },
    adaptiveCounters: {
      updated: I.rendering.updated,
      skipped: I.rendering.skipped,
      culled: I.rendering.culled,
      near: I.rendering.lodNear,
      far: I.rendering.lodFar,
      droppedParts: I.rendering.droppedParts,
    },
    events: {
      recorded: O.recordedEvents,
      lost: O.lostEvents,
      measuredTicks: O.measuredTicks ?? dataset.protocol.measuredTicks,
      recordedPerTick: O.recordedPerTick ?? null,
      perSecond: O.eventsPerSecond?.mean ?? null,
      flushMs: O.flushMs?.mean ?? null,
      bufferKB: O.bufferKB,
      integratedRecorded: I.recordedEvents,
      integratedLost: I.lostEvents,
      integratedPerTick: I.recordedPerTick ?? null,
      integratedPerSecond: I.eventsPerSecond?.mean ?? null,
    },
    memory: {
      heapGrowthMeasuredKB: {
        baseline: B.heapGrowthMeasuredKB?.mean ?? B.heapGrowthKB?.mean ?? null,
        rendering: R.heapGrowthMeasuredKB?.mean ?? R.heapGrowthKB?.mean ?? null,
        observability: O.heapGrowthMeasuredKB?.mean ?? O.heapGrowthKB?.mean ?? null,
        integrated: I.heapGrowthMeasuredKB?.mean ?? I.heapGrowthKB?.mean ?? null,
      },
      heapSlopeKBPerTick: {
        baseline: B.heapSlopeKBPerTick?.mean ?? null,
        rendering: R.heapSlopeKBPerTick?.mean ?? null,
        observability: O.heapSlopeKBPerTick?.mean ?? null,
        integrated: I.heapSlopeKBPerTick?.mean ?? null,
      },
    },
  };
}).filter(Boolean);

// --- R1: riconciliazione costo/evento ----------------------------------------
// Numeratore: extra world.step() per tick (O - B), media sui 5 seed.
// Denominatore: eventi registrati per tick nella STESSA cella (O), finestra misurata.
const costPerEvent = comparisons.map((c) => {
  const overheadMs = c.tickMs.observability - c.tickMs.baseline;
  const perTick = c.events.recordedPerTick;
  const totalTicks = (dataset.protocol.seeds?.length ?? 0) * (dataset.protocol.measuredTicks ?? 0);
  const crossCheck = totalTicks > 0 ? c.events.recorded / totalTicks : null;
  return {
    population: c.population,
    stepOverheadMs: overheadMs,
    eventsRecordedMeasuredWindow: c.events.recorded,
    measuredTicksPerSeed: c.events.measuredTicks,
    totalMeasuredTicks: totalTicks,
    eventsPerTick: perTick,
    eventsPerTickCrossCheck: crossCheck,
    microsecondsPerEvent: overheadMs != null && perTick ? (overheadMs * 1000) / perTick : null,
  };
});

// --- esponente di scala (power law N^b) via regressione log-log ---------------
function scaleExponent(values) {
  const pts = values.map((v, idx) => [Math.log(populations[idx]), Math.log(v)])
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] > 0);
  const n = pts.length;
  if (n < 2) return null;
  const mx = meanOf(pts.map((p) => p[0]));
  const my = meanOf(pts.map((p) => p[1]));
  let num = 0, den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  return den === 0 ? null : num / den;
}
const scaling = Object.fromEntries(configs.map((cfg) => [cfg, {
  tickExponent: scaleExponent(populations.map((p) => get(p, cfg)?.tick?.mean ?? NaN)),
  renderExponent: scaleExponent(populations.map((p) => get(p, cfg)?.render?.mean ?? NaN)),
  wallExponent: scaleExponent(populations.map((p) => get(p, cfg)?.measuredWall?.mean ?? get(p, cfg)?.wall?.mean ?? NaN)),
}]));

// --- verifica coerenza: le fasi non toccate dovrebbero essere uguali ---------
const sanity = populations.map((pop) => {
  const all = [get(pop, "baseline"), get(pop, "rendering"), get(pop, "observability"), get(pop, "integrated")].filter(Boolean);
  if (!all.length) return null;
  const spread = (key) => Math.max(...all.map((a) => a[key]?.mean ?? 0)) - Math.min(...all.map((a) => a[key]?.mean ?? 0));
  return {
    population: pop,
    frameBuildSpreadMs: spread("frameBuild"),
    syncSpreadMs: spread("sync"),
    populationSpread: Math.max(...all.map((a) => a.initialPopulation ?? 0)) - Math.min(...all.map((a) => a.initialPopulation ?? 0)),
  };
}).filter(Boolean);

writeFileSync(join(outDir, "analysis.json"), JSON.stringify({
  schema: "evoworld.iv1b.analysis.v2",
  source: "dataset.raw.json",
  seeds,
  metricWindows: dataset.protocol?.metricWindows ?? {
    note: "dataset v1: solo tick e measuredWallMs esclusero il warm-up; il v2 misura esplicitamente tutte le finestre",
  },
  writer: dataset.protocol?.writer ?? "sintetico: nessun I/O su disco",
  reconciliation: {
    previousError: "Il report IV1-B divideva 36.300.058 eventi per 20 tick invece che per 5 seed x 20 tick = 100, ottenendo 363.001 eventi/tick e 6,4 us/evento.",
    correction: "Il denominatore corretto e' il numero di tick misurati della stessa cella. Con 363.000,58 eventi/tick il costo e' ~1,26 us/evento; la finestra misurata v2 elimina anche il contributo del warm-up.",
    costPerEvent,
  },
  comparisons, scaling, sanity,
}, null, 2), "utf8");

// --- TABLES.md ----------------------------------------------------------------
const L = [];
L.push("# IV1-B — Tabelle comparative (generate da `dataset.raw.json`)");
L.push("");
L.push(`Semi: ${seeds.join(", ")}. Ogni cella = media su ${seeds.length} run × ${dataset.protocol.measuredTicks} tick misurati (${dataset.protocol.warmupTicks} warm-up esclusi).`);
L.push("");
L.push("## 1. Tempo medio per tick (ms) e rapporti");
L.push("");
L.push("| N | baseline | rendering | observability | integrated | R/B | O/B | I/B | I/(R·O/B) |");
L.push("|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const c of comparisons) {
  L.push(`| ${c.population} | ${f(c.tickMs.baseline)} | ${f(c.tickMs.rendering)} | ${f(c.tickMs.observability)} | ${f(c.tickMs.integrated)} | ${f(c.overhead.renderingVsBaseline)}× | ${f(c.overhead.observabilityVsBaseline)}× | ${f(c.overhead.integratedVsBaseline)}× | ${f(c.interaction.multiplicativeRatio)}× |`);
}
L.push("");
L.push("## 2. Fase di rendering e adaptive");
L.push("");
L.push("| N | render baseline (ms) | render adaptive (ms) | speedup | updated | skipped | culled | near | far | droppedParts |");
L.push("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const c of comparisons) {
  const a = c.adaptiveCounters;
  L.push(`| ${c.population} | ${f(c.renderMs.baseline)} | ${f(c.renderMs.rendering)} | ${f(c.adaptiveRenderSpeedup)}× | ${f(a.updated, 0)} | ${f(a.skipped, 0)} | ${f(a.culled, 0)} | ${f(a.near, 0)} | ${f(a.far, 0)} | ${f(a.droppedParts, 0)} |`);
}
L.push("");
L.push("## 3. Observability");
L.push("");
L.push("| N | eventi registrati | persi | eventi/s | flush (ms) | buffer max (KB, stimato) | oscillazione O→I (eventi/s) |");
L.push("|---:|---:|---:|---:|---:|---:|---:|");
for (const c of comparisons) {
  const e = c.events;
  const drift = ratio(e.integratedPerSecond, e.perSecond);
  L.push(`| ${c.population} | ${f(e.recorded, 0)} | ${f(e.lost, 0)} | ${f(e.perSecond, 0)} | ${f(e.flushMs)} | ${f(e.bufferKB, 1)} | ${f(drift)}× |`);
}
L.push("");
L.push("> Il buffer è una **stima** (`retainedMax × 582 B/evento`); `retainedMax` è misurato, i byte no.");
L.push("");
L.push("> `flush (ms)` misura il **writer sintetico**: throughBatch scorre gli eventi e conta le proprietà, senza scrittura su disco. Non è un throughput di persistenza reale.");
L.push("");
L.push("## 4. Memoria");
L.push("");
L.push("| N | Δheap baseline (KB) | Δheap rendering | Δheap observability | Δheap integrated | pendenza O (KB/tick) | pendenza I (KB/tick) |");
L.push("|---:|---:|---:|---:|---:|---:|---:|");
for (const c of comparisons) {
  const m = c.memory;
  L.push(`| ${c.population} | ${f(m.heapGrowthMeasuredKB.baseline, 0)} | ${f(m.heapGrowthMeasuredKB.rendering, 0)} | ${f(m.heapGrowthMeasuredKB.observability, 0)} | ${f(m.heapGrowthMeasuredKB.integrated, 0)} | ${f(m.heapSlopeKBPerTick.observability, 0)} | ${f(m.heapSlopeKBPerTick.integrated, 0)} |`);
}
L.push("");
L.push(`> I delta heap grezzi includono effetti GC: valori negativi sono possibili e vanno letti come indicatori, non come conteggi di allocazione.`);
L.push("");
L.push("## 5. Scala (esponente b in `tempo = a · N^b`)");
L.push("");
L.push("| configurazione | b (tick) | b (render) | b (wall) |");
L.push("|---|---:|---:|---:|");
for (const cfg of configs) {
  const s = scaling[cfg];
  L.push(`| ${cfg} | ${f(s.tickExponent, 3)} | ${f(s.renderExponent, 3)} | ${f(s.wallExponent, 3)} |`);
}
L.push("");
L.push("## 6. Coerenza delle fasi non influenzate");
L.push("");
L.push("| N | spread buildFrame (ms) | spread sync (ms) | spread popolazione iniziale |");
L.push("|---:|---:|---:|---:|");
for (const s of sanity) {
  L.push(`| ${s.population} | ${f(s.frameBuildSpreadMs, 3)} | ${f(s.syncSpreadMs, 3)} | ${s.populationSpread} |`);
}
L.push("");
L.push("## 7. Scomposizione delle fasi (ms/tick, media 5 seed)");
L.push("");
L.push("Il `wall` è il solo intervallo misurato (warm-up escluso). `step` è `world.step()`; le altre colonne sono fasi separate misurate nello stesso loop.");
L.push("");
L.push("| N | cfg | step (ms) | buildFrame | syncSource | render | wall |");
L.push("|---:|---|---:|---:|---:|---:|---:|");
for (const pop of populations) {
  for (const cfg of configs) {
    const a = get(pop, cfg);
    if (!a) continue;
    const w = measuredWall(pop, cfg);
    const step = a.tick?.mean ?? null;
    L.push(`| ${pop} | ${cfg} | ${f(step)} | ${f(a.frameBuild?.mean, 3)} | ${f(a.sync?.mean, 3)} | ${f(a.render?.mean)} | ${f(w)} |`);
  }
}
L.push("");

L.push("## 8. Riconciliazione costo per evento (R1)");
L.push("");
L.push("Numeratore: extra `world.step()` per tick nella cella observability (`O − B`). Denominatore: eventi registrati per tick nella **stessa cella**, finestra misurata dopo warm-up.");
L.push("");
L.push("| N | overhead step (ms/tick) | eventi registrati (finestra misurata) | tick misurati totali | eventi/tick | us/evento |");
L.push("|---:|---:|---:|---:|---:|---:|");
for (const c of costPerEvent) {
  L.push(`| ${c.population} | ${f(c.stepOverheadMs)} | ${f(c.eventsRecordedMeasuredWindow, 0)} | ${c.totalMeasuredTicks} | ${f(c.eventsPerTick, 0)} | ${f(c.microsecondsPerEvent, 3)} |`);
}
L.push("");
L.push("> Correzione R1: il report IV1-B dichiarava 71 106 eventi/tick e 6,4 us/evento, valori non riproducibili dal dataset. Il denominatore corretto e' 5 seed x 20 tick = 100: con i contatori cumulativi v1 si ottengono 363 000,58 eventi/tick e 1,26 us/evento a 10 000. Il dataset v2 misura direttamente la finestra, rimuovendo anche il warm-up.");
L.push("");

writeFileSync(join(outDir, "TABLES.md"), L.join("\n"), "utf8");
console.log("IV1B_ANALYSIS=" + JSON.stringify({ comparisons: comparisons.length, outDir }));
