# E2.3 / E2.3.1 — Event schema and observability protocol

**Current schema ID:** `evoworld.e2.3.event.v2`
**Legacy schema ID:** `evoworld.e2.3.event.v1` (import/validation supported; never emitted by current code)
**Manifest schema:** `evoworld.e2.3.run-manifest.v1` (carries the event schema version and profile)
**Dataset schema:** unchanged (`E2_DATASET_SCHEMA`), E2.3 data is additive.

This document is the normative description of the event contract implemented in
`simulation/ecology/observability.ts`. It is a technical observation protocol,
not an ecological claim.

---

## 1. Principles

1. **An event is a real engine transition**, emitted at the point where the
   engine performs it. No event is reconstructed after the fact from deltas.
2. **Passive observation only.** The sink has a single `record(observation)`
   method with no return value. Hooks never read or mutate biological state,
   never call the engine RNG, and never change formulas, order of operations,
   probabilities, mortality, energy, reproduction or resources.
3. **Immutable records.** Events, payloads, `entityIds` and `metadata` are
   frozen at creation. Payload values are restricted to `number | string |
   boolean | null`; all numbers must be finite.
4. **Single canonical predation record.** `HUNT_ATTEMPT`, `HUNT_SUCCESS`,
   `HUNT_FAILURE` and `PREDATION` are typed *views* of one record, not four
   records. This prevents double counting.
5. **Snapshots are separate** from individual events (`ECOSYSTEM_SNAPSHOT`,
   `RESOURCE_SNAPSHOT`, `entityIds: []`). They are aggregates, never events of
   individual organisms.
6. **Explicit completeness.** Silent sampling is forbidden. Any dropped or
   sampled event, disabled required type, flush error or missing required
   coverage makes run completeness `PARTIAL`, as decided by the sink summary —
   the authoritative classification for the dataset.
7. **Explicit parent roles (E2.3.1).** Reproduction costs are attributed to a
   named primary or secondary parent. A missing value stays `null` and is
   reported as `INCOMPLETE`/`NON_EVALUABLE`; it is never replaced by `0` nor
   copied from the other parent.
8. **Verified predation only (E2.3.1).** A `PREDATION` view requires a real,
   coherent `DEATH` relation; a bare `preyDeathCorrelationId` is not proof.

---

## 2. Common fields

| Field | Type | Units / meaning | Null |
|---|---|---|---|
| `eventId` | string | `${runId}:${tick padded 10}:${seq padded 8}`; unique within a run | no |
| `eventType` | enum | one of the 8 types below | no |
| `schemaVersion` | string literal | `evoworld.e2.3.event.v2`; v1 accepted on import only | no |
| `simulationId`, `runId` | string | run correlation keys | no |
| `experimentId` | string | experiment label | yes |
| `tick` | integer ≥ 0 | engine tick at observation | no |
| `simulationTime` | number | `tick × tickDuration`; default `tickDuration = 1` tick | no |
| `simulationYear` | integer ≥ 0 | `floor(tick / ticksPerYear)`; default `ticksPerYear = 400` | no |
| `category` | enum | `OBSERVED` for all engine-emitted records | no |
| `entityIds` | integer[] | organism IDs; empty only for cell-level/aggregate records | no |
| `payload` | object | type-specific fields, see §3 | no |
| `source` | string | `file:function` or `file:function:branch`, provenance | no |
| `correlationId` | string | links related records, e.g. hunt → death | yes |
| `metadata.completeness` | `COMPLETE` \| `PARTIAL` | per-event copy of logger state | no |
| `metadata.sampled` | boolean | whether this record passed a non-critical sampler | no |
| `metadata.engineDerived` | boolean | always `true` for records from the engine hooks | no |

`validateEvent()` enforces the common contract and the required payload fields
per type. It rejects unknown types, non-integer/negative ticks, non-finite
numbers, unsupported payload value types and invalid metadata.

---

## 3. Event catalog

"Required" fields are validated structurally. Additional fields are
observational context and may be absent when the engine has no value for them.
A field that the engine does not compute is never filled with an estimate.

### `HUNT_ATTEMPT` — category `PREDATION`, critical

Emitted in `huntPrey()` after target selection and cost payment, once per real
attempt, before the RNG success decision.

Required: `outcome` (`SUCCESS`/`FAILURE`), `predatorId`, `preyId`,
`predatorSpeciesId`, `preySpeciesId`, `successChance`, `energyTransferred`.

Context: `predatorEnergyBefore`, `predatorEnergyAfterCost`,
`predatorEnergyAfter`, `preyEnergyAtOutcome`, `preyEnergyAtKill`,
`preyEnergyAfter`, `attemptCost` (12 energy units), `burstCostPredator`,
`burstCostPrey`, `predatorPower`, `preyPower`, `baseChance`, `interference`,
`rivalPredators`, `availablePrey`, `distance` (grid cells), positions,
carnivory, ages, `digestionFactor`, `energyCapFactor`.
On success: `preyDeathCorrelationId = ${correlationId}:death`.

Units: energy in engine energy units; probabilities in `[0,1]`; distance in
grid cells; positions in wrapped grid coordinates.

### `DEATH` — category `MORTALITY`, critical

One record per organism removal, emitted immediately after `alive = false`.

Required: `cause`, `speciesId`, `energy` (engine energy units), `age` (ticks).

`cause` is taken from the exact engine branch:

| Source | `cause` | Notes |
|---|---|---|
| `huntPrey()` successful kill | `PREDATION` | includes `predatorId`, `predatorSpeciesId`, `huntCorrelationId`; never duplicated by the generic loop |
| `isDying()` (`energy <= 0` and/or `age >= lifespan`) | `STARVATION`, `OLD_AGE`, or `STARVATION|OLD_AGE` | both predicates are recorded if both are true; `causeCount` states how many |
| settlement risk draw | `ENVIRONMENT_SETTLEMENT` | includes `settlementRisk`, `regionKey` |
| no predicate true (should not occur) | `UNKNOWN` | explicit, never guessed |

If both `STARVATION` and `OLD_AGE` hold, the pipe-separated value is a single
record with two observed predicates, not two deaths. Disease is not emitted:
the engine has no disease branch (`NON_EVALUABLE`).

### `REPRODUCTION` — category `REPRODUCTION`, critical

Emitted once per offspring creation in `reproduceOrganisms()`.

**v2 required:** `offspringId`, `parentIds` (comma-separated), `mode`
(`SEXUAL`/`ASEXUAL`), `primaryParentId`, `primaryParentEnergyCost`,
`primaryParentEnergyBefore`, `primaryParentEnergyAfter`, `secondaryParentId`,
`secondaryParentEnergyCost`, `secondaryParentEnergyBefore`,
`secondaryParentEnergyAfter`, `costAttribution`, `offspringEnergy`.

`primaryParentId` is the organism whose own reproduction step is executing;
`secondaryParentId` is the chosen mate, or `null` for asexual reproduction.
The corresponding costs are measured by the engine as `before − after` and are
never inferred from `parentIds` order. `costAttribution` is `PRIMARY_ONLY` or
`PRIMARY_AND_SECONDARY`. In asexual events all secondary cost/delta fields are
`null`; a null value is **missing data**, not a zero cost.

**Legacy v1 required:** `offspringId`, `parentIds`, `mode`, `parentEnergyCost`,
`offspringEnergy`. v1 events remain importable and validate with their own
required-field set, but current code never emits them.

Context (both versions): `parentCount`, `offspringFactor`, `speciesId`,
`parentSpeciesId`, offspring position, `advancedGenome`. Energy costs are
engine units, measured before/after the unchanged deduction.

### `RESOURCE_CONSUMPTION` — category `RESOURCE`, critical

Emitted in `feedOrganisms()` only when the engine computes `gained > 0` for a
specific organism. Required: `organismId`, `speciesId`, `cellX`, `cellY`,
`energyGained`, `stockBefore`, `energyBefore`, `energyAfter`.

Context: `regionKey`, `demand`, `demandShare`, `cellShare`, `rawCellGain`,
`sustainableShare`, `environmentalFitness`, `settlementEfficiency`,
`digestionFactor`, `energyCapFactor`, `carnivory`.

`stockBefore` is the cell vegetation before the region-level depletion phase.
The engine does **not** subtract an individual's withdrawal from the cell at
this point; `RESOURCE_DEPLETION` records the actual cell-level removal later.
Global vegetation deltas are never used as a proxy for individual consumption.

### `RESOURCE_DEPLETION` — category `RESOURCE`, non-critical

Emitted per land cell whose vegetation actually decreases in the regional
depletion loop. Required: `cellX`, `cellY`, `regionKey`, `stockBefore`,
`stockAfter`, `quantityRemoved`. Context: `demand`, `landCellCount`,
`depletionPerCell`. `entityIds` is empty: the engine distributes removal over
the whole region, so per-organism attribution would be fabricated.

### `RESOURCE_REGENERATION` — category `RESOURCE`, non-critical

Emitted per cell whose vegetation actually changes in `Planet.update()`.

Required: `cellX`, `cellY`, `mode`, `stockBefore`, `stockAfter`, `regrowth`.
`mode` is `active` (`stepCellOneTick`) or `catchup` (`catchUpCell`, with
`elapsedTicks`). Context: `nominalRegrowth`/`rate`, `potential`,
`growthFactor`, `waterAvailability`, `temperature`, `terrain`.

**Limitation:** active growth and catch-up growth are two code mechanisms, not
a biological distinction between production and regeneration. A separate
`RESOURCE_PRODUCTION` type is therefore not emitted; that distinction is
`NON_EVALUABLE`.

### `RESOURCE_SNAPSHOT` — category `SNAPSHOT`, non-critical

Periodic aggregate of materialized chunks. Required: `cellCount`,
`landCellCount`, `meanVegetation`, `totalVegetation`. Context: `minVegetation`,
`maxVegetation`, `materializedChunkCount`, `scope: "materialized_chunks"`.
Vegetation is in `[0,1]` per cell. The lazy planet means unmaterialized chunks
are excluded; scope is always declared.

### `ECOSYSTEM_SNAPSHOT` — category `SNAPSHOT`, non-critical

Periodic aggregate from `lastStats` plus organism state. Required:
`population`, `speciesAlive`, `meanEnergy`, `completedTicks`. Context:
`speciesExtinct`, `speciesTotalEver`, `births`, `deaths`, `predationKills`,
`meanAge`, `year`, `season`. `births`/`deaths` are cumulative engine counters;
`predationKills` is reported separately and is not included in `deaths`.

---

## 4. Views and derived projections

- `selectHuntEvents(events, view)` returns `HUNT_ATTEMPT` records filtered by
  `outcome`. `PREDATION` additionally requires a **verified** relation from
  `verifyPredationCorrelations()`: a correlated `DEATH` with matching
  correlation ID, prey ID, predator ID, run ID, tick, cause and hunt link.
  Views never create new events; `HUNT_SUCCESS + HUNT_FAILURE === HUNT_ATTEMPT`
  and `PREDATION <= HUNT_SUCCESS`.
- `verifyPredationCorrelations(events, options)` classifies every successful
  hunt as `VERIFIED`, `UNVERIFIED`, `INCONSISTENT`, `AMBIGUOUS` or
  `NON_EVALUABLE`, and reports `ORPHAN` predation deaths. Missing relations in
  a `PARTIAL` dataset or when `DEATH` is not required are `NON_EVALUABLE`, never
  confirmed predation. One death cannot verify two attempts.
- `energyLedger(events)` returns `DERIVED` rows with `sourceEventId`, tick,
  entity, `flowType` and signed `amount`: `HUNT_ATTEMPT_COST`,
  `BURST_COST_PREY`, `PREDATION_GAIN`, `VEGETATION_GAIN`,
  `REPRODUCTION_COST`, `MATE_COST`. Missing values are `NON_EVALUABLE` rows
  with `amount: null`, never invented zeroes. `energyLedgerSummary()` adds
  totals, verified/incomplete/unverified counts and the reproduction
  conservation report. It is a projection of payload fields, not stored
  events. It is **not** a closed global conservation ledger: the engine does
  not subtract the prey's residual energy on kill, and clamping/caps can
  discard energy. `verifyEnergyConservation()` checks only the explicit
  reproduction parent costs against their recorded before/after deltas.
- `buildObservedFoodWeb(events)` returns `OBSERVED` species-level edges built
  only from `HUNT_ATTEMPT` records, with attempts, successes, failures and
  transferred energy. It does not infer unobserved trophic links.
- `filterEvents()` supports explicit filters by type, tick, run and
  correlation ID. No sampling is performed in views.

---

## 5. Logger policy and completeness profiles (E2.3.1)

`InMemoryEventSink` is deterministic and configurable:

| Option | Default | Effect |
|---|---|---|
| `profile` | `scientific_full` | `scientific_full`, `partial` or `diagnostic`; declared in manifest |
| `enabledTypes` | all 8 | disables types explicitly; `scientific_full` throws if any critical type is disabled |
| `requiredTypes` | profile default | types that must be covered for `COMPLETE` |
| `disabledReason` | `null` | mandatory explanation when a profile intentionally disables coverage |
| `sampleRates` | none | allowed only for non-critical types; constructor always throws for critical types |
| `samplingSeed` | `1` | separate local RNG stream; never touches engine RNG |
| `maxNonCriticalEvents` | unbounded | bounds only non-critical records; losses are counted and force `PARTIAL` |
| `maxCriticalEvents` | unbounded | explicit critical limit; any drop forces `PARTIAL` and is never silent |
| `batchWriter`, `flushEveryEvents` | none | incremental flush to an `EventBatchWriter`; compatible with long runs |
| `releaseAfterFlush` | `false` | releases flushed events from memory while lifetime counters keep all totals |
| `snapshotEveryTicks` | `0` | interval for the two snapshot types; `0` disables snapshots |
| `tickDuration`, `ticksPerYear` | `1`, `400` | time conversion only, declared in manifest |

Centralized importance classification (single source of truth:
`EVENT_IMPORTANCE`):

| Importance | Types | Policy |
|---|---|---|
| `CRITICAL` | `HUNT_ATTEMPT`, `DEATH`, `REPRODUCTION`, `RESOURCE_CONSUMPTION` | never sampled; disabling forbidden in `scientific_full` |
| `NON_CRITICAL` | `RESOURCE_DEPLETION`, `RESOURCE_REGENERATION` | may be sampled/bounded inside a declared `partial` profile |
| `DIAGNOSTIC` | `RESOURCE_SNAPSHOT`, `ECOSYSTEM_SNAPSHOT` | aggregate control data; never sufficient for a complete scientific dataset |

Profiles:

| Profile | Required coverage by default | Can it be `COMPLETE`? |
|---|---|---|
| `scientific_full` | all CRITICAL + NON_CRITICAL types, no losses | yes, only if every required type is enabled/uncensored and no loss occurred |
| `partial` | all CRITICAL types | **no** — always `PARTIAL`, with disabled types, reason and lost counts recorded |
| `diagnostic` | none | **no** — always `PARTIAL`; cannot be presented as a complete scientific dataset |

`summary()` is the authoritative completeness source and carries `total`,
`retained`, per-type attempts/losses, `sampled`, `criticalDropped`,
`flushErrors`, `flushedBatches/Events`, `missingRequiredTypes`,
`unrecordedRequiredTypes`, `missingCategories`, `declaredCoverageComplete` and
`coverageComplete`. The manifest mirrors `profile`, `requiredTypes`,
`enabledTypes`, `disabledTypes`, `disabledReason`, `importanceByType`, a
`loggingSha256`, and the event schema version. Export rejects a run whose
manifest and sink coverage declarations disagree.

`NULL_EVENT_SINK` is the default in every instrumented function and in `World`.
With it, no event object is constructed and behavior is bit-for-bit identical
to the pre-E2.3 engine (verified by state-signature comparison in tests).

`World.setEventSink()` attaches/detaches the sink without touching biological
state; `World.fromSnapshot()` resets it to `NULL_EVENT_SINK` because the sink is
not part of the simulation state.

---

## 6. Provenance, export and integrity

Each run manifest contains: schema IDs (including the event schema version),
`runId`, `experimentId`, `simulationId`, seed, deterministic config +
`configSha256`, logging policy + `loggingSha256`, and engine options. The
manifest deliberately contains **no** wall-clock field. `elapsedMs` exists only
in the in-memory result and is excluded from hashes, datasets and
reproducibility comparisons.

Export path: `tools/e2/observabilityPipeline.ts` →
`writeDataset()` (existing E2 writer). Events are stored in
`auxiliary.eventsByRun` and as canonical JSONL in `auxiliary.jsonlByRun`, with
per-run hashes. `scientificReport` holds purely derived aggregates and the
label `TECHNICAL_VALIDATION_ONLY`. The dataset schema and E1 compatibility are
unchanged; `tools/e1/runner.ts` was not modified.

`verifyObservabilityArtifact()` re-reads the archive, checks dataset/event
schema versions, per-run event hashes, canonical JSONL content and hashes,
duplicate `eventId`s, structural validation of every event, agreement between
manifest and sink coverage declarations, impossible `COMPLETE` labels,
reproduction conservation and predation/mortality consistency.
`readDataset()` independently checks manifest ↔ archive ↔ payload hashes. An
export error throws before any manifest is returned: no apparently valid
dataset can survive a failed write, flush or validation step.

---

## 7. E2.3.1 audit chain

The full path is audited as one chain:

`engine hook → passive sink → buffer/flush → snapshot → aggregate → export →
gzip → manifest → hash → readDataset import → validation`.

Invariants: one event per real transition; immutable deterministic IDs;
lifetime counters survive `releaseAfterFlush`; no critical drop can be silent;
`COMPLETE` requires both declared coverage and zero observed losses; JSONL is
recomputed from imported events; archive/payload hashes are recomputed from
bytes on disk; profile and type coverage in the manifest must equal the sink
summary. Any violated invariant makes export fail or verification report an
error. Benchmarks and deterministic unit tests cover cases that do not occur
naturally (missing costs, flush failure, duplicate/orphan/mismatched death
links, 10k/50k/100k event streams).

---

## 8. Non-observable / out of scope

| Phenomenon | Status | Reason |
|---|---|---|
| Sub-tick ordering inside movement/collisions | `NON_EVALUABLE` | no engine hook emits intermediate states |
| Counterfactual hunt decision independent of the engine RNG | `NON_EVALUABLE` | no counterfactual branch exists |
| Disease mortality | `NON_EVALUABLE` | no disease branch in engine |
| Immediate vegetation withdrawal per organism | `NON_EVALUABLE` | engine applies region-wide depletion only |
| Production vs regeneration distinction | `NON_EVALUABLE` | two code paths, not a biological distinction |
| Global vegetation stock over all chunks | `NON_EVALUABLE` | lazy planet only materializes active chunks |
| Global individual energy conservation / closed ledger | `NON_EVALUABLE` | prey residual energy is not subtracted, caps clamp gains |
| Reproduction parent-cost conservation | `OBSERVED` + `DERIVED` check | v2 records both parent deltas; `verifyEnergyConservation()` compares them to explicit costs; missing values stay `NON_EVALUABLE` |
| Selection vs drift attribution | `INFERRED` only | requires external controls; not produced here |
