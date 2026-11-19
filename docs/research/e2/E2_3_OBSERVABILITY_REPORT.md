# E2.3 — Ecological Observability: report

**Repository:** `misteryone2/Evoworld`
**Branch:** `research/e2-ecosystem-dynamics` (only branch modified)
**Date:** 2026-11-19
**Runtime:** Node `v22.14.0`, V8 `12.4.254.21-node.22`
**Overall classification:** **TECHNICALLY VALIDATED** for the observation
capacity; **NO new ecological conclusion has been produced**.

> User constraint honored verbatim: *"Non produrre nuove conclusioni ecologiche
> prima di aver costruito e verificato la capacità di osservare direttamente i
> fenomeni."* This deliverable builds and verifies that capacity, then stops
> for independent review.

---

## A. Initial state

| Item | Value |
|---|---|
| Repository | `misteryone2/Evoworld` |
| Working branch | `research/e2-ecosystem-dynamics` |
| HEAD before intervention | `7df101511176ef57d0ab170df52fd64bcccd1968` |
| Working tree before intervention | clean |
| `main` / `origin/main` | `d330c12f345ab26ab7405b908c729e2e2f6bcc22` (unchanged) |
| `origin/research/e2-ecosystem-dynamics` | same as pre-intervention HEAD |
| Files modified outside filone E | none |
| `tools/e1/runner.ts` | untouched (E1 compatibility preserved) |

All pre-existing files were treated as other agents' work: changes are
additive or narrowly scoped to optional trailing parameters with no-op default.

---

## B. P0 engine audit and classification

The audit was read-only and identified the real mechanisms and the exact
instrumentation points. Classification legend:

- **REAL EVENT** — a discrete engine transition; now emitted at the real point.
- **STATE** — value read from already-computed engine state, not an event.
- **AGGREGATE** — periodical summary; emitted as a separate snapshot type.
- **INFERENCE** — requires external assumptions; not emitted.
- **NON OBSERVABLE** — no engine mechanism or branch exists.

| Phenomenon | Real mechanism / source | Classification before E2.3 | Classification after E2.3 |
|---|---|---|---|
| Organism generation (`tick++`) | `World.step()` | STATE only (`getStats().tick`) | STATE + `ECOSYSTEM_SNAPSHOT.completedTicks` |
| Individual births | `reproduceOrganisms()` | AGGREGATE (`births`) only | **REAL EVENT** `REPRODUCTION`, with parent IDs and mode |
| Interactions / collisions | `World.step()` collision phase; `areTouching()` | not observable individually | **NON OBSERVABLE** as individual events; collision participation affects hunt/mate conditions but no collision event is emitted |
| Predation | `huntPrey()` | AGGREGATE (`predationKills`) only | **REAL EVENT** `HUNT_ATTEMPT` (one record per attempt) + correlated `DEATH` |
| Hunt success / failure | `rng.chance(successChance)` in `huntPrey()` | not observable | **REAL EVENT** via `outcome`; typed *views* `HUNT_SUCCESS`/`HUNT_FAILURE`/`PREDATION` (no duplicate records) |
| Mortality causes | `isDying()` predicates and settlement draw | AGGREGATE (`deaths`, mixed); `predationKills` excluded | **REAL EVENT** `DEATH` with branch-derived `cause`: `PREDATION`, `STARVATION`, `OLD_AGE`, `STARVATION|OLD_AGE`, `ENVIRONMENT_SETTLEMENT`, `UNKNOWN` |
| Disease mortality | none | — | **NON OBSERVABLE** (`DISEASE` never emitted) |
| Energy transfer | `predator.energy += energyGained`, feeding `gained`, reproduction costs | no individual ledger | payload fields on canonical events + `DERIVED` `energyLedger()` projection; not a closed conservation ledger |
| Vegetation resource | `Planet.stepCellOneTick()` / `catchUpCell()` | aggregate cells only | **REAL EVENT** `RESOURCE_REGENERATION` (`mode: active`/`catchup`) and `RESOURCE_SNAPSHOT` |
| Vegetable consumption | `feedOrganisms()` `gained > 0` | no per-organism flow | **REAL EVENT** `RESOURCE_CONSUMPTION` at the real gain point |
| Vegetation depletion | region-level loop in `feedOrganisms()` | only global deltas | **REAL EVENT** `RESOURCE_DEPLETION` per affected cell, with `entityIds: []` (no fabricated attribution) |
| Hunger | `energy < HUNT_HUNGER_THRESHOLD`, `energy <= 0` | not observable | observed as payload state (`predatorEnergyBefore`, `energy`, `energyDeath`) on real events; no standalone "hunger event" invented |
| Parameter / trait updates | genome inheritance + mutation in `reproduction.ts` | no parent→offspring map | parentage and mode recorded on `REPRODUCTION`; **trait values remain STATE**, mutation attribution stays **INFERENCE** (not emitted) |
| Speciation | `speciation.ts` every 200 ticks | aggregate counters | **STATE** in snapshots; no fake "speciation event" |
| Selection vs drift | differential survival/reproduction | **INFERENCE** | **INFERENCE** — still requires external controls; not produced |

The pre-existing audit `E2_0_ENGINE_ECOLOGY_AUDIT.md` remains the reference for
anomalies A01–A12; this work neither fixes nor hides them.

---

## C. Observability gaps closed and remaining

Closed: individual hunt attempts with identities and outcome; predator/prey
species pairing; correlated predation deaths; separate starvation/age/
settlement causes; individual energy gain/cost fields; per-organism vegetation
gain; per-cell depletion; active/catch-up regeneration; parentage and birth
mode; periodic ecosystem/resource snapshots; run-level provenance and hashes.

Remaining: no collision events, no sub-tick state, no individual energy
conservation, no production-vs-regeneration biological distinction, no global
vegetation stock over unmaterialized chunks, no disease branch, no individual
mutation event, no counterfactual RNG branch. These are recorded as
`NON_EVALUABLE` or `INFERRED` in
`docs/research/e2/E2_3_EVENT_SCHEMA.md` §7 — never filled with estimates.

---

## D. Architecture implemented

1. **Pure core module** `simulation/ecology/observability.ts`: event types,
   required-field validation, frozen immutable records, deterministic IDs,
   passive sink interface, `NULL_EVENT_SINK`, `InMemoryEventSink`, canonical
   JSONL serialization, explicit `filterEvents()`, typed hunt views, `DERIVED`
   energy ledger and `OBSERVED` food web. No Node dependency inside `simulation/`.
2. **Additive engine hooks** with optional trailing `sink` parameters. Default
   is `NULL_EVENT_SINK`; no new RNG call and no formula/order change.
3. **Passive policy**: critical types (`HUNT_ATTEMPT`, `DEATH`,
   `REPRODUCTION`, `RESOURCE_CONSUMPTION`) are never sampled or silently
   dropped; only non-critical types can be sampled/buffered, with a separate
   deterministic RNG stream and explicit `PARTIAL` completeness.
4. **Snapshots** emitted from `World.step()` at a configurable interval;
   `ECOSYSTEM_SNAPSHOT` and `RESOURCE_SNAPSHOT` keep aggregate and individual
   levels strictly separated.
5. **Dedicated runner** `tools/e2/observabilityRunner.ts`: manifest, config
   hash, run, validation, event hash and reproducibility comparison; does not
   touch E1 or `World.fromSnapshot()` options.
6. **Pipeline** `tools/e2/observabilityPipeline.ts`: aggregate → validate →
   separate snapshots → correlate → export through the existing E2 dataset
   writer → manifest/hash → integrity verification.
7. **Pilot** `scripts/e2_observability_pilot.experiment.ts`: technical checks
   only, with a machine-readable report and reproducibility comparisons.

---

## E. Files and changes

| File | Change |
|---|---|
| `simulation/ecology/observability.ts` | new: schema v1, sink, logger, validation, views, ledger, food web, filters |
| `simulation/ecology/predation.ts` | optional sink; one `HUNT_ATTEMPT` per real attempt; correlated predation `DEATH` inside the success branch |
| `simulation/ecology/feeding.ts` | optional tick/sink; `RESOURCE_CONSUMPTION` at real `gained > 0`; `RESOURCE_DEPLETION` at real cell decrease |
| `simulation/evolution/reproduction.ts` | optional tick/sink; `REPRODUCTION` with parentage, mode, measured costs |
| `simulation/planet/planet.ts` | optional sink in `update()`/`stepCellOneTick()`/`catchUpCell()`; `RESOURCE_REGENERATION` at real stock change |
| `simulation/core/world.ts` | sink storage + `setEventSink()`; branch-derived natural/settlement `DEATH`; snapshot emission; sink pass-through; sink reset in `fromSnapshot()` |
| `tools/e2/observabilityRunner.ts` | new: manifest/run/validation/hash/comparison |
| `tools/e2/observabilityPipeline.ts` | new: aggregation, export, integrity verification |
| `tests/e2/observability.test.ts` | new: 9 schema/logger/view tests |
| `tests/e2/observability_engine.test.ts` | new: 9 engine-passivity, event, reproducibility and export tests |
| `tests/e2/observability_performance.test.ts` | new: 1 repeated-trial overhead measurement |
| `scripts/e2_observability_pilot.experiment.ts` | new: technical pilot |
| `docs/research/e2/E2_3_EVENT_SCHEMA.md` | new: normative schema and protocol |
| `docs/research/e2/E2_3_OBSERVABILITY_REPORT.md` | new: this report |

Not modified: `tools/e1/**`, `tests/e1/**`, `main`, other branches, engine
constants, biological formulas or RNG order.

---

## F. Tests actually executed

Commands were run from `Evoworld-git` with Node `v22.14.0` on `PATH`.
`VITE_CONFIG_NATIVE_IGNORE_WARNING=true` suppresses a Vite config-loader
warning only; it does not alter tests.

| Command | Outcome |
|---|---|
| `npx tsc --noEmit --pretty false` | **PASS**, exit 0, no diagnostics |
| `npx vitest run tests/e2/observability.test.ts tests/e2/observability_engine.test.ts tests/e2/observability_performance.test.ts --reporter=verbose` | **PASS**, 19/19 tests, exit 0 |
| `npx vitest run tests/e2/observability_performance.test.ts --reporter=verbose` (after strengthening to 7 trials) | **PASS**, 1/1, exit 0 |
| `npx vitest run --reporter=verbose` (full suite, E2.3 tree) | 858 passed, 1 skipped, **10 failed**, exit 1 |
| `npx vitest run --reporter=dot` (full suite, untouched baseline worktree at `7df1015`) | 839 passed, 1 skipped, **the same 10 failed**, exit 1 |
| `npx vitest run --config vitest.experiment.config.ts scripts/e2_observability_pilot.experiment.ts` (pre-commit validation) | **PASS**, 1/1, 12/12 technical checks, exit 0 |
| `npm run build` | **PASS**, exit 0; compiled, TypeScript OK, 3 static pages |
| `npm run lint` | **FAIL**, exit 2 — ESLint 9 cannot find `eslint.config.js`; identical failure on untouched baseline; pre-existing repository issue |

The 10 full-suite failures are: `fauna180` belly shade precision, `hydrology`
rivers-and-lakes existence, 2 `planet` morphology timeouts (5 s), 2
`reproduction` assertions, `settlementDefaults` restore timeout,
`vibeGenomeV1110` registry assertion, mutation timeout and PER-03 assertion.
They reproduce identically on the untouched baseline, so E2.3 introduces **no
new failure**. Four timeout-only failures pass when those files are run in
isolation on the baseline, confirming load sensitivity rather than an E2.3
regression. The added tests make the suite grow from 850 to 869 tests.

---

## G. Pilot (technical validation, not an ecological result)

Pre-commit validation run (final artifact run recorded in §L/I):

| Item | Value |
|---|---|
| Seeds | `7`, `11` (each with an independent replicate) |
| Config | 24×24 world, 60 organisms, 40 ticks, `mixed` setup, snapshots every 10 ticks |
| Runs | 2 observed runs + 2 replicates = 4 executions |
| Events | 83,243 total (41,777 for seed 7; 41,466 for seed 11) |
| Seed 7 | 113 hunt attempts (23 success / 90 failure), 40 deaths (23 predation, 17 starvation), 1 observed species edge, final population 20 |
| Seed 11 | 99 hunt attempts (25 success / 74 failure), 42 deaths (25 predation, 17 starvation), 1 observed species edge, final population 18 |
| Checks | runStarted, manifest, eventsGenerated, predationObserved, mortalityObserved, consumptionObserved, snapshotsBuilt, eventSequenceReconstructed, validation, export, integrity, reproducibility — **12/12 true** |
| Validation | every event structurally valid; zero duplicate IDs; zero critical drops; `COMPLETE` |
| Artifact | gzip dataset + manifest; `readDataset` verification passed |

These counts demonstrate that the observation path works; they are **not**
interpreted as ecological findings.

---

## H. Performance / overhead (measured)

Method: median of 7 trials, 20 ticks, 24×24 world, 50 organisms, `mixed` setup,
same seeds across modes; timings exclude world construction and setup.

| Mode | Median step time | Events | Canonical JSONL bytes |
|---|---:|---:|---:|
| Disabled (`NULL_EVENT_SINK`) | 27.0 ms | 0 | 0 |
| Full logging | 74.0 ms | 21,599 | 15,637,035 |
| `DEATH` only | 21.1 ms | 19 | 12,501 |
| Bounded non-critical buffer (200) | 24.2 ms | 1,038 | 958,012 |

Full-logging ratio over disabled: **2.74×** in this microbenchmark. The
low-frequency and bounded modes are within measurement noise of disabled
(slightly faster in this sample), so the ratio is indicative, not a calibrated
benchmark. No performance threshold was introduced or loosened; the test only
asserts finite measurements and relative volume. Full logging is expensive
mostly because it records one regeneration/depletion event per active cell per
tick. Default operation remains the zero-cost no-op sink.

---

## I. Reproducibility and integrity

- Manifest `evoworld.e2.3.run-manifest.v1` contains seed, config, config hash,
  logging policy and engine options; wall-clock `elapsedMs` is deliberately
  excluded from manifest, dataset and hashes.
- `configSha256` and `eventPayloadSha256` are computed from canonical
  (key-sorted) serialization. Event IDs are deterministic:
  `${runId}:${tick}:${seq}`.
- Per-seed replicate comparison returned `{reproducible: true, differences: []}`
  for both seeds; a negative control with different seeds correctly reported
  `configSha256` as a difference.
- Export writes events and JSONL per run with independent hashes;
  `verifyObservabilityArtifact()` re-validates schema, IDs, hashes and JSONL.
  A tampered manifest was correctly rejected with `payloadSha256 mismatch`.
- Source content hashes (`sourceSha256`, `e1SourceSha256`) and code commit are
  recorded by the dataset writer; final values are in §L.

Limit: determinism is verified for identical config, code and seed within this
runner. E1's `World.fromSnapshot()` resets experimental flags, so the dedicated
runner avoids that path instead of assuming equivalence.

---

## J. Scientific limits and category discipline

| Category | In this deliverable |
|---|---|
| `OBSERVED` | All engine-emitted events and the observed food-web edges built from them |
| `DERIVED` | Hunt views, event counts, energy ledger, aggregates, snapshots' arithmetic means |
| `INFERRED` | Not produced; selection/drift attribution explicitly deferred |
| `NON_EVALUABLE` | Collisions as events, sub-tick state, disease, individual vegetation withdrawal, production/regeneration split, global vegetation over lazy chunks, closed energy conservation, counterfactual hunt decisions |

No threshold, p-value, acceptance criterion or verdict from E2.2.1 was
relaxed, reused or silently reinterpreted. No `NON_VALUTABILE` E2.2.1 result was
converted into a positive result. The dataset's `scientificVerdict` is
`TECHNICAL_VALIDATION_ONLY`.

---

## K. Residual issues / technical debt

1. Full logging produces ~15.6 MB per 20 ticks in the microbenchmark; use
   `enabledTypes`/`maxNonCriticalEvents` for routine runs. Critical events
   remain unbounded by design.
2. `RESOURCE_DEPLETION` is regional, not individual: no honest per-organism
   vegetation withdrawal can be derived from the current engine.
3. The two snapshot types read only materialized chunks; scope is declared in
   the payload and must not be read as a global resource inventory.
4. `npm run lint` is broken repo-wide (missing ESLint 9 flat config); not
   changed here because it is outside filone E.
5. Ten baseline full-suite tests fail independently of E2.3; they need a
   separate owner. Four are 5-second timeouts under parallel load.
6. No UI change and no Next.js API was touched; AGENTS.md Next.js guidance is
   therefore not exercised by this branch's code.

---

## L. Commits and final artifacts

_To be filled after the final commit and final pilot run._

---

## M. Recommendation

The direct observation infrastructure now exists and is verified: real events,
explicit schema, passive logging, snapshots, reproducible manifest, integrity
checks, derived views with no fabricated records, and a green technical pilot.
The correct next step is **independent review of the event semantics and the
passivity proof**, not a new ecological analysis. Once the branch is reviewed
and merged by its owner, a separate filone may use these observed events to
formulate hypotheses — always labeling them `OBSERVED`, `DERIVED`, `INFERRED`
or `NON_EVALUABLE` and never treating the derived energy ledger as a closed
conservation law.
