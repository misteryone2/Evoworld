# Spatial Hydrology — first-milestone proposal (not implemented)

Status: **proposal only**. This document does not change `PlanetEngine`,
`HydrologyField`, persistence, GENOME, renderer or the main loop. It defines a
bounded first milestone that can be implemented, tested and benchmarked inside
`simulation/planetEngine/**` after the current P1/P2 stability work is accepted.

## 1. Objective and non-objectives

Objective: replace the current global-reservoir-only hydrology with an
**additive, deterministic, mass-conserving surface-water routing prototype** on
the existing latitude-weighted grid. The prototype must be independently
validated with synthetic basins before any default-step integration.

Non-objectives for this milestone:

- no shallow-water or Navier–Stokes solver;
- no river morphology, sediment entrainment or bank erosion;
- no groundwater aquifer, snowpack, glacier flow or clouds;
- no local atmospheric column: vapor remains one global reservoir;
- no changes to `EnvironmentSample`, legacy `Cell` units or persistence;
- no main-loop, GENOME or renderer integration.

## 2. Proposed module boundary

Add only new files under:

```text
simulation/planetEngine/hydrology/spatial/
  SpatialWaterState.ts     // Float64 state + serialization
  Infiltration.ts          // precipitation partitioning
  D8Routing.ts             // downhill flux computation
  Depressions.ts           // deterministic pit/lake spill
  SpatialWaterCycle.ts     // orchestration + inventory closure
  SPATIAL_HYDROLOGY_TESTS.md (if needed)
```

The existing `WaterCycle.ts` keeps producing global fluxes for the default
engine. The prototype is driven by a local options object, not by a new global
config, until it passes acceptance.

## 3. State variables and units

All storages are in **water volume [m³]** in `Float64Array`; public diagnostics
may expose depth [m] as `V_i / A_i`.

| Symbol | Meaning | Unit | Storage |
| --- | --- | --- | --- |
| `A_i` | authoritative cell area | m² | existing `ElevationGrid.cellAreasM2` |
| `z_i` | ground elevation (transport grid) | m | existing `transportElevationM` |
| `S_i` | soil moisture store | m³ | new `Float64Array` |
| `C_i` | channel/ponded surface store | m³ | new `Float64Array` |
| `L_i` | closed-basin lake store | m³ | new `Float64Array` (may alias `C_i` initially) |
| `P_i` | precipitation input | kg/step → m³/step | derived from existing field |
| `E_i` | evaporation output | kg/step → m³/step | derived from existing field |
| `Q_ij` | routed volume from cell `i` to `j` | m³/substep | transient `Float64Array` |
| `M_atm` | atmospheric vapor reservoir | kg | existing `hydrosphere.vaporMassKg` |

`S_max,i = A_i · soilDepthM · porosity`, with `soilDepthM` and `porosity` fixed
scalars in the prototype options. No parameter is read from outside the module.

## 4. Mathematical model

For each substep `Δt`:

1. **Local supply**: convert area-weighted precipitation/evaporation fluxes to
   volumes using `PLANET_UNITS.waterDensityKgM3`.
2. **Infiltration**:

   `I_i = clamp(P_i·Δt, 0, k_sat,i·A_i·Δt·(1 − S_i/S_max,i))`

   `S_i ← S_i + I_i`

   Saturation excess is `P_i·Δt − I_i`; it enters `C_i`.

3. **Evaporation**: `E_i = min(E_i^demand·Δt, S_i + C_i)`, removed first from
   `C_i`, then `S_i`, and added to the global vapor reservoir. This preserves
   the existing water contract (`applyWaterFluxes` semantics) at inventory
   level.
4. **Downhill direction**: D8 neighbour `j` maximizing

   `slope_ij = (z_i + (S_i+C_i)/A_i − z_j − (S_j+C_j)/A_j) / d_ij`.

   Ties break by ascending cell index; ocean/edge cells are sinks. Wrapped
   coordinates use the existing torus convention; row neighbours are weighted
   by actual cell geometry, not by a scalar mean area.
5. **Kinematic flux**:

   `Q_ij = min(C_i, k_route · A_i · max(0, slope_ij) · Δt)`.

   `k_route` has units m/s divided by a length scale; the concrete option is a
   calibrated `[m/s]` conductance. Fluxes for all cells are computed from the
   **same old state** and applied simultaneously, so iteration order cannot
   matter.
6. **Depressions**: if no downhill neighbour exists, water stays in `L_i` until
   its surface reaches the lowest spill sill; priority-flood ordering is used
   only to compute deterministic spill targets, never to move mass out of order.
7. **Ocean coupling**: water entering an ocean cell joins
   `hydrosphere.oceanMassKg`; water leaving soil/vapor follows the existing
   reservoir mirror.

This is a **diffusive/kinematic approximation**, not a momentum solve.

## 5. Discretization and numerical rules

- Fixed substep count `n = ceil(Δt / Δt_target)`, with prototype default
  `Δt_target = 3600 s`; a storm/CFL clamp limits `Σ_j Q_ij` to at most 25% of
  available `C_i` per substep.
- All flux accumulation and reservoir updates are `Float64`. Any public
  `Float32` view carries a `transportResidualM3` equivalent, mirroring the
  erosion contract; no artificial spatial redistribution.
- `A_i` from `cellAreasM2` is authoritative for every volume conversion.
- No `Math.random`, `Date.now`, DOM, renderer or biology imports.
- Snapshot of the prototype state is an immutable frozen view; mutating methods
  are engine/prototype-owned only, as with biome memory.

## 6. Invariants to enforce

For every substep and every full step:

1. `Σ_i (S_i + C_i + L_i) + ocean + ice + soil_legacy + vapor` equals the
   initial total within `1e-12 × max(total, |transferred|)` plus explicit
   atmosphere coupling.
2. `S_i, C_i, L_i, Q_ij ≥ 0`; no reservoir is over-drawn.
3. `Σ_j Q_ij ≤ C_i` for every donor.
4. Every `Q_ij` has a matching `+Q_ij` receiver (or documented ocean sink).
5. Reversing cell iteration order or sampling order changes no numeric result.
6. Serialization → restore → step yields bit-identical arrays for the same seed
   and options.
7. Zero precipitation and zero evaporation on a flat grid produce no net flux.

## 7. Synthetic validation suite

Before integration, add `planetEngineSpatialHydrology.test.ts` with independent
analytic references:

| Test | Independent reference | Acceptance |
| --- | --- | --- |
| Inclined plane pulse | kinematic wave speed `k_route·slope` | arrival time within one substep; zero cross-slope mass |
| Closed basin | fill to sill volume `A_basin·(z_sill − z_bottom)` | spill starts at predicted level; mass conserved |
| Uniform rain, flat torus | symmetry: all cells equal | no directional drift above roundoff |
| Source/sink audit | prescribed `P` and `E` table | reservoir delta equals table sum exactly |
| Extreme storm | donor cap 25% | no negative storage or flux blow-up |
| Order independence | forward vs reverse iteration | bit-identical arrays |
| Serialization round-trip | restored arrays | bit-identical after one step |
| Engine coupling | total water before/after 20 steps | relative drift < 1e-10 |

No Earth discharge dataset is claimed for this milestone.

## 8. Cost estimate and benchmark gate

Per substep the algorithm is `O(N)` with an 8-neighbour scan and two `O(N)`
array passes; storage is roughly 7 `Float64Array(N)` arrays (~56 N bytes),
about 57 MB at 1024² and 3.7 MB at 256² before existing engine fields. For a
daily step with the 1-hour target, expect ~24 substeps, i.e. ~24 M neighbour
evaluations at 1024².

Before any default integration, extend `scripts/planetEngine.benchmark.ts` with
an isolated `spatialHydrology` phase at 64²–1024² and report mean/P50/P95,
throughput, heap/RSS, seed, options, warmup and iterations. Proposed gate:

- added cost ≤ 30% of the current `step` mean at 256²;
- no superlinear growth beyond the measured `O(N·n)` model;
- memory increase within the estimate above plus GC noise.

If the gate fails, reduce substeps, use adaptive active-cell lists, or stop at
the isolated prototype; do not silently slow the production engine.

## 9. Delivery sequence and authorization gates

1. **Phase A — isolated module and tests**: new files only; no changes to
   `PlanetEngine`, `contracts.ts` or existing `HydrologyField`.
2. **Phase B — adapter**: expose an opt-in derived diagnostic alongside the
   existing global fields; still no default-step behavior change.
3. **Phase C — integration**: requires explicit authorization, because it
   changes `PlanetEngine.step()`, persistence schema or consumer-visible
   contracts.

This proposal is intentionally additive. Acceptance of the current P1/P2
patch does not authorize Phase C.
