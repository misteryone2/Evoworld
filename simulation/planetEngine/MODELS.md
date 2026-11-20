# Planet Engine — model classification

This file is the technical classification referenced by `MODEL_CLASSIFICATION`
in `contracts.ts`. A tag describes what a subsystem may claim, not how much
code it contains. Engine version `0.1.1-audit` covers the M1–M4 corrections;
`EnvironmentSnapshot` remains external version 1 and its legacy `Cell` units
are unchanged.

| Subsystem | Tag | Conserved / derived quantities | Residual approximation |
| --- | --- | --- | --- |
| Orbital mechanics (`core/Orbit`, `core/Stellar`) | `PHYSICAL_MODEL` | Kepler solution; inverse-square flux | Two-body, fixed elements |
| Global energy budget (`core/EnergyBudget`) | `APPROXIMATION` | σT⁴ = S(1−A)/4; greenhouse increment added after equilibrium | Bond albedo and logarithmic CO₂/H₂O/CH₄ forcing are calibrated, not radiative-transfer solved |
| Gas inventory (`atmosphere/Composition`) | `PHYSICAL_MODEL` | Per-species mole counts; dry-air mass; water mass mirrored from `hydrosphere.vaporMassKg` | `other` is an inert N₂-like filler |
| Greenhouse (`atmosphere/Greenhouse`) | `APPROXIMATION` | Uses the same gas inventory as the energy budget | No spectral bands or clouds |
| Atmospheric circulation (`atmosphere/Circulation`) | `SIMULATION_HEURISTIC` | Coriolis f = 2Ωsinφ | Hadley/Ferrel/Polar bands and fixed gradient; **not** a dynamic atmosphere |
| Hypsometry (`surface/Hypsometry`, `surface/GridGeometry`, `surface/Continents`) | `PHYSICAL_MODEL` | Exact latitude-weighted cell areas; ocean volume by hypsometric integral; area-weighted ocean fraction | Elevation fractal is a seeded terrain generator, not tectonic history |
| Geology (`geology/Interior`, `Tectonics`, `Volcanism`) | `SIMULATION_HEURISTIC` | Interior heat bookkeeping; volcanic CO₂ is injected into the gas inventory | Uplift/volcanic triggers are deterministic proxies |
| Erosion (`geology/SurfaceEvolution`) | `APPROXIMATION` | Volume removed = volume deposited; `AᵢΔhᵢ + AⱼΔhⱼ = 0`; Float64 transport state carries the quantization residual | Diffusive transport coefficient is prescribed |
| Local climate (`climate/*`) | `APPROXIMATION` | Irradiance from orbit/tilt/latitude; dry lapse rate g/cp is physical | Insolation→temperature anomaly is a bounded log proxy; temperature is **not** a local energy-balance solution |
| Water cycle (`hydrology/WaterCycle`, `Inventory`) | `SIMULATION_HEURISTIC` | Ocean + ice + soil + atmospheric vapor mass is conserved exactly per transfer | Global reservoirs only; no spatial soil moisture transport or cloud reservoir |
| Drainage (`hydrology/Drainage`) | `SIMULATION_HEURISTIC` | Deterministic D8 accumulation from elevation and precipitation | `riverFlow` is a topographic **proxy**, not transported water or a solved river |
| Biome classifier (`biomes/*`) | `SIMULATION_HEURISTIC` | Hysteresis memory is explicit and serializable | Continuous suitability scores are heuristic; no latitude threshold |
| Environment Snapshot (`snapshot/*`) | `APPROXIMATION` | Immutable view of one tick; legacy `Cell` units preserved | Derived sample fields are approximations of their parent subsystems |

`VISUAL_EFFECT` is part of the shared `ModelTag` taxonomy but is deliberately
NOT assigned to any Planet Engine subsystem. Visual-only effects stay in the
untouched renderer G3.1 layer and are outside this headless engine's validation
claims.

## Water contract

`hydrosphere.vaporMassKg` is the only atmospheric water mass. `applyWaterFluxes`
moves mass surface → vapor (`evaporation`) and vapor → surface (`condensation`
= `precipitation`, because there is no cloud reservoir), then calls
`setAtmosphericWaterMassKg` so `atmosphere.composition.H2O` can never diverge
from the inventory. Dry-air mole counts are unchanged by hydrology; volcanic
CO₂ increases the atmospheric mass by exactly the injected mass.

## Spatial-hydrology limit

`soilMoisture`, `waterAvailability`, `precipitationMPerYear`,
`evaporationMPerYear`, `runoffMPerYear` and `riverFlow` are per-cell
**diagnostics**. Their masses are aggregated and applied to global reservoirs.
No per-cell water storage, no local runoff routing and no river discharge are
simulated. The engine does not claim spatial hydrology or drainage-basin
closure.

## Time contract

`PlanetEngine.step(deltaS)` is the single production clock. It increments
tick/time once and runs a deterministic scheduler: a subsystem runs when
`nextTick % intervalTicks === 0`, receiving its accumulated pending SI
duration. `stepGeology()` and `stepClimateHydrology()` are manual subsystem
helpers and never advance tick/time. `seek()` is derived-only orbital
inspection and does not replay stateful subsystems. Water, geology and general
state changes bump `stateRevision`; only the scheduler bumps `climateRevision`,
so the climate field is recomputed exactly at its configured tick. Snapshots
hold frozen read-only biome-memory views; the engine is the sole writer and
commits once per tick in row-major order with monotonic tick guards.

## Grid-area contract

`ElevationGrid.cellAreasM2` is authoritative:

`A(y) = R² · (2π/W) · [sin(π/2 − yπ/H) − sin(π/2 − (y+1)π/H)]`.

The areas telescope to exactly `4πR²`. Hypsometry, sea-level solve, erosion,
sediment mass and global water fluxes all use these per-cell areas. The scalar
`cellAreaM2` is only the arithmetic mean and must not be used for local mass
balances.

## Validation status

Reference tests in `tests/planetEngineScience.test.ts` check independent
textbook values, plausible ranges and invariants — not just monotonicity:

| Quantity | Reference | Status |
| --- | --- | --- |
| Gravity | g = GM/R² ≈ 9.8203 m/s² for the Earth-like config | `PHYSICAL_MODEL` — validated |
| Orbital period | ≈ 365.25 days; T² ∝ a³ | `PHYSICAL_MODEL` — validated |
| Insolation | ≈ 1361 W/m² at 1 AU; inverse-square with distance | `PHYSICAL_MODEL` — validated |
| Axial tilt | max declination = obliquity; zero tilt removes seasonality | `PHYSICAL_MODEL` — validated |
| Dry lapse rate | g/cp ≈ 0.009763 K/m | `PHYSICAL_MODEL` — validated |
| Pressure | p = m·g/A; 1 atm round-trip from the gas inventory | `PHYSICAL_MODEL` — validated |
| Global energy balance | σT⁴ = S(1−A)/4; T_eq ≈ 258 K; greenhouse ≈ 33 K | `APPROXIMATION` — balance validated, forcing calibrated |
| Water inventory | total mass constant across steps | `PHYSICAL_MODEL` — validated |
| Sea level | analytic two-level basin root; monotone with inventory | `PHYSICAL_MODEL` — solver validated |
| Erosion/deposition | transported mass = volume × crust density | `APPROXIMATION` — conservation validated, coefficient prescribed |

**Not validated / no reference dataset available:** local radiative-advective
temperature, spatial hydrology and river discharge, wind/circulation fields,
volcanic and tectonic trigger statistics, biome classification skill, and the
realistic Earth ocean fraction of the seeded hypsometric generator (~96.6% in
this config versus ~71% on Earth). These remain `APPROXIMATION` or
`SIMULATION_HEURISTIC`; passing their internal tests is not a physical
validation claim.

## Volume-conservation contract

Transport uses `transportElevationM` (`Float64Array`), which is authoritative
for crustal volume. The public `elevationM` (`Float32Array`) is exactly its
`Math.fround` view; no spatial correction is applied. Each erosion step reports
`transportVolumeBalanceM3`, `transportVolumeToleranceM3` and
`quantizationResidualM3`. The tolerance is
`1e-12 × max(transportedVolume, |integratedBaselineVolume|)`, which covers
double-precision integration roundoff of a ~10¹⁸ m³ baseline without excusing
transport error. Measured over 200–300 cycles at 16×16, 64×64 and 128×128,
cumulative transport drift stays below `1e-8` of cumulative transported volume,
while the Float32 diagnostic drift remains inside one step's quantization
envelope because the residual is carried forward in double precision.
