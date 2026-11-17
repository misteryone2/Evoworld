# E1 — Audit scientifico del motore (codice effettivamente eseguito)

**Data:** 2026-11-17  
**Branch:** `research/e1-ecosystem-qa` (da `main` @ `c35c287`)  
**Metodo:** lettura del codice + esecuzione headless di `World.step()` tramite harness indipendente (`tools/e1/`). Nessuna modifica al motore, alle regole, ai geni, al renderer o ai moduli altrui. I risultati numerici sono in `E1_VALIDATION_REPORT.md`.

---

## 1. Struttura del motore biologico

| Area | File | Ruolo |
|---|---|---|
| Core | `simulation/core/world.ts`, `constants.ts`, `random.ts`, `clock.ts` | Stato del mondo, ciclo di un tick, PRNG mulberry32, orologio |
| Biologia | `simulation/biology/organism.ts`, `energy.ts`, `genome.ts`, `brain.ts`, `environment.ts`, `gene*.ts` | Tratti, energia, genoma v1/v2, rete neurale, fitness ambientale |
| Ecologia | `simulation/ecology/behavior.ts`, `movement.ts`, `feeding.ts`, `predation.ts`, `collision.ts`, `spatialIndex.ts`, `terrain.ts`, `regionEcology.ts` | Sensi, movimento, alimentazione, predazione, spazialità |
| Evoluzione | `simulation/evolution/reproduction.ts`, `speciation.ts`, `speciesAnalysis.ts` | Riproduzione, mutazione, speciazione, estinzione, analisi |
| Pianeta | `simulation/planet/planet.ts`, `seasons.ts`, `terrainNoise.ts`, `hydrology.ts`, `chunkActivity.ts` | Terreno a chunk, vegetazione, stagioni, idrologia locale |

**Unico step:** `World.step()` (`world.ts:185-284`). Il worker lo chiama da un interval a 30 Hz; non esiste un modulo “headless” dedicato — l’headless è l’uso diretto di `new World(...).step()`, come negli harness qui realizzati.

### Ordine effettivo delle operazioni per tick

1. `tick++`; calcolo chunk attivi **prima** del movimento (`world.ts:192-199`) e aggiornamento pianeta.
2. Per ogni organismo vivo: `age++`, `-upkeepCost`, eventuale dispersal cost (disattivato di default), movimento con rete neurale e canali sensoriali (`world.ts:205-224`).
3. Collisioni (default attive) (`world.ts:227`).
4. Alimentazione vegetativa (`world.ts:230`).
5. Predazione (`world.ts:233`).
6. Morte per energia ≤ 0, età ≥ lifespan, eventuale rischio insediamento (disattivato), rimozione (`world.ts:237-265`).
7. Riproduzione + mutazione (`world.ts:268-269`).
8. Bookkeeping specie; speciazione ogni 200 tick; statistiche (`world.ts:272-283`).

Conseguenza: un animale ucciso dalla predazione in questo tick **ha già mangiato** nello stesso tick; i bucket spaziali usati per comportamento/caccia/accoppiamento sono costruiti sulle posizioni **pre-movimento**.

---

## 2. Mappa dei sistemi ecologici implementati

### 2.1 Energia e metabolismo — **implementato**
- `STARTING_ENERGY = 50` (`organism.ts:7`), `MAX_ENERGY = 150` (`energy.ts:5`), `UPKEEP_MULTIPLIER = 1` (`organism.ts:102`).
- `upkeepCost()` (`organism.ts:104-115`): termine convesso sulla carnivoria (`carnivory*0.08 + carnivory³*0.55`) + taglia/velocità/visione/evasione/abilità venatoria, moltiplicato per il metabolismo. I geni estesi possono modulare i costi.
- `dispersalCost()` (`organism.ts:171-185`, max 6 energia/tick) esiste ma è **disattivato di default** (`world.ts:110`).
- Non c’è conservazione globale dell’energia: l’energia entra dalla vegetazione e dal trasferimento predatorio, esce con i decessi (nessun detrito/decomposizione).

### 2.2 Alimentazione e risorse — **implementato**
- `ENERGY_PER_VEGETATION = 40`, `FEEDING_REGION_SIZE = 8`, `SUSTAINABLE_HARVEST_FRACTION = 0.085` (`feeding.ts:8,16,35-36`).
- Guida per cella: quota di vegetazione disponibile, limitata da una resa sostenibile regionale; guadagno moltiplicato per `environmentalFitness`, efficienza di insediamento e digestione; tetto `MAX_ENERGY × energyCapFactor` (`feeding.ts:194-218`).
- La vegetazione consumata viene depletata in modo distribuito sulle celle terrestriali della regione (`feeding.ts:230-239`) e ricresce verso un potenziale climatico (`planet.ts:357`).
- **Competizione** per le risorse è emergente (pool condiviso + throttle regionale), non un termine esplicito per specie.

### 2.3 Predazione — **implementato, con artefatti**
- Attaccano solo organismi con `carnivory ≥ 0.35`, energia < 110, probabilità `carnivory × 0.35` per tick; bersaglio vivo, nel raggio 4 (o a contatto), con carnivoria **strettamente minore** (`predation.ts:100-170`).
- Potenza = `size × speed × (1+huntingSkill) × ...`; difesa include `evasion` con cap; successo = `power/(power+defense)/(1+interference)` (`predation.ts:37-59,144-151`).
- Costo di tentativo = 12 energia, **non clampato a zero**; trasferimento = `min(55, target.energy + 30) × carnivory × digestionFactor` (`predation.ts:137,153-159`): un'uccisione può creare energia dal nulla (il bersaglio vuoto vale comunque +30).
- Interferenza usa conteggi su bucket potenzialmente più grandi del raggio di caccia reale.
- **Apice immunitario:** la carnivoria è limitata a 0.85 (`traitRanges.ts`), quindi i carnivori al top non possono essere predati: limite strutturale, non esito emergente.

### 2.4 Riproduzione, genetica, selezione — **implementato come selezione emergente**
- Idoneità: energia ≥ 130, età ≥ `lifespan × maturityFraction`, tentativo `rng.chance(fertility × 0.05)` (`reproduction.ts:77-98`).
- Compagno nel raggio 4 con distanza genetica ≤ 0.16; via asessuata al 15% (`reproduction.ts:103-140`). Costo 55 per genitore.
- Ereditarietà: blend + mutazione per tratti e per i 130 pesi del cervello; geni estesi ereditano con RNG derivato (`genome.ts:65-92`, `brain.ts:83-106`, `genomeExt.ts:84-115`).
- **Non esiste** un operatore di selezione fitness-proportionale: la selezione è differenziale sopravvivenza/riproduzione nel ciclo.
- Speciazione: k-means su gruppi geograficamente (≥4) e geneticamente (≥0.26) divergenti, popolazione ≥8, controllo ogni 200 tick (`speciation.ts:14-29,157-211`).

### 2.5 Mortalità — **implementato**
- `isDying()` = energia ≤ 0 oppure età ≥ lifespan (`organism.ts:118-122`). Predazione imposta `alive=false` separatamente.
- `getStats()` espone `deaths` e `predationKills` **per tick** come contatori separati (`world.ts:283,302-303`). Non è possibile distinguere fame da vecchiaia nei dati disponibili.

### 2.6 Ambiente, clima, pianeta — **implementato (stilizzato)**
- Terreno fBm deterministico da seed; ocean/elevation structure, fiumi/laghi come approssimazione locale O(1), non flow accumulation globale (`terrainNoise.ts`, `hydrology.ts`).
- Stagioni: offset sinusoidale escalato per latitudine, ampiezza fissa 12 °C, temperatura media `32 − lat×40 − elev×10 + noise×2` (`seasons.ts:22-47`).
- Vegetazione: potenziale da temperatura/acqua, ricrescita `0.005 × growthFactor × (potential − vegetation)` con fattore stagionale 0.3/1/1.6 (`planet.ts:30-36,357`).
- **Nessun evento catastrofico**, nessuna perturbazione climatica esogena, nessun detrito/nutrient recycling, nessuna evoluzione delle piante (`plantGenome.ts:1-14` è scollegato dalla simulazione).

### 2.7 Osservabilità — **parziale**
- `getStats()` fornisce popolazione, conteggi specie, nascite/morti/uccisioni per tick, genoma medio.
- `RenderFrame` fornisce array per organismo (posizione, specie, tratti, energia), statistiche specie, `avgVegetation` come scalare 32×32.
- `HistoryPoint` espone popolazione, specie, Shannon, carnivoria/taglia/vegetazione medie (`lib/historyAccumulation.ts`).
- **Non osservabile**: vegetazione viva fuori dai chunk occupati (`peekCell` restituisce null; le viste usano baseline), età/home/memoria/cervello nel frame, causa esatta di morte, nascite per genitore, eventi di competizione.

---

## 3. Distinzione richiesta: implementato / possibile / non supportato

| Dinamica | Stato | Base nel codice |
|---|---|---|
| Crescita sostenibile | **Teoricamente possibile ma non dimostrata**: la crescita è limitata da soglia energetica 130, resa regionale e ricerca compagno; negli esperimenti eseguiti la popolazione cala sempre dalle dimensioni iniziali | `reproduction.ts:77-98`, `feeding.ts:194-218` |
| Competizione per risorse | **Implementata** in forma emergente (pool vegetativo condiviso, depletion per domanda) | `feeding.ts:139-162,230-239` |
| Oscillazioni preda-predatore | **Non dimostrate**: si osserva un impulse iniziale di uccisioni poi un plateau; nessun ciclo sustain | `predation.ts:100-170`; risultati S06 |
| Estinzioni | **Implementate** e osservate (S07 in 2 tick); registry append-only | `speciation.ts:220-239` |
| Adattamento nel tempo | **Possibile** (mutazione + selezione emergente); deriva e selezione non separabili con i dati attuali | `genome.ts`, `brain.ts`; risultati S12 |
| Coesistenza tra specie | **Possibile e osservata** in S06 (2 specie, Shannon ~0.69); non garantita | `speciation.ts`, risultati S06/S12 |
| Biodiversità | **Misurabile** (Shannon); speciation osservata solo in 1 di 2 semi a 2700 tick | `lib/biodiversity.ts`, risultati S12 |
| Collassi ecologici | **Implementati** e osservati in tutti i run con popolazione iniziale alta | `world.ts`, risultati S01–S11 |
| Recupero dopo perturbazioni | **Non dimostrato** nei run S08: dopo cull 80% la popolazione resta a 3–5 individui senza nascite | risultati S08 |
| Piante evolventi | **Non supportato** dal codice | `plantGenome.ts:1-14` |
| Apprendimento intra-vita | **Non supportato** (esplicitamente escluso); memoria a uno slot | `brain.ts:29-34`, `behavior.ts:205` |
| Disastri/perturbazioni ambientali | **Non implementati** nel motore | assenza di hook in `simulation/**` |
| Selezione esplicita fitness-proportionale | **Non implementata** | assenza di operatore |

---

## 4. Anomalie e limiti rilevati

### 4.1 Rilevati nel codice (verificati per lettura)
1. **Spatial index non toroidale**: i bucket usano chiavi `bx,by` senza wrap (`spatialIndex.ts:15-17,26-37`) mentre `distanceWrapped()` è toroidale; i vicini attraverso il bordo vengono persi da comportamento, caccia e ricerca compagno.
2. **Raggio sensoriale > finestra di ricerca**: bucket 4 con scansione 3×3 copre ~±6 celle, ma `socialRadius` può arrivare a 15 e il raggio minaccia ~18.75 (`behavior.ts:42-44,111`).
3. **Depletion basata sulla domanda, non sul guadagno**: organismi con bassa fitness ambientale depletionano comunque il bene comune (`feeding.ts:194-239`).
4. **Carnivoria apicale**: cap 0.85 + bersaglio “strettamente minore” rende i superpredatori invulnerabili per costruzione.
5. **Tentativo di caccia può portare energia negativa** (costo 12 non clampato).
6. **Trasferimento energetico non conservativo** (`target.energy + 30`).
7. **Snapshot non conserva i flag sperimentali** (`World.fromSnapshot` forza dispersal/settlement off e collisions on, `world.ts:363-368`).
8. **Analisi specie materializza chunk** via `getCell` (`speciesAnalysis.ts:89`), in tensione con la garanzia di non-growth della render path.
9. **Costanti/DAO obsoleti**: `BRAIN_SIZE` documentato 119 ma effettivo 130; `MEMORY_DECAY_TICKS` e `MIN_REPRODUCTION_AGE_FRACTION` unused; test `vibeGenomeV1110` con asserzioni vuote.
10. **Soglia di distanza genetica V2 non ricalibrata** (0.16/0.26 effective ~0.22/0.35 in termini V1, `genome.ts:191-193`).

### 4.2 Rilevati con esperimenti (numeri nel report)
11. **Carnivori omogenei non cacciano**: S05 (tutti a carnivory 0.6) produce **0 uccisioni** in 900 tick, perché non esiste alcun bersaglio con carnivoria inferiore.
12. **Nessun recupero post-cull**: S08 passa da ~26 a ~5 individui al tick 450 e resta a 3–4 fino al 900, con 0–5 nascite cumulative: la soglia energetica 130 e la ricerca compagno nel raggio 4 creano un effetto Allee emergente.
13. **Predazione trasiente**: S06 accumula 36–39 uccisioni entro tick 100 e poi solo +1/+2 in 800 tick; non si osserva un ciclo preda-predatore sostenuto.
14. **Risorse non limitanti nei run brevi**: S02 (densa, scarsa) e S04 (erbivori) finiscono con vegetazione media **più alta** di quella iniziale (0.27→0.45, 0.26→0.30 circa), mentre la popolazione crolla: la mortalità dominates sulla carenza di risorse misurata.
15. **Speciazione rara e seed-dipendente**: a 2700 tick, seed 11 genera una seconda specie (Shannon 0.6581), seed 12 resta a una sola.
16. **Shadow death cause**: `deaths` aggrega fame e vecchiaia; non è separabile senza modificare il motore (non consentito).

---

## 5. Cosa NON è stato modificato

`simulation/**`, `types/**`, `package.json`, `tsconfig.json`, `vitest*.config.ts`, `components/**`, `app/**`, `docs/graphics/**`, moduli G1/G1-b, moduli G2 di anatomia/fenotipo, formati di salvataggio. Sono stati aggiunti solo `tools/e1/**`, `tests/e1/**`, `scripts/e1_ecosystem.experiment.ts` e documentazione in `docs/research/e1/**`.

Le proposte di modifica al motore che emergono dall’audit sono elencate in `E1_VALIDATION_REPORT.md` §7 **senza essere implementate**, come richiesto.
