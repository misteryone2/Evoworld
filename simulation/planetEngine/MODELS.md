# Planet Engine — model catalog, validation and limits

This file is the technical classification referenced by `MODEL_CLASSIFICATION`
in `contracts.ts`. A tag describes what a subsystem may claim, not how much
code it contains. Engine version `0.1.1-audit` covers the M1–M4 corrections;
`EnvironmentSnapshot` remains external version 1 and its legacy `Cell` units
are unchanged.

Reliability labels used below:

- **High** — deterministic closed-form/conservation identity with an independent reference checked by tests.
- **Medium** — physically motivated approximation with calibrated coefficients; validated only inside the stated envelope.
- **Low** — deterministic heuristic used to keep the simulation stable and expressive; not a physical prediction.

`VISUAL_EFFECT` is part of the shared `ModelTag` taxonomy but is deliberately
NOT assigned to any Planet Engine subsystem. Visual-only effects stay in the
untouched renderer G3.1 layer and are outside this headless engine's validation
claims.

## 1. Mandatory catalog

### 1.1 Orbital mechanics — `PHYSICAL_MODEL`

- **Source**: `core/Orbit.ts`, `core/Stellar.ts`.
- **Description**: deterministic two-body Kepler orbit, inverse-square stellar flux and axial-tilt declination.
- **Assumptions**: fixed elements, point masses, no drag, perturbations, n-body effects or relativistic terms.
- **Variables and units**: semi-major axis `a` [m]; eccentricity `e` [–]; mean/eccentric/true anomaly [rad]; distance `r = a(1 − e cos E)` [m]; luminosity `L` [W]; flux `S = L/(4πr²)` [W/m²]; obliquity `ε` [rad]; declination `δ = asin(sin ε · sin λ)` [rad].
- **Limits**: `e < 1`; inclination is kept in config for later 3-D work; epochs are exact SI seconds.
- **Validation method**: solve `M = E − e sin E` to residual < 1e-9; check `r_peri = a(1−e)`, `r_apo = a(1+e)`, `T² ∝ a³`, `≈365.25` days, `S ≈ 1361 W/m²` at 1 AU and inverse-square scaling.
- **Reliability**: **High** inside the two-body assumption.

### 1.2 Global energy budget — `APPROXIMATION`

- **Source**: `core/EnergyBudget.ts`.
- **Description**: global absorbed solar power, Bond albedo estimate, Stefan–Boltzmann equilibrium and an added calibrated greenhouse increment.
- **Assumptions**: globally averaged one-layer energy balance; grey albedo; logarithmic forcing; pressure broadening via a square-root factor.
- **Variables and units**: flux `S` [W/m²]; mean insolation `S/4` [W/m²]; albedo `A` [–]; `σT_eq⁴ = S(1−A)/4` [W/m²]; greenhouse `ΔT` [K]; surface temperature `T_s = T_eq + ΔT` [K].
- **Limits**: no radiative-transfer bands, clouds, aerosols or horizontal transport; forcing clamped to `[0, 150] K`.
- **Validation method**: independent σT⁴ closure, `T_eq ≈ 258 K`, `ΔT ≈ 33 K`, `T_s ≈ 288 K`, CO₂ doubling increment `6 ln 2 K`.
- **Reliability**: **Medium**; balance equation is exact, forcing coefficients are calibrated.

### 1.3 Gas inventory — `PHYSICAL_MODEL`

- **Source**: `atmosphere/Composition.ts`, `hydrology/Inventory.ts`.
- **Description**: canonical per-species mole counts; total dry mass; atmospheric water mirrored from `hydrosphere.vaporMassKg`.
- **Assumptions**: ideal-gas molar bookkeeping; `other` is inert N₂-like filler; no chemistry or escape.
- **Variables and units**: molar fractions `x_i` [–]; molar masses `M_i` [kg/mol]; mean molar mass `M̄` [kg/mol]; total mass `m` [kg]; moles `n_i = x_i m / M̄` [mol]; pressure `p = m g / A` [Pa].
- **Limits**: mass transfers are capped by available reservoirs; no speciation, photochemistry or vertical layering.
- **Validation method**: fractions sum to 1; Earth-like `M̄ ≈ 28.97 g/mol`; `m ≈ 5.15e18 kg`; injection conserves all pre-existing moles; water mirror equals vapor mass.
- **Reliability**: **High** for inventory accounting.

### 1.4 Greenhouse — `APPROXIMATION`

- **Source**: `atmosphere/Greenhouse.ts`, `core/EnergyBudget.ts`.
- **Description**: maps CO₂, H₂O, CH₄ and pressure to the calibrated `ΔT` used by the energy budget.
- **Assumptions**: logarithmic forcing with fixed reference at 1 atm, 280 ppm CO₂, 1% H₂O, 1.9 ppm CH₄.
- **Variables and units**: `x_CO2`, `x_H2O`, `x_CH4` [–]; pressure `p` [Pa]; `ΔT` [K]; grey optical depth `τ = 0.84 ΔT / 33` [–].
- **Limits**: no spectral lines, clouds, overlap treatment or inversion; clamp bounds apply.
- **Validation method**: 33 K at the reference composition; equal increments for successive CO₂ doublings.
- **Reliability**: **Medium**; calibrated trend, not a radiative-transfer solution.

### 1.5 Atmospheric circulation — `SIMULATION_HEURISTIC`

- **Source**: `atmosphere/Circulation.ts`.
- **Description**: Coriolis parameter and bounded zonal wind bands.
- **Assumptions**: prescribed Hadley/Ferrel/Polar pattern and fixed gradient; no momentum equation.
- **Variables and units**: rotation rate `Ω` [rad/s]; latitude `φ` [rad]; `f = 2Ω sin φ` [s⁻¹]; `u` [m/s], clamped to ≤ 60 m/s.
- **Limits**: not a solved atmosphere; no pressure gradients from weather, eddies or topography.
- **Validation method**: `f(0)=0`, sign/symmetry by latitude, bounded wind; **no observational wind-field validation**.
- **Reliability**: **Low**.

### 1.6 Hypsometry and grid geometry — `PHYSICAL_MODEL` + terrain generator

- **Source**: `surface/GridGeometry.ts`, `surface/Hypsometry.ts`, `surface/Continents.ts`.
- **Description**: exact latitude-weighted cell areas, deterministic seeded elevation field, ocean volume to sea level by hypsometric integration.
- **Assumptions**: wrapped latitude/longitude grid; elevation fractal is a generator, not tectonic history.
- **Variables and units**: radius `R` [m]; cell area `A(y)` [m²], telescoping to `4πR²`; elevation `h` [m]; water volume `V` [m³]; sea level `z` [m]; ocean fraction [–].
- **Limits**: histogram solver has one-bin resolution; seeded terrain does **not** reproduce Earth's ocean fraction.
- **Validation method**: area telescoping, analytic two-basin sea-level root, monotone sea level with water inventory.
- **Reliability**: **High** for area/volume solver; **Low** for geographic realism of the terrain.

### 1.7 Geology — `SIMULATION_HEURISTIC`

- **Source**: `geology/Interior.ts`, `Tectonics.ts`, `Volcanism.ts`.
- **Description**: finite interior heat reservoir, secular cooling, tectonic/volcanic proxies and volcanic CO₂ injection.
- **Assumptions**: characteristic cooling time `τ = 1e17 s`; deterministic uplift/event triggers; radiogenic production is prescribed.
- **Variables and units**: heat `Q` [J]; cooling power `Q/τ` [W]; radiogenic power [W]; stress/activity [0..1]; uplift `Δh` [m]; injected CO₂ [kg].
- **Limits**: trigger statistics, magma transport and isostasy are not modeled.
- **Validation method**: exponential heat decay against `Q/τ`, bounded stress/activity, exact CO₂ mass injection.
- **Reliability**: **Low** for spatial geology; **High** for bookkeeping identities.

### 1.8 Erosion — `APPROXIMATION`

- **Source**: `geology/SurfaceEvolution.ts`.
- **Description**: pairwise diffusive elevation exchange on a wrapped latitude-weighted grid.
- **Assumptions**: prescribed rate `1e-11 /s`; each undirected edge visited once; optional water factor in `[0, 2]`; exchange fraction ≤ 0.25.
- **Variables and units**: transport elevation `h*` [m] (`Float64Array`, authoritative); public `h` [m] (`Float32Array` view); cell area `A_i` [m²]; transferred volume `V` [m³]; `A_i Δh_i + A_j Δh_j = 0`.
- **Limits**: no explicit fluvial network, sediment size sorting or deposition threshold.
- **Validation method**: per-step balance, mass = volume × crust density, 1/100/1000/mixed-cycle drift, exact `h = fround(h*)`.
- **Reliability**: **High** for volume conservation; **Medium** for prescribed transport.

### 1.9 Local climate — `APPROXIMATION`

- **Source**: `climate/*`.
- **Description**: daily-mean irradiance, dry lapse rate, humidity proxy and bounded insolation anomaly.
- **Assumptions**: daily averaging; no local energy-balance solution; temperature anomaly is a log proxy.
- **Variables and units**: latitude `φ` [rad]; declination `δ` [rad]; irradiance [W/m²]; gravity `g` [m/s²]; lapse rate `g/cp` [K/m]; elevation above sea [m]; relative humidity [0..1]; temperature [K].
- **Limits**: no advective solve, clouds, boundary layer or land-surface energy budget.
- **Validation method**: equinox/tilt zenith geometry, `g/cp ≈ 0.009763 K/m`, lapse-rate reference drop.
- **Reliability**: **Medium** for the geometric/ lapse parts; **Low** for the anomaly proxy.

### 1.10 Water cycle — `SIMULATION_HEURISTIC`

- **Source**: `hydrology/WaterCycle.ts`, `Inventory.ts`, `SeaLevel.ts`.
- **Description**: global reservoir transfers (evaporation, precipitation/condensation, runoff, ice) driven by climate and surface diagnostics.
- **Assumptions**: no cloud reservoir; condensation equals precipitation in one step; all fluxes aggregated into global reservoirs.
- **Variables and units**: ocean/ice/soil/vapor mass [kg]; fluxes [kg/step]; local diagnostics [m/year]; total water `W = m_o + m_i + m_s + m_v` [kg].
- **Limits**: no spatial soil moisture transport, local runoff routing or river discharge; see `SPATIAL_HYDROLOGY_PHASE1.md`.
- **Validation method**: exact transfer identities, dry-air mass invariance, water mirror, constant total across 20 steps.
- **Reliability**: **High** for mass closure; **Low** for geographic hydrology.

### 1.11 Drainage proxy — `SIMULATION_HEURISTIC`

- **Source**: `hydrology/Drainage.ts`.
- **Description**: D8 topographic accumulation and runoff fraction from slope.
- **Assumptions**: deterministic wrapped neighbours; precipitation is a stationary weight.
- **Variables and units**: slope [0..1]; runoff fraction [0..1]; `riverFlow` [proxy units, not m³/s].
- **Limits**: not a hydraulic solver and not transported water.
- **Validation method**: internal determinism and boundedness only; **no basin-discharge validation**.
- **Reliability**: **Low**.

### 1.12 Biome classifier — `SIMULATION_HEURISTIC`

- **Source**: `biomes/classifier.ts`, `stability.ts`.
- **Description**: continuous suitability scores plus engine-owned hysteresis/cooldown memory.
- **Assumptions**: no direct latitude rule; memory commits once per tick in row-major order.
- **Variables and units**: temperature [K], precipitation [m/year], humidity/soil/stability [0..1], elevation/sea level [m], slope [0..1]; hysteresis `0.15` [–], cooldown `8` ticks.
- **Limits**: suitability weights are heuristic; no biome-transition skill dataset.
- **Validation method**: score determinism, hysteresis margin, cooldown delay, monotonic memory ticks, access-order independence.
- **Reliability**: **Low** as Earth biome prediction; **High** as deterministic state machine.

### 1.13 Environment snapshot — `APPROXIMATION`

- **Source**: `snapshot/*`, `runtime/PlanetEngine.ts`.
- **Description**: immutable per-tick view used by consumers; samples are frozen defensive copies.
- **Assumptions**: memory view is frozen at construction; sampling never commits; engine commits memory once per tick.
- **Variables and units**: tick [–], time [s], sample fields inherit parent units and legacy `Cell` units.
- **Limits**: derived fields inherit their parent approximation; no cross-tick interpolation.
- **Validation method**: tick-10 vs tick-20 isolation, reverse access order, serialization/restore, store monotonicity.
- **Reliability**: **High** for isolation contract; parent-model reliability applies to values.

## 2. Water and memory contracts

`hydrosphere.vaporMassKg` is the only atmospheric water mass. `applyWaterFluxes`
moves mass surface → vapor (`evaporation`) and vapor → surface (`condensation`
= `precipitation`, because there is no cloud reservoir), then calls
`setAtmosphericWaterMassKg` so `atmosphere.composition.H2O` can never diverge
from the inventory. Dry-air mole counts are unchanged by hydrology; volcanic
CO₂ increases the atmospheric mass by exactly the injected mass.

`engine.getBiomeMemory()` returns a frozen read-only facade with no `set`,
`commit` or `clear`; `restoreBiomeMemory()` is the only explicit import path.
Snapshots retain frozen per-record views and call the same `decideBiome()`
helper as the runtime, but never write.

## 3. Time and revision contract

`PlanetEngine.step(deltaS)` is the single production clock. It increments
tick/time once and runs a deterministic scheduler: a subsystem runs when
`nextTick % intervalTicks === 0`, receiving its accumulated pending SI
duration. `stepGeology()` and `stepClimateHydrology()` are manual subsystem
helpers and never advance tick/time. `seek()` is derived-only orbital
inspection and does not replay stateful subsystems.

Independent revisions are now explicit in `getRuntimeDiagnostics()`:

| Revision | Bumped by | Never bumped by |
| --- | --- | --- |
| `stateRevision` | every state mutation | — |
| `surfaceRevision` | elevation/transport grid replacement | climate reads |
| `hydrologyRevision` | applied water transfers | climate reads |
| `geologyRevision` | applied geology transfers | climate reads |
| `climateRevision` | real climate invalidation only | plain time advance, water/geology in `step()` |

`climateUpdateCount` counts **actual recomputations**, not reads.
`climateRefreshCounts` and `lastClimateRefreshReason` distinguish `initial`,
`scheduled`, `forced` (manual water/geology changed a climate input), `seek`
(derived time jump) and `manual` (`refreshClimateField()`). Repeated
`getClimateField()` calls are cache hits. `refreshSurfaceField()` forces a
derived surface cache miss for benchmarking without mutating state.

## 4. Grid-area contract

`ElevationGrid.cellAreasM2` is authoritative:

`A(y) = R² · (2π/W) · [sin(π/2 − yπ/H) − sin(π/2 − (y+1)π/H)]`.

The areas telescope to exactly `4πR²`. Hypsometry, sea-level solve, erosion,
sediment mass and global water fluxes all use these per-cell areas. The scalar
`cellAreaM2` is only the arithmetic mean and must not be used for local mass
balances.

## 5. Validation status

Reference tests in `tests/planetEngineScience.test.ts` check independent
textbook values, plausible ranges and invariants — not just monotonicity:

| Quantity | Reference | Status |
| --- | --- | --- |
| Gravity | g = GM/R² ≈ 9.8203 m/s² | `PHYSICAL_MODEL` — validated |
| Orbital period / Kepler | ≈ 365.25 days; T² ∝ a³; r = a(1 ± e) | `PHYSICAL_MODEL` — validated |
| Rotation | phase wraps after one sidereal period; π/2 at quarter period | `PHYSICAL_MODEL` — validated |
| Insolation | ≈ 1361 W/m² at 1 AU; inverse-square with distance | `PHYSICAL_MODEL` — validated |
| Axial tilt | max declination = obliquity; zero tilt removes seasonality | `PHYSICAL_MODEL` — validated |
| Dry lapse rate | g/cp ≈ 0.009763 K/m | `PHYSICAL_MODEL` — validated |
| Pressure / gas inventory | p = m·g/A; 1 atm; Earth-like M̄ ≈ 28.97 g/mol | `PHYSICAL_MODEL` — validated |
| Greenhouse | 33 K reference; 6 ln 2 K per CO₂ doubling | `APPROXIMATION` — calibrated |
| Humidity | Magnus saturation ≈ 611 Pa at 273.15 K, ≈ 2.34 kPa at 293.15 K | `APPROXIMATION` — reference check |
| Water fluxes | total water and dry-air mass invariant; explicit reservoir deltas | `PHYSICAL_MODEL` — validated |
| Sea level | analytic two-level basin root; monotone with inventory | `PHYSICAL_MODEL` — solver validated |
| Interior heat | Q/τ cooling, bounded stress/activity | `SIMULATION_HEURISTIC` — bookkeeping validated |
| Erosion/deposition | transported mass = volume × crust density | `APPROXIMATION` — conservation validated |
| Biome memory | hysteresis margin and 8-tick cooldown | `SIMULATION_HEURISTIC` — state machine validated |

**Not validated / no reference dataset available:** local radiative-advective
temperature, spatial hydrology and river discharge, wind/circulation fields,
volcanic and tectonic trigger statistics, biome classification skill, and the
realistic Earth ocean fraction of the seeded hypsometric generator (~96.6% in
this config versus ~71% on Earth). Passing their internal tests is not a
physical validation claim.

## 6. Volume-conservation measurements

Transport uses `transportElevationM` (`Float64Array`), which is authoritative
for crustal volume. The public `elevationM` (`Float32Array`) is exactly its
`Math.fround` view; no spatial correction is applied. Each erosion step reports
`transportVolumeBalanceM3`, `transportVolumeToleranceM3` and
`quantizationResidualM3`. The tolerance is
`1e-12 × max(transportedVolume, |integratedBaselineVolume|)`, which covers
double-precision integration roundoff of a ~10¹⁸ m³ baseline without excusing
transport error.

Measured by `tests/planetEngineConservation.test.ts` (seed 7 unless noted,
`deltaS = 86400 s` unless noted):

| Scenario | Transferred volume [m³] | Max residual [m³] | Abs. drift [m³] | Rel. drift |
| --- | --- | --- | --- | --- |
| 1 cycle, 32×32 | 1.888099e11 | 1.563658e8 | 2.56e2 | 5.42e-16 |
| 100 cycles, 32×32 | 1.888019e13 | 1.921536e9 | 4.48e2 | 9.49e-16 |
| 1000 cycles, 32×32 | 1.887287e14 | 2.284523e9 | −4.48e2 | 9.49e-16 |
| 100 mixed cycles, 64×64, seed 11, ΔS ∈ {3600, 86400, 604800} | 3.977011e13 | 1.109870e9 | −1.664e3 | 2.46e-15 |

In every case the per-step balance is inside its own scale-based tolerance,
the cumulative drift is inside the sum of those budgets, transferred =
deposited, and `spatialMismatches = 0`. The negative initial volume is the
chosen elevation datum, not missing mass.

## 7. Headless benchmark measurements

Command: `npx vitest run --config vitest.bench.config.ts scripts/planetEngine.benchmark.ts`.
Run: Node `v22.14.0`, win32, seed `7`, `deltaS = 86400 s`, scheduler
climate/hydrology `1`, geology `30`, engine `0.1.1-audit`, snapshot version `1`,
64 cache-miss sample cells. Warmup 2 at 64/128 and 1 at 256/512/1024;
iterations init/step 6,5,4,3,2 and isolated phases 20,14,10,6,3.

Mean time [ms] (nearest-rank P50/P95 and full memory deltas are emitted as
`PLANET_ENGINE_BENCHMARK_JSON` by the benchmark):

| Grid | init | step | climate | hydrology | geology | surface | snapshot | sample |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 64² | 6.214 | 6.215 | 1.787 | 0.625 | 5.441 | 0.111 | 1.295 | 0.096 |
| 128² | 28.546 | 22.579 | 7.710 | 2.969 | 21.376 | 0.535 | 5.790 | 0.098 |
| 256² | 116.274 | 99.572 | 29.454 | 10.585 | 89.042 | 4.387 | 23.203 | 0.184 |
| 512² | 613.191 | 606.444 | 104.266 | 40.689 | 385.393 | 6.200 | 158.319 | 0.279 |
| 1024² | 3055.898 | 4110.148 | 642.216 | 364.644 | 1907.264 | 85.596 | 1256.761 | 0.401 |

At 1024² the corresponding throughputs are `686,264 cells/s` (init),
`510,238 cells/s` (step), `4,898,242 cells/s` (climate),
`8,626,838 cells/s` (hydrology), `1,649,340 cells/s` (geology),
`36,750,676 cells/s` (surface), `2,503,044 cells/s` (snapshot) and
`478,803 samples/s` (sample).

**Real limits**: CPU main thread only; no renderer, browser, GPU, GENOME or
main-simulation integration. Heap/RSS deltas are raw process indicators and GC
may occur inside a series. Large grids use few samples, so P50/P95 are coarse
nearest-rank quantiles; the 256² surface row has a visible GC outlier
(P95 31.094 ms). Phase-engine construction is excluded except in `init`.
These numbers are headless engine costs, not frame-time predictions.

## 8. Spatial hydrology status

The current engine does **not** claim spatial hydrology. The per-cell water
fields are diagnostics aggregated into global reservoirs; no local water
storage or basin routing exists. A detailed, independently testable first
milestone is specified in `SPATIAL_HYDROLOGY_PHASE1.md`. It is a proposal only:
no implementation, no interface change to consumers and no main-loop
integration is part of this patch.
