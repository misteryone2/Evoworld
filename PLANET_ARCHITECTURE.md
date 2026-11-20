# PLANET ARCHITECTURE — EvoWorld Planet Engine

Architettura target del Planet Engine. Progetto indipendente dalla milestone GENOME: nessun modulo `simulation/biology/**`, `lib/anatomy/**`, `lib/phenotype/**` o `lib/visual/**` viene modificato.

## 1. Principi

1. **Un'unica sorgente di verità fisica**: i parametri derivati non vengono salvati come fatti indipendenti.
2. **Causalità esplicita**: ogni campo ha una dipendenza dichiarata; il grafo delle dipendenze è aciclico entro un tick.
3. **Separazione dei tag**: ogni modulo dichiara `PHYSICAL_MODEL`, `APPROXIMATION`, `SIMULATION_HEURISTIC` o `VISUAL_EFFECT`.
4. **Testabile senza rendering**: l'intero motore gira in Node senza alcun import DOM/React/Three.js.
5. **Compatibilità additiva**: il contratto verso la biologia resta `Cell`-compatibile; nuove informazioni viaggiano in canali opzionali.
6. **Determinismo seedato**: nessun `Math.random()`; flussi derivati dal seed per geology/clima/eventi.
7. **Incrementalità**: nuova radice `simulation/planetEngine/`; la vecchia `simulation/planet/` resta intatta finché l'adapter non è validato.

## 2. Struttura moduli target

```text
simulation/planetEngine/
  contracts.ts              tipi publici, unità, versione motore
  units.ts                  costanti fisiche e conversioni SI <-> unità legacy
  deterministic.ts          hash, hash2D, derived streams, rumore deterministico
  core/
    PlanetCore.ts           massa, raggio, gravità, rotazione, obliquità
    Orbit.ts                elemento orbitali, posizione stella, fase stagione
    Stellar.ts              luminosity, flux, spectral class
    EnergyBudget.ts         insolazione, albedo, bilancio radiative, serra
    invariants.ts           validazione relazioni fisiche
  geology/
    Interior.ts             nucleo, mantello, crosta, heat flow
    Tectonics.ts            placche, convergenza, orogenesi
    Volcanism.ts            eventi, CO2, aerosol
    SurfaceEvolution.ts     erosione, sedimentazione, pendenze
  atmosphere/
    Composition.ts          gas, pressione parziale, massa atmosferica
    Greenhouse.ts           spessore ottico, deltaT serra
    Circulation.ts          celle, venti, advection
  climate/
    Insolation.ts           irraggiamento locale/orario/stagionale
    TemperatureField.ts     temperatura superficiale e profilo verticale
    Humidity.ts             umidità relativa, evaporazione, condensa
    Precipitation.ts        precipitazione, variabilità stagionale
    ClimateZones.ts         zone climatiche continue
  hydrology/
    Inventory.ts            inventario idrico, ghiaccio, vapore
    SeaLevel.ts             livello mare da ipsometria e volume
    WaterCycle.ts           bilancio E-P-runoff
    Drainage.ts             drenaggio, fiumi, laghi, basin
  surface/
    Hypsometry.ts           distribuzione elevazioni, bucket volume
    Continents.ts           maschera terra/oceano coerente con sea level
    Coastlines.ts           coste e fondali
  biomes/
    classifier.ts           idoneità continua -> TerrainType
    stability.ts            memoria/stabilità e isteresi
  dynamics/
    events.ts               eventi deterministici con area/cooldown
    evolution.ts            evoluzione lenta di geologia/atmosfera/clima
  snapshot/
    EnvironmentSnapshot.ts  contratto stabile per GENOME/simulazione
    legacyAdapter.ts        conversione a Cell senza toccare biologia
    schema.ts               versione e validazione snapshot
  runtime/
    PlanetEngine.ts         facciata orchestratrice, tick/step
    chunkScheduler.ts       chunk ephemerali e cache di campi derivati
```

I file saranno introdotti solo nelle milestone che li richiedono: la struttura è un target, non una scrittura immediata di tutti i moduli.

## 3. Contratti publici

### 3.1 Configurazione fisica

```ts
export interface PlanetPhysicalConfig {
  schemaVersion: 1;
  seed: number;
  name?: string;
  massKg: number;
  radiusM: number;
  rotationPeriodS: number;
  axialTiltRad: number;
  orbit: {
    semiMajorAxisM: number;
    eccentricity: number;
    inclinationRad: number;
    meanAnomalyAtEpochRad: number;
    longitudeOfPeriapsisRad: number;
    epochS: number;
  };
  star: {
    luminosityW: number;
    effectiveTemperatureK: number;
    massKg: number;
  };
  interior: {
    coreRadiusFraction: number;
    mantleRadiusFraction: number;
    radiogenicHeatW: number;
    initialHeatJ: number;
  };
  atmosphere: {
    surfacePressurePa: number;
    composition: Partial<Record<GasKey, number>>; // frazioni molari, somma a 1
  };
  hydrosphere: {
    totalWaterKg: number;
    iceFraction: number;
  };
  surface: {
    gridWidth: number;
    gridHeight: number;
    oceanFloorDepthM: number;
    meanElevationM: number;
    roughnessM: number;
  };
}
```

### 3.2 Stato evoluto

```ts
export interface PlanetState {
  tick: number;
  timeS: number;
  orbitalMeanAnomalyRad: number;
  rotationPhaseRad: number;
  obliquityRad: number;
  interior: { heatJ: number; volcanicActivity: number; tectonicStress: number };
  atmosphere: { totalMassKg: number; composition: Record<GasKey, number>; opticalDepth: number };
  hydrosphere: { oceanMassKg: number; iceMassKg: number; vaporMassKg: number; seaLevelM: number };
  surface: { meanElevationM: number; sedimentMassKg: number };
  climate: { globalMeanTemperatureK: number; co2Ppm: number; albedo: number };
}
```

### 3.3 Campo ambientale locale

```ts
export interface EnvironmentSample {
  x: number;
  y: number;
  latRad: number;
  lonRad: number;
  elevationM: number;
  slope: number;
  temperatureK: number;
  pressurePa: number;
  humidity: number;          // 0..1
  precipitationMPerYear: number;
  soilMoisture: number;      // 0..1
  waterAvailability: number; // 0..1
  irradianceWm2: number;
  windMS: number;
  iceFraction: number;
  biome: TerrainType;
  climateStability: number;  // 0..1
  season: Season;
}
```

### 3.4 Environment Snapshot per GENOME

```ts
export interface EnvironmentSnapshot {
  version: 1;
  engineVersion: string;
  tick: number;
  timeS: number;
  gridWidth: number;
  gridHeight: number;
  season: Season;
  sample(x: number, y: number): EnvironmentSample;
  toLegacyCell(x: number, y: number): Cell; // compatibile con environmentalFitness
}
```

`toLegacyCell` preserva le semantiche attuali: `temperature` in unità arbitrarie centrate su 20, `water` come asse grezzo `[0,1]`, `elevation` `[0,1]`, `seasonalOffset` già incluso in `temperature`. Nessuna funzione in `simulation/biology/**` viene toccata.

## 4. Equazioni e modelli

### 4.1 Planetary Core — PHYSICAL_MODEL

```text
g = G * M / R^2
T_orbit = 2π * sqrt(a^3 / (G * (M_star + M)))
Ω = 2π / T_rotation
d = a * (1 - e^2) / (1 + e * cos(ν))
```

Costanti in `units.ts`: `G`, `SIGMA_SB`, `SPEED_OF_LIGHT` se servono. Conversioni legacy in `units.ts`: `legacyTemperatureFromKelvin(K)` e `elevation01FromMeters(m, range)`.

### 4.2 Irraggiamento — PHYSICAL_MODEL + APPROXIMATION

```text
S = L / (4π d^2)
δ = asin(sin(ε) * sin(λ))                 // declinazione, λ = longitudine orbitale
cosZ = sinφ sinδ + cosφ cosδ cos(H)        // zenit solare orario
Q = max(0, S * cosZ)                       // APPROXIMATION: nube/atmosfera separati dopo
```

Daily mean insolation può usare integrazione numerica deterministica su 24 passi orari, evitando dipendenze da `Math.sin` non controllate: le tabelle trigonometriche o l'arrotondamento controllato saranno definite in `deterministic.ts`.

### 4.3 Bilancio energetico — PHYSICAL_MODEL + APPROXIMATION

```text
T_eq = [S(1 - A) / (4σ)]^(1/4), dove S è il flux locale; equivalentemente [S_global(1 - A) / σ]^(1/4) con S_global = S/4
ΔT_greenhouse = k * ln(pCO2 / p_ref) + τ_other * k2   // APPROXIMATION logaritmica
T_surface = T_eq + ΔT_greenhouse
Γ_dry = g / cp                                        // PHYSICAL_MODEL
T(z) = T_surface - Γ_eff * z                           // APPROXIMATION: Γ_eff ridotto da umidità
```

Albedo `A` dipende da ocean/ice/land/snow/cloud; non è un parametro indipendente.

### 4.4 Atmosfera — APPROXIMATION

- Pressione da massa atmosferica e gravità: `p = m_atm * g / (4πR²)`.
- Composizione come frazioni molari; `p_gas = x_gas * p`.
- Serra da `pCO2`, `pH2O`, `pCH4` con coefficienti calibrati e documentati.
- Circolazione: celle Hadley/Ferrel/Polar come bande latitudinali; vento da gradiente di pressione corretto da Coriolis `f = 2Ω sinφ`. SIMULATION_HEURISTIC, non fluidodinamica.

### 4.5 Idrosfera e livello del mare — PHYSICAL_MODEL + APPROXIMATION

```text
V_ocean = (m_ocean / ρ_water) + V_ice_equivalent
SeaLevel = solution of ∫_{elev < h} (h - elev) dA = V_ocean
oceanMask = elevationM < SeaLevel
```

L'attuale soglia `water > 0.65` viene rimossa nel modello nuovo: diventa un confronto tra elevazione e livello mare calcolato. Fiumi/laghi evolvono da precipitazione, runoff e pendenza; il vecchio accumulo locale resta disponibile solo come fallback legacy.

### 4.6 Geologia — PHYSICAL_MODEL + SIMULATION_HEURISTIC

- Calore interno: decadimento radiogenico + raffreddamento;驱动 tectonic stress.
- Tettonica: celle con velocità deterministiche; convergenza genera uplift, divergenza genera subsidenza.
- Vulcanismo: probabilità da heat flow e stress; eventi immettono CO2/aerosol e modificano elevazione locale.
- Erosione: diffusione dell'elevazione proporzionale a runoff e pendenza; sedimentazione conserva massa.
- Tutti i cambiamenti sono incrementalmente applicati a `PlanetState`, non riscritti da noise puro a ogni tick.

### 4.7 Biommi emergenti

Il classificatore produce un punteggio continuo per ciascun bioma:

```text
score = f(T, P, RH, z, slope, soil, seasonality, stability)
biome = argmax(score) con isteresi e cooldown
```

Nessuna regola del tipo "latitudine < X => tundra"; la latitudine influenza solo irraggiamento e temperatura. `TerrainType` rimane il tipo legacy a sette valori per compatibilità.

## 5. Dipendenze tra moduli (grafo per tick)

```text
config + seed
   -> core/PlanetCore -> core/Orbit -> core/Stellar
   -> climate/Insolation
   -> atmosphere/Composition + Greenhouse -> climate/TemperatureField
   -> climate/Humidity + Precipitation
   -> hydrology/Inventory + SeaLevel + Drainage
   -> surface/Hypsometry + Continents + Coastlines
   -> geology/SurfaceEvolution (feedback su surface e sedimenti)
   -> biomes/classifier + stability
   -> snapshot/EnvironmentSnapshot -> legacyAdapter -> Cell
```

Il ciclo geologia↔clima↔idrosfera viene chiuso tramite eventi, ma entro un singolo `step` l'ordine è fisso e documentato: non si permettono aggiornamenti simultanei non deterministici.

## 6. Confine con la simulazione esistente

- `PlanetEngine.step()` è pura rispetto a `World`: riceve `tick`/`deltaS` e opzionalmente eventi, restituisce snapshot; non conosce organismi.
- L'adapter `legacyAdapter.toCell()` viene chiamato dal vecchio `Planet` solo dopo che il motore è attivo; per ora non viene collegato.
- I chunk restano il meccanismo di lazy evaluation: `chunkScheduler` calcola solo i campi richiesti da una regione e cachea i risultati derivati per chiave `(seed, engineVersion, chunkX, chunkY)`.
- Nessuna modifica a `types/index.ts` nella Fase 1: i nuovi tipi vivono in `planetEngine/contracts.ts` e vengono importati esplicitamente.

## 7. Rendering adapter

- `ViewportFrame` può essere esteso **solo in modo opzionale** con nuovi canali: `seaLevelM`, `humidity`, `precipitation`, `windU/V`, `iceFraction`, `irradiance`.
- Il renderer deve consumare questi canali attraverso le stesse funzioni di transfer existing in `lib/terrainColor.ts`; non deve calcolare clima autonomamente.
- Oceano: la sfera a raggio fisso sarà sostituita o mascherata dal confronto `elevationM < seaLevelM`; la decisione finale dopo misure visive.
- Nuvole: quantità/opacità/vento derivate da umidità e campi vento; il layout deterministico dei sprite resta un VISUAL_EFFECT.
- Sole: direzione calcolata da orbita+tilt+rotazione; il terminator resta l'illuminazione Lambert della superficie, non uno shader indipendente.

## 8. Persistence

```text
PlanetEngineSnapshot {
  schemaVersion: 2
  engineVersion: string
  config: PlanetPhysicalConfig
  state: PlanetState
  fields?: Record<string, Float32Array>  // solo campi dinamici, per chunk materializzati
  chunkLastActiveTick?: Record<string, number>
}
```

- Config, seed e campi statici non vengono serializzati: si ricalcolano.
- Stati dinamici (calore, composizione atmosferica, inventario idrico, sea level, sedimenti) vanno serializzati.
- Migration: `schemaVersion=1` è lo snapshot chunk-based attuale; conversione via `legacyAdapter`, senza sovrascrivere i vecchi salvataggi.

## 9. Determinismo

- Un solo seed radice; ogni sottosistema usa un flusso derivato con nome stabile (`hash(seed, "geology")`, ecc.).
- Nessun `Math.random()`; nessun ordering dependency tra chunk.
- Funzioni trigonometriche esposte tramite wrapper con arrotondamento controllato per ridurre le differenze Node 22/26 documentate in `E1_3_SCIENTIFIC_INTEGRITY_REPORT.md:84,131-134`.
- `engineVersion` e `schemaVersion` entrano in ogni snapshot e in ogni report di validazione.

## 10. Performance

- Lazy: campi costosi calcolati solo per chunk richiesti; cache per `(engineVersion, seed, chunk)`.
- Chunking: riuso del concetto `chunkSize=32`, ma con campi fisici invece delle celle legacy.
- LOD: il motore produce campi a risoluzione richiesta; la qualità resta una decisione del renderer.
- Simulation/render separation: `step()` non tocca Three.js e non posta messaggi.
- Nessun benchmark verrà dichiarato prima di essere misurato: vedere `PLANET_VALIDATION_PLAN.md`.

## 11. Stato dei tag per modulo target

| Modulo | Tag primario |
|---|---|
| core/PlanetCore, Orbit, Stellar, EnergyBudget | PHYSICAL_MODEL |
| climate/Insolation | PHYSICAL_MODEL + APPROXIMATION |
| atmosphere/Greenhouse, Circulation | APPROXIMATION |
| geology/Tectonics, Volcanism | SIMULATION_HEURISTIC con vincoli fisici |
| hydrology/SeaLevel | PHYSICAL_MODEL + APPROXIMATION |
| biomes/classifier | SIMULATION_HEURISTIC emergente |
| snapshot/EnvironmentSnapshot | contratto, non modello |
| rendering adapter | VISUAL_EFFECT |
