# E2.3 — Event schema and observability protocol

**Schema ID:** `evoworld.e2.3.event.v1`
**Manifest schema:** `evoworld.e2.3.run-manifest.v1`
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
   sampled non-critical event makes run completeness `PARTIAL`.

---

## 2. Common fields

| Field | Type | Units / meaning | Null |
|---|---|---|---|
| `eventId` | string | `${runId}:${tick padded 10}:${seq padded 8}`; unique within a run | no |
| `eventType` | enum | one of the 8 types below | no |
| `schemaVersion` | string literal | `evoworld.e2.3.event.v1` | no |
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

Required: `offspringId`, `parentIds` (comma-separated), `mode`
(`SEXUAL`/`ASEXUAL`), `parentEnergyCost`, `offspringEnergy`.

Context: `parentCount`, `mateId`, `parentEnergyBefore/After`,
`mateEnergyBefore/After` (null when no mate), `mateEnergyCost`,
`offspringFactor`, `speciesId`, `parentSpeciesId`, offspring position,
`advancedGenome`. Energy costs are engine units, measured before/after the
unchanged deduction.

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
  `outcome`. `PREDATION` additionally requires a string
  `preyDeathCorrelationId`, i.e. a correlated death record exists. Views never
  create new events; `HUNT_SUCCESS + HUNT_FAILURE === HUNT_ATTEMPT` and
  `PREDATION <= HUNT_SUCCESS`.
- `energyLedger(events)` returns `DERIVED` rows with `sourceEventId`, tick,
  entity, `flowType` and signed `amount`: `HUNT_ATTEMPT_COST`,
  `BURST_COST_PREY`, `PREDATION_GAIN`, `VEGETATION_GAIN`,
  `REPRODUCTION_COST`, `MATE_COST`. It is a projection of payload fields, not
  stored events. It is **not** a closed conservation ledger: the engine does
  not subtract the prey's residual energy on kill, and clamping/caps can
  discard energy.
- `buildObservedFoodWeb(events)` returns `OBSERVED` species-level edges built
  only from `HUNT_ATTEMPT` records, with attempts, successes, failures and
  transferred energy. It does not infer unobserved trophic links.
- `filterEvents()` supports explicit filters by type, tick, run and
  correlation ID. No sampling is performed in views.

---

## 5. Logger policy

`InMemoryEventSink` is deterministic and configurable:

| Option | Default | Effect |
|---|---|---|
| `enabledTypes` | all 8 | disables categories explicitly; recorded in manifest |
| `sampleRates` | none | allowed only for non-critical types; constructor throws otherwise |
| `samplingSeed` | `1` | separate local RNG stream; never touches engine RNG |
| `maxNonCriticalEvents` | unbounded | bounds only non-critical records; critical records are never silently dropped |
| `snapshotEveryTicks` | `0` | interval for the two snapshot types; `0` disables snapshots |
| `tickDuration`, `ticksPerYear` | `1`, `400` | time conversion only, declared in manifest |

Critical types: `HUNT_ATTEMPT`, `DEATH`, `REPRODUCTION`,
`RESOURCE_CONSUMPTION`. They are never sampled and never dropped by the memory
limit. `summary().completeness` is `PARTIAL` if any record was sampled or
dropped; the manifest and every exported event carry that state.

`NULL_EVENT_SINK` is the default in every instrumented function and in `World`.
With it, no event object is constructed and behavior is bit-for-bit identical
to the pre-E2.3 engine (verified by state-signature comparison in tests).

`World.setEventSink()` attaches/detaches the sink without touching biological
state; `World.fromSnapshot()` resets it to `NULL_EVENT_SINK` because the sink is
not part of the simulation state.

---

## 6. Provenance, export and integrity

Each run manifest contains: schema IDs, `runId`, `experimentId`,
`simulationId`, seed, deterministic config + `configSha256`, logging policy,
and engine options. The manifest deliberately contains **no** wall-clock field.
`elapsedMs` exists only in the in-memory result and is excluded from hashes,
datasets and reproducibility comparisons.

Export path: `tools/e2/observabilityPipeline.ts` →
`writeDataset()` (existing E2 writer). Events are stored in
`auxiliary.eventsByRun` and as canonical JSONL in `auxiliary.jsonlByRun`, with
per-run hashes. `scientificReport` holds purely derived aggregates and the
label `TECHNICAL_VALIDATION_ONLY`. The dataset schema and E1 compatibility are
unchanged; `tools/e1/runner.ts` was not modified.

`verifyObservabilityArtifact()` re-reads the archive, checks dataset/event
schema versions, per-run event hashes, JSONL hashes, duplicate `eventId`s and
structural validation of every event. `readDataset()` independently checks
manifest ↔ archive ↔ payload hashes.

---

## 7. Non-observable / out of scope

| Phenomenon | Status | Reason |
|---|---|---|
| Sub-tick ordering inside movement/collisions | `NON_EVALUABLE` | no engine hook emits intermediate states |
| Counterfactual hunt decision independent of the engine RNG | `NON_EVALUABLE` | no counterfactual branch exists |
| Disease mortality | `NON_EVALUABLE` | no disease branch in engine |
| Immediate vegetation withdrawal per organism | `NON_EVALUABLE` | engine applies region-wide depletion only |
| Production vs regeneration distinction | `NON_EVALUABLE` | two code paths, not a biological distinction |
| Global vegetation stock over all chunks | `NON_EVALUABLE` | lazy planet only materializes active chunks |
| Individual energy conservation / closed ledger | `NON_EVALUABLE` | prey residual energy is not subtracted, caps clamp gains |
| Selection vs drift attribution | `INFERRED` only | requires external controls; not produced here |
