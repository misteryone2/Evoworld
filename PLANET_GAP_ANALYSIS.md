# PLANET GAP ANALYSIS — EvoWorld Planet Engine

Analisi delle lacune rispetto alla missione Planet Engine. Ogni riga distingue ciò che esiste, ciò che è un surrogato e ciò che manca. Stati: `EXISTING_COMPLETE`, `EXISTING_NEEDS_EXTENSION`, `EXISTING_DEFECT`, `MISSING`, `BLOCKED`, `UNVERIFIED`.

## 1. Gap rispetto all'architettura richiesta

| Area richiesta | Stato odierno | Gap concreto | Priorità |
|---|---|---|---|
| 1. Planetary Core | MISSING / EXISTING_NEEDS_EXTENSION | Solo `PlanetConfig {width,height,seed,chunkSize}` (`types/index.ts:172-187`). Mancano massa, raggio fisico, gravità, rotazione fisica, inclinazione, orbita, stella, bilancio energetico. Il raggio in `simulation/core/scale.ts:10-14` è solo mapping render/collisione. | P0 |
| 2. Geology | MISSING | Elevazione fBm fissa (`terrainNoise.ts:77-88`); nessun nucleo/mantello/crosta, tettonica, vulcanismo, orogenesi, erosione, sedimentazione o eventi. | P1 |
| 3. Atmosphere | MISSING | Nessuna composizione, pressione, serra, circolazione o vento nel modello. Dome e fog sono solo rendering (`sky.ts:15-39`). | P0 |
| 4. Climate | EXISTING_NEEDS_EXTENSION | Latitudine/elevazione e sinusoide stagionale esistono (`seasons.ts:22-47`), ma senza irraggiamento, albedo, serra, umidità o precipitazioni. | P0 |
| 5. Hydrology | EXISTING_NEEDS_EXTENSION | Fiumi/laghi locali e `water` statico (`hydrology.ts:23-40,247-261`). Mancano livello mare, evaporazione, condensazione, precipitazione, flusso, drenaggio globale, bilancio idrico. | P0 |
| 6. Surface | EXISTING_NEEDS_EXTENSION | Continenti da fBm e classificazione `water>0.65`/`elev>0.75` (`terrainNoise.ts:77-103`). Mancano coastlines coerenti con il volume d'acqua, fondali fisici, feature geologiche, erosione della superficie. | P1 |
| 7. Biomes | EXISTING_COMPLETE nel set di regole / EXISTING_NEEDS_EXTENSION come modello emergente | Cinque biomi da tre soglie (`planet.ts:157-162`); non sono puramente latitudinali, ma non usano suolo, precipitazioni, variabilità stagionale o stabilità climatica. | P1 |
| 8. Planetary Dynamics | MISSING | Cambia solo vegetazione e, conseguentemente, il bioma (`planet.ts:355-369`). Non cambiano elevazione, oceani, atmosfera, ghiacci o eventi. | P2 |

## 2. Gap di causalità

### 2.1 Catena attuale

```text
seed -> elevazione(fBm)
seed -> acqua(fBm) --(bias debole da elevazione)
elevazione -> temperatura(media annua)
acqua + idrologia locale -> disponibilità d'acqua
temperatura + disponibilità + fertilità hash -> vegetazione
temperatura + disponibilità + vegetazione -> bioma
tick -> offset stagionale -> temperatura corrente
```

### 2.2 Catena target

```text
massa + raggio -> gravità
stella + orbita + inclinazione + rotazione -> irraggiamento locale/orario/stagionale
gravità + atmosfera(composizione, pressione) -> serra + lapse rate -> temperatura
temperatura + irraggiamento -> evaporazione -> umidità -> precipitazione
precipitazione - evaporazione -> runoff -> fiumi/drenaggio -> oceani/laghi/ghiaccio
inventario idrico + ipsometria -> livello del mare -> ocean mask/coastline
tettonica + vulcanismo -> elevazione + CO2/aerosol -> clima
elevazione + pendenza + clima + acqua -> erosione/sedimentazione -> suolo
temperatura + precipitazione + umidità + altitudine + suolo + stabilità -> biomi
eventi geologici/climatici -> modifica degli stati -> migrazione dei biomi
```

### 2.3 Parametri indipendenti da eliminare o subordinare

| Parametro oggi indipendente | Dipendenza target |
|---|---|
| `water` fBm separato | inventario idrico + precipitazioni + drenaggio + topografia |
| soglia oceano `water > 0.65` | livello del mare calcolato dall'inventario idrico e dall'ipsometria |
| temperatura `32 - lat*40 - elev*10` | bilancio radiative: irraggiamento, albedo, serra, lapse rate |
| offset stagionale fisso `12` | inclinazione assiale + fase orbitale + inerzia termica |
| fertilità hash | suolo derivato da erosione, sedimentazione e attività geologica |
| vento visivo `CLOUD_WIND=0.12` | gradiente di pressione + rotazione + circolazione atmosferica |
| sole visivo fisso | orbita + inclinazione + rotazione |
| bioma da soglie fisse | campi continui di idoneità climatica/ecologica |

## 3. Gap tra tag di realismo

| Tag | Stato repository | Nota |
|---|---|---|
| PHYSICAL_MODEL | MISSING | Non sono state trovate leggi di conservazione, unità SI o equazioni radiative complete. |
| APPROXIMATION | Presente | Gradiente latitudinale, sinusoide stagionale, idrologia locale, fitnes biologica. |
| SIMULATION_HEURISTIC | Presente e dominante | fBm, growth factors, soglie biome, regrowth, chunk activity. |
| VISUAL_EFFECT | Presente e separato | Colori, onde, nuvole, sky dome, tone mapping, shadow disc, rotazione automatica. |

Il rischio principale non è l'assenza di approssimazioni, ma che alcune approssimazioni siano documentate come se fossero modelli fisici. Ogni nuovo modulo dovrà dichiarare esplicitamente il proprio tag nel file sorgente.

## 4. Gap di interfaccia con GENOME

- Il confine biologico reale è `environmentalFitness(genome, cell)` in `simulation/biology/environment.ts:56-70`, che legge solo `temperature`, `water`, `seasonalOffset` e `elevation`.
- Non esiste un contratto `EnvironmentSnapshot` (`MISSING`).
- Per non modificare GENOME, il Planet Engine deve produrre un adapter che restituisca un oggetto strutturalmente compatibile con `Cell` per quei campi, più campi addizionali opzionali.
- `water` per fitness deve restare l'asse grezzo `[0,1]` usato oggi, non `waterAvailability`, altrimenti i trait `preferredWater/waterTolerance` cambierebbero significato.
- `temperature` deve restare nell'unità arbitraria centrata su 20 usata da `types/index.ts:144`, anche se internamente il motore usa Kelvin: la conversione va fatta nell'adapter.

## 5. Gap di rendering

| Funzione visiva | Stato | Gap |
|---|---|---|
| Colore biome/elevazione | EXISTING_COMPLETE | Guadagno: usare campi climatici reali invece della sola vegetation. |
| Displacement heightmap | EXISTING_COMPLETE | Guadagno: elevation fisica in metri convertita in unità render, non fBm 0..1. |
| Oceano | EXISTING_DEFECT | Sfera a raggio fisso; manca livello mare simulato e canale `water`/`seaLevel`. |
| Nuvole | EXISTING_DEFECT | Sprite indipendenti; manca umidità/vento/temperatura. |
| Atmosfera | MISSING oltre il cosmetico | Mancano scattering, spessore ottico, colore da composizione. |
| Sole/terminator | MISSING | Luce fissa; manca giorno/notte, inclinazione, fase orbitale. |
| Ghiacci | EXISTING_NEEDS_EXTENSION | Tinta da temperatura; manca massa di ghiaccio e feedback albedo. |
| Viewport protocol | EXISTING_NEEDS_EXTENSION | Manca correlation id; rischio frame obsoleti. |

## 6. Gap di persistence e performance

- Snapshot chunk-based esiste, ma non ha `schemaVersion` e non è testato end-to-end su save→load→step (`UNVERIFIED`).
- `Cell.seasonalOffset`, `riverFlow`, `isLake` vengono persistiti; i nuovi campi fisici dovranno essere persistiti solo se dinamici, altrimenti derivati da config+seed.
- Non esiste eviction dei chunk (`MISSING`): la memoria cresce con l'esplorazione.
- `requestViewport` non ha id di correlazione (`EXISTING_NEEDS_EXTENSION`).
- Non esistono misure di `buildViewportFrame`, latenza worker, upload GPU o FPS reali (`UNVERIFIED`/`BLOCKED`).

## 7. Priorizzazione

### P0 — Fondamenta causali, senza toccare rendering o GENOME

1. Definire contratti e unità del Planet Engine.
2. Implementare Planetary Core determinista: massa, raggio, gravità, rotazione, orbita, stella.
3. Implementare bilancio energetico e irradiamento come funzione di tempo/latitudine.
4. Aggiungere test di invarianza: gravità, periodo orbitale, insolazione, energia.

### P1 — Superficie, atmosfera, idrosfera, biomi

5. Ipsometria e livello del mare da inventario idrico.
6. Geologia base, erosione e sedimentazione come modificatori deterministici.
7. Atmosfera con composizione, pressione, serra e circolazione.
8. Ciclo idrologico e precipitazioni.
9. Classificatore biome emergente e adapter `Cell` compatibile.

### P2 — Dinamica e integrazione

10. Eventi geologici/climatici e migrazione biomi.
11. Estensione additiva di `ViewportFrame` e consumo lato renderer.
12. Snapshot versionato e test end-to-end.
13. Correlation id nel protocollo worker e gestione pending.

### P3 — Robustezze

14. Chunk eviction con LRU deterministico.
15. Misurazioni reali di viewport/worker/GPU e regressioni.
16. Documentazione completa PHYSICAL_MODEL/APPROXIMATION/HEURISTIC/VISUAL_EFFECT.

## 8. Non-goal espliciti

- Non riscrivere `simulation/biology/**` né i moduli GENOME/GRAFICA.
- Non sostituire Three.js con un altro renderer.
- Non risolvere in questa milestone la proiezione toroidale→sferica: è `BLOCKED` e richiederebbe una griglia sferica.
- Non introdurre parametri climatici indipendenti non derivati da stella/orbita/atmosfera/idrosfera.
- Non fare merge in `main` senza autorizzazione.
