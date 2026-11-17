# E1 — Metriche osservazionali

**Branch:** `research/e1-ecosystem-qa`  
**Fase corrente:** E1.2 (E1.0/E1.1 archiviati in `E1_VALIDATION_REPORT_E1_0.md` e `E1_VALIDATION_REPORT_E1_1.md`)  
**Implementazione:** `tools/e1/metrics.ts` (`sampleState()`, `accumulate()`, `sampledGeneticDistance()`, `sampleGeneticPairs()`, `hash32()`, `E1TickEvents`)  
**Principio:** ogni metrica è calcolata **solo** da dati che il motore espone già: `World.getStats()`, `world.organisms`, `world.planet.peekCell()` e i genomi presenti negli organismi. Nessun valore viene inventato, stimato da modelli esterni o letto da campi privati del motore.

---

## 1. Sorgenti dati realmente disponibili

| Sorgente | Campi usati | Natura |
|---|---|---|
| `World.getStats()` | `tick`, `year`, `season`, `population`, `speciesCount`, `speciesAlive`, `speciesTotalEver`, `speciesExtinct`, `births`, `deaths`, `predationKills`, `averageGenome` | Statistiche calcolate dal motore una volta per tick. **`births/deaths/predationKills` sono per tick, non cumulativi** (`world.ts:286-305`). |
| `world.organisms` | `id`, `speciesId`, `position`, `energy`, `age`, `genome` (tratti base) | Stato individuale vivo. È l’unica fonte per conteggi per specie, energia, età e tratti. |
| `world.planet.peekCell(x, y)` | `vegetation`, `terrain` | Lettura read-only; restituisce la cella solo se il chunk è già materializzato, altrimenti `null`. **Non materializza chunk** (`planet.ts:282-299`). |
| `world.planet.sampleBaseline(x, y)` | `vegetation`, `terrain` | Baseline analitica senza materializzazione. Usata solo per scegliere le condizioni iniziali di S09/S10/S13/S14, su una **griglia campionata**, non per le serie temporali. |
| `shannonDiversityIndex()` | array di popolazioni per specie | Funzione pura già presente in `lib/biodiversity.ts:14-25`. |
| `geneticDistance(a, b)` | genomi di due organismi | Funzione pura già presente in `simulation/biology/genome.ts`. |

---

## 2. Definizioni operative

Sia \(N = |world.organisms|\) al momento del campionamento.

### 2.1 Popolazione

- **`population`** = \(N\). Coincide con `getStats().population`; l’harness usa direttamente l’array pubblico per poter contare anche subito dopo una perturbazione.
- **`speciesCounts`** = mappa `speciesId → conteggio`, ottenuta iterando gli organismi vivi.
- **`speciesAlive` / `speciesTotalEver` / `speciesExtinct`** = valori del registry esposti da `getStats()`. `speciesAlive` è il numero di specie con popolazione > 0; `speciesTotalEver` è il totale storico; `speciesExtinct` è il numero di specie estinte.

### 2.2 Biodiversità

- **Ricchezza osservata** \(S\) = numero di chiavi di `speciesCounts` con conteggio > 0.
- **Shannon** \(H = -\sum_i p_i \ln p_i\), con \(p_i = n_i / N\). Se \(N = 0\), \(H = 0\).
- **Evenness** \(J = H / \ln S\) se \(S > 1\), altrimenti \(J = 0\).

Interpretazione: \(H = 0\) indica una sola specie (o popolazione vuota); valori più alti indicano distribuzione più equilibrata. Non è un indicatore di “qualità ecologica” e non implica stabilità.

### 2.3 Natalità, mortalità, pressione predatoria

Per ogni tick \(t\):

- **`births`** = `getStats().births` al tick \(t\).
- **`deaths`** = `getStats().deaths` al tick \(t\). **Non include le uccisioni da predazione**, che il motore tiene in un contatore separato (`world.ts:283,302-303`).
- **`predationKills`** = `getStats().predationKills` al tick \(t\).
- **`populationAtStart`** = popolazione vivo all’inizio del passo, prima di `step()` e della perturbazione.
- **`populationAfterStep`** = popolazione dopo `step()`, prima dell’eventuale perturbazione.
- **`eventDenominator`** = `max(1, populationAtStart)`.
- **`birthRate`** = `births / eventDenominator`, **`deathRate`** = `deaths / eventDenominator`, **`predationPressure`** = `predationKills / eventDenominator`.

Il denominatore è coerente con il momento in cui gli eventi avvengono (durante lo step, sulla popolazione di partenza), **non** con la popolazione sopravvissuta al cull: usare quest’ultima farebbe apparire tassi artificialmente alti proprio nel tick della perturbazione. `population` resta lo stato **dopo** la perturbazione per compatibilità con E1.0/E1.1; `perturbationRemoved`/`perturbationKept` quantificano il salto.

L’harness accumula i tre contatori per tick in `cumulativeBirths`, `cumulativeDeaths`, `cumulativePredationKills`. `accumulate()` restituisce anche gli eventi del singolo tick (`E1TickEvents`): il runner li passa a `sampleState()` prima di eventuali perturbazioni, così i campioni al tick del cull conservano nascite/morti/uccisioni reali anche se il `World` viene ricostruito da snapshot (che azzera `lastStats`). I contatori cumulativi vivono invece nel runner, fuori dal `World`, e non possono essere azzerati dalla ricostruzione. **Non è possibile separare morte per fame da morte per vecchiaia** con i dati disponibili: servirebbe una modifica al motore, non eseguita.

### 2.4 Estinzioni

- **`extinctAt`** (nel risultato della corsa) = primo tick in cui `world.organisms.length === 0`; `null` se la popolazione sopravvive fino alla fine.
- **`speciesExtinct`** = conteggio storico fornito dal registry. Non viene inferito dalla scomparsa temporanea di una specie campionata.

### 2.5 Risorse ambientali

Le coordinate di ogni organismo vengono arrotondate e avvolte con lo stesso wrap toroidale di `Planet.peekCell()`. Per ogni organismo con cella materializzata leggiamo `vegetation` e `terrain`, ma la cella entra nel campione **una sola volta per coordinata geografica distinta**.

- **`organismsSampled`** = numero di organismi vivi per cui `peekCell()` ha restituito una cella (uno per organismo, anche se più organismi condividono la stessa cella).
- **`occupiedCellsSampled`** = numero di **celle geografiche distinte** con almeno un organismo campionato. È sempre ≤ `organismsSampled`.
- **`occupiedVegetation`** = media di `cell.vegetation` sulle `occupiedCellsSampled` celle distinte. Più organismi nella stessa cella non pesano due volte la media.
- **`occupiedLandFraction`** = frazione di quelle celle distinte con `terrain !== "ocean"`.

Se non esiste alcun organismo o nessuna cella materializzata, `organismsSampled = occupiedCellsSampled = 0` e le medie valgono `0`: non viene inventata vegetazione.

**Limite importante:** questa è una misura *occupata e condizionata*, non la vegetazione globale del pianeta. Man mano che la popolazione cala, vengono campionate meno celle; un aumento della media finale può riflettere il fatto che restano organismi solo in zone vegetate. Il motore non espone una griglia globale live senza materializzare chunk, quindi non possiamo calcolare uno stock totale di risorse. Nei report, i valori di vegetazione occupata vanno letti come **indicatori parziali**, non come prova di abbondanza o carenza globale.

### 2.6 Energia e età

- **`meanEnergy`** = media di `organism.energy`; **`energySd`** = deviazione standard della stessa distribuzione.
- **`meanAge`** = media di `organism.age` in tick (non in anni o generazioni).

Energia media alta con nascite nulle non dimostra “buona salute” dell’ecosistema: la riproduzione richiede anche compagno nel raggio 4, età ≥ maturità e tentativo stocastico (`reproduction.ts:77-140`).

### 2.7 Dieta e tratti ereditari

- **`carnivoreFraction`** = frazione di organismi con `genome.carnivory >= 0.35`, cioè la soglia usata dal motore per tentare la caccia (`predation.ts:12`).
- **`herbivoreFraction`** = frazione con `carnivory < 0.35`.
- **`meanCarnivory`, `meanSize`, `meanSpeed`, `meanMetabolism`, `meanVision`, `meanEvasion`, `meanHuntingSkill`** = medie dei corrispondenti campi del genoma base degli organismi vivi.

Queste medie sono descrittive della popolazione campionata. **Non dimostrano adattamento**: il cambiamento può derivare da deriva, mortalità differenziale o selezione, che con questi dati non sono separabili. I geni estesi (v2) non sono riassunti dalle metriche correnti; il report li tratta solo come “presenti ma non misurati direttamente”.

### 2.8 Distanza genetica

`meanGeneticDistance` è la media di `geneticDistance()` su coppie **uniche e ordinate per ID** (`i < j`): non esistono confronti di un organismo con sé stesso né coppie duplicate.

- `geneticPairsTotal` = numero di coppie disponibili \(N(N-1)/2\) sugli ID distinti.
- Se `pairsTotal <= 120`, vengono confrontate **tutte** le coppie (`geneticPairMethod = "all_pairs"`).
- Altrimenti vengono confrontate 120 coppie con `geneticPairMethod = "coprime_stride_sample"`: lo stride è il primo intero coprimo con `pairsTotal` vicino a `pairsTotal/120`, il punto di partenza è `hash32("genetic-pairs", tick, N, ...) mod pairsTotal`. Poiché lo stride è invertibile modulo `pairsTotal`, la sequenza non ha ripetizioni.
- L’hash FNV-1a a 32 bit dell’harness (`hash32`) è separato dall’RNG del mondo e non ne consuma lo stato.

**Limiti statistici:** il campione sistematico non è un campione aleatorio e non fornisce un intervallo di confidenza valido per la distanza media; può essere sensibile a periodicità nell’ordine degli ID (che qui sono monotonicamente crescenti alla nascita). La distanza è un proxy di divergenza intra-popolazione, non una misura di fitness né una prova di selezione. `geneticPairsSampled` dichiara sempre la copertura effettiva.

### 2.9 Perturbazioni e conteggi esatti

S08 usa una selezione **deterministica stratificata per specie** (`planPerturbation()`): per ogni specie viene riservato `ceil(n_species / 5)` sopravvissuti (ripartizione dei resti per maior remainder, tie-break su `speciesId`), poi gli organismi sono ordinati per `hash32(tick, speciesId, id)` e per ID. L’ordine dell’array, il genoma e l’RNG del motore non influenzano la scelta. Il report `perturbationReport` contiene `populationBefore`, `populationAfter`, `removed`, `kept`, `expectedKept` e i conteggi `perSpecies`; il runner verifica che rimossi + conservati = totale e che il mondo ricostruito abbia esattamente `kept` organismi.

### 2.10 Selezione spaziale degli habitat

S09/S10/S13/S14 scelgono le celle con `planet.sampleBaseline()` su una **griglia regolare campionata** con passo `max(2, floor(min(width,height)/32))`, scartando l’oceano e ordinando per vegetazione (tie-break sulle coordinate). I metadati `setupInfo.habitat` dichiarano `method`, `step`, `gridSamples`, `landCandidates`, `selectedCells` e `globalExtremesClaimed: false`. **Non vengono quindi identificate le celle globalmente più ricche o più povere**: servirebbe una scansione esaustiva che l’harness non esegue.

S13/S14 separano posizione e risorse: mantengono le posizioni di una griglia e sovrascrivono nello snapshot la vegetazione iniziale con i valori dell’altra griglia agli stessi indici. Il confronto 2×2 (`habitatComparison()`) calcola gli effetti di posizione a parità di vegetazione e gli effetti di risorsa a parità di posizione.

---

## 3. Cosa NON è misurabile con l’harness attuale

| Quantità | Motivo |
|---|---|
| Causa esatta di morte (fame vs vecchiaia) | `deaths` aggrega entrambe; servirebbe un contatore nel motore |
| Successo riproduttivo per genitore / per coppia | `getStats()` espone solo il totale per tick |
| Stock globale di vegetazione / nutrienti | `peekCell()` vede solo chunk materializzati; `getCell()` li creerebbe e altererebbe la memoria osservata |
| Competizione per specie | non esiste un evento osservabile “competizione”; è emergente dal pool condiviso |
| Apprendimento intra-vita | non implementato (`brain.ts:29-34`) |
| Evoluzione delle piante | `plantGenome.ts` è scollegato dalla simulazione |
| Perturbazioni climatiche esterne | nessun hook nel motore |
| Effetto fenotipico dei singoli geni estesi | non esposto nelle metriche correnti |

---

## 4. Tabella rapida campo → definizione

| Campo JSON | Unità | Formula / origine |
|---|---|---|
| `tick`, `year`, `season` | tick / anni / stagione | `getStats()` |
| `population` | individui | `len(organisms)` dopo l’eventuale perturbazione |
| `populationAtStart`, `populationAfterStep` | individui | popolazione a inizio tick / dopo `step()` prima del cull |
| `perturbationRemoved`, `perturbationKept` | individui | conteggi esatti del cull nel tick |
| `eventDenominator` | individui | `max(1, populationAtStart)` |
| `speciesCounts` | individui per `speciesId` | conteggio diretto |
| `shannon`, `evenness` | adimensionale | Shannon ed evenness sopra |
| `births`, `deaths`, `predationKills` | eventi/tick | `getStats()` (per tick) |
| `cumulativeBirths`, `cumulativeDeaths`, `cumulativePredationKills` | eventi assoluti | somma dei campi per tick |
| `birthRate`, `deathRate`, `predationPressure` | eventi/individuo/tick | conteggio / `eventDenominator` (pre-cull) |
| `meanEnergy`, `energySd` | energia | media e deviazione standard di `energy` |
| `meanAge` | tick | media di `age` |
| `carnivoreFraction`, `herbivoreFraction` | frazione | soglia `carnivory 0.35` |
| `mean*` (tratti) | valore del tratto | media del genome base |
| `organismsSampled` | individui | organismi con cella materializzata (uno per organismo) |
| `occupiedCellsSampled` | celle | coordinate geografiche distinte con organismo campionato |
| `occupiedVegetation` | 0..1 circa | media `peekCell().vegetation` sulle celle distinte |
| `occupiedLandFraction` | frazione | celle distinte non-ocean / celle distinte campionate |
| `meanGeneticDistance` | distanza | media su coppie uniche |
| `geneticPairsTotal`, `geneticPairsSampled` | coppie | disponibili / effettivamente confrontate |
| `geneticPairMethod` | metodo | `all_pairs` o `coprime_stride_sample` |

---

## 5. Reproducibilità

Ogni riga del JSON di output contiene `seed`, dimensioni del mondo, popolazione iniziale, `setup`, `setupInfo`, `perturbation`, `perturbationReport`, opzioni, tick completati, `extinctAt`, tempo trascorso e l’intera serie di campioni. Con gli stessi seed e gli stessi parametri d’ambiente, `tools/e1/runner.ts` produce la stessa serie; questo è verificato dai test in `tests/e1/e1_metrics.test.ts` e `tests/e1/e1_integration.test.ts`. `stripVariableData()` rimuove solo tempi/timestamp, permettendo il confronto byte-per-valore dell’output scientifico a parità di condizioni. La destinazione è risolta da `tools/e1/experiment.ts`: `E1_OUT` se impostato, altrimenti `join(tmpdir(), "e1-results.json")`; le directory mancanti vengono create.
