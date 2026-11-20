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
| Hypsometry (`surface/Hypsometry`, `surface/GridGeometry`) | `PHYSICAL_MODEL` | Exact latitude-weighted cell areas; ocean volume by hypsometric integral | Elevation fractal is a seeded terrain generator, not tectonic history |
| Geology (`geology/Interior`, `Tectonics`, `Volcanism`) | `SIMULATION_HEURISTIC` | Interior heat bookkeeping; volcanic CO₂ is injected into the gas inventory | Uplift/volcanic triggers are deterministic proxies |
| Erosion (`geology/SurfaceEvolution`) | `APPROXIMATION` | Volume removed = volume deposited; `AᵢΔhᵢ + AⱼΔhⱼ = 0` | Diffusive transport coefficient is prescribed |
| Local climate (`climate/*`) | `APPROXIMATION` | Irradiance from orbit/tilt/latitude; dry lapse rate g/cp is physical | Insolation→temperature anomaly is a bounded log proxy; temperature is **not** a local energy-balance solution |
| Water cycle (`hydrology/WaterCycle`, `Inventory`) | `SIMULATION_HEURISTIC` | Ocean + ice + soil + atmospheric vapor mass is conserved exactly per transfer | Global reservoirs only; no spatial soil moisture transport or cloud reservoir |
| Drainage (`hydrology/Drainage`) | `SIMULATION_HEURISTIC` | Deterministic D8 accumulation from elevation and precipitation | `riverFlow` is a topographic **proxy**, not transported water or a solved river |
| Biome classifier (`biomes/*`) | `SIMULATION_HEURISTIC` | Hysteresis memory is explicit and serializable | Continuous suitability scores are heuristic; no latitude threshold |
| Environment Snapshot (`snapshot/*`) | `APPROXIMATION` | Immutable view of one tick; legacy `Cell` units preserved | Derived sample fields are approximations of their parent subsystems |

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
inspection and does not replay stateful subsystems.

## Grid-area contract

`ElevationGrid.cellAreasM2` is authoritative:

`A(y) = R² · (2π/W) · [sin(π/2 − yπ/H) − sin(π/2 − (y+1)π/H)]`.

The areas telescope to exactly `4πR²`. Hypsometry, sea-level solve, erosion,
sediment mass and global water fluxes all use these per-cell areas. The scalar
`cellAreaM2` is only the arithmetic mean and must not be used for local mass
balances.
